// Throwaway Phase 3 smoke: drives the full interview journey against a live API.
// Mirrors services/api/src/interview/golden-case.test.ts over real HTTP.
const crypto = require('crypto');
const API = process.env.SMOKE_API || 'http://127.0.0.1:8099';
const DT = 'dev-kiosk-token-opd-a-2-replace-me';
const uuid = () => crypto.randomUUID();
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const post = (path, headers, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) }).then(j);
const get = (path, headers) => fetch(API + path, { headers }).then(j);

// Deterministic answers: the engine's own selection drives the loop; unknowns become UNKNOWN.
const ANSWERS = {
  'q.chest_pain.safety_dyspnoea': 'haan saans phool rahi hai',
  'q.chest_pain.safety_sweating': 'nahi',
  'q.chest_pain.safety_syncope': 'nahi',
  'q.chest_pain.safety_cardiac_history': 'nahi',
  'q.chest_pain.site': 'q.chest_pain.site.opt.left',
  'q.chest_pain.onset': '2 hours',
  'q.chest_pain.character': 'q.chest_pain.character.opt.pressure',
  'q.chest_pain.radiation': 'q.chest_pain.radiation.opt.left_arm',
  'q.chest_pain.associated': 'q.chest_pain.associated.opt.sweating',
  'q.chest_pain.timing': 'q.chest_pain.timing.opt.exertional',
  'q.chest_pain.severity': 'q.chest_pain.severity.opt.severe',
  'q.chest_pain.exertion': 'haan',
  'q.chest_pain.relief': 'q.chest_pain.relief.opt.rest',
  'q.history.medications': 'metformin',
  'q.history.allergies': 'nahi',
  'q.history.smoking': 'q.history.smoking.opt.never',
  'q.history.tobacco_chewing': 'q.history.tobacco_chewing.opt.never',
  'q.history.ros': 'q.history.ros.opt.fever; q.history.ros.opt.cough',
};

(async () => {
  const out = [];
  const kioskId = (await get('/health')).ok ? null : null; // kiosk id comes from env/seed; require it
  const ki = process.env.SMOKE_KIOSK_ID;
  if (!ki) throw new Error('SMOKE_KIOSK_ID required (select id from kiosks)');

  const session = await post('/api/v1/kiosk/sessions', { 'x-kiosk-id': ki, 'x-kiosk-token': DT, 'Idempotency-Key': uuid() }, { locale: 'en-IN' });
  if (!session.sessionId) throw new Error('session open failed: ' + JSON.stringify(session));
  out.push('session ' + session.sessionId.slice(0, 8));
  const auth = { Authorization: 'Bearer ' + session.token };

  const guest = await post('/api/v1/kiosk/identity/start', { ...auth, 'Idempotency-Key': uuid() }, { sessionId: session.sessionId, method: 'GUEST' });
  out.push('guest patient ' + String(guest.patientId).slice(0, 8));

  const versions = await get('/api/v1/consent/versions?locale=en-IN');
  const decisions = versions.purposes.map((p, i) => ({ purpose: p.key, granted: i === 0, categories: i === 0 ? p.categories : [] }));
  const consent = await post('/api/v1/kiosk/consent', { ...auth, 'Idempotency-Key': uuid() }, { sessionId: session.sessionId, patientId: guest.patientId, consentVersion: versions.consentVersion, locale: 'en-IN', method: 'TOUCH_CONFIRMED', decisions });
  if (!consent.id) throw new Error('consent failed: ' + JSON.stringify(consent));

  const created = await post('/api/v1/encounters', { ...auth, 'Idempotency-Key': uuid() }, { patientId: guest.patientId, sessionId: session.sessionId, encounterType: 'OPD', chiefComplaintCodes: ['MK-SYM-001'], chiefComplaintVerbatim: 'seene mein dard kal se', locale: 'en-IN' });
  if (!created.encounterId) throw new Error('encounter failed: ' + JSON.stringify(created));
  const encounterId = created.encounterId;
  out.push('encounter ' + encounterId.slice(0, 8) + ' pathways=' + created.activePathways.join('+'));

  const order = [];
  let completion = null;
  let safety = null;
  let guard = 0;
  for (;;) {
    const next = await get(`/api/v1/encounters/${encounterId}/interview/next`, auth);
    if (next.error) throw new Error('next failed: ' + JSON.stringify(next));
    safety = { safetyStatus: next.safetyStatus, requiresHumanReview: next.requiresHumanReview };
    if (next.question === null) { completion = next.completion; break; }
    const key = next.question.key;
    order.push(key);
    const answer = ANSWERS[key];
    const payload = answer === undefined
      ? { questionKey: key, state: 'UNKNOWN', modality: 'TOUCH' }
      : { questionKey: key, state: 'ANSWERED', rawAnswer: answer, modality: 'TOUCH' };
    const resp = await post(`/api/v1/encounters/${encounterId}/interview/response`, { ...auth, 'Idempotency-Key': uuid() }, payload);
    if (resp.error) throw new Error('response ' + key + ' failed: ' + JSON.stringify(resp));
    if (++guard > 60) throw new Error('did not terminate');
  }
  out.push('asked=' + order.length);
  out.push('first=' + order[0] + ' (expect q.chest_pain.safety_dyspnoea)');
  out.push('branch=' + (order.includes('q.chest_pain.exertion') ? 'present' : 'MISSING'));
  out.push('completion=' + JSON.stringify({ status: completion.status, maxQuestionsReached: completion.maxQuestionsReached, outstanding: completion.outstandingRequired.length }));
  out.push('safety=' + JSON.stringify(safety));

  const submit = await post(`/api/v1/encounters/${encounterId}/submit`, { ...auth, 'Idempotency-Key': uuid() }, {});
  if (submit.error) throw new Error('submit failed: ' + JSON.stringify(submit));
  out.push('submit=' + JSON.stringify({ status: submit.status, triageLevel: submit.triageLevel, priority: submit.priority, incomplete: submit.incomplete }));

  // DB reconstruction proof (read-only, in-process so no shell quoting esoterica).
  const Database = require('better-sqlite3');
  const dbPath = process.env.SMOKE_DB;
  if (!dbPath) throw new Error('SMOKE_DB required');
  const dbq = new Database(dbPath);
  const q = (sql) => dbq.prepare(sql).all();
  const responses = q(`select questionKey,state,rawAnswer from questionnaire_responses where encounterId='${encounterId}' order by askCount`);
  const evidence = q(`select id,type,source,originClass from evidence where encounterId='${encounterId}'`);
  const symptoms = q(`select conceptCode,severity from symptoms where encounterId='${encounterId}'`);
  const assessments = q(`select level,priority,hitsJson from triage_assessments where encounterId='${encounterId}' order by assessedAt desc`);
  dbq.close();
  out.push('db: responses=' + responses.length + ' evidence=' + evidence.length + ' symptoms=' + symptoms.map(s => s.conceptCode).join(','));
  out.push('db: evidence type ok=' + evidence.every(e => e.type === 'QUESTIONNAIRE_RESPONSE' && e.originClass === 'PATIENT_REPORTED'));
  out.push('db: latest assessment=' + JSON.stringify({ level: assessments[0] && assessments[0].level, red: assessments[0] && assessments[0].hitsJson.includes('CHEST_PAIN_HIGH_RISK_001') }));

  console.log(out.join('\n'));
})().catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });