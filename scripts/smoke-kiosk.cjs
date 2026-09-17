// Throwaway smoke script: exercises the kiosk lifecycle against a running API.
const crypto = require('crypto');
const API = process.env.SMOKE_API || 'http://127.0.0.1:8099';
const KIOSK_ID = process.env.SMOKE_KIOSK_ID || '01M2QB2V9XGWNFTT8YJXTTWHPP';
const DT = 'dev-kiosk-token-opd-a-2-replace-me';
const uuid = () => crypto.randomUUID();
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const post = (path, headers, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(j);

(async () => {
  const key1 = uuid();
  const open = await post('/api/v1/kiosk/sessions', { 'X-Kiosk-Id': KIOSK_ID, 'X-Kiosk-Token': DT, 'Idempotency-Key': key1 }, { locale: 'en-IN' });
  console.log('open:', { sessionId: !!open.sessionId, hasToken: !!open.token, ttl: open.ttlMinutes, kiosk: open.kiosk && open.kiosk.name });

  const replay = await post('/api/v1/kiosk/sessions', { 'X-Kiosk-Id': KIOSK_ID, 'X-Kiosk-Token': DT, 'Idempotency-Key': key1 }, { locale: 'en-IN' });
  console.log('replay same key -> same session:', replay.sessionId === open.sessionId);

  const conflict = await post('/api/v1/kiosk/sessions', { 'X-Kiosk-Id': KIOSK_ID, 'X-Kiosk-Token': DT, 'Idempotency-Key': key1 }, { locale: 'hi-IN' });
  console.log('same key, different payload:', conflict.error && conflict.error.code);

  const auth = { Authorization: 'Bearer ' + open.token };
  const guest = await post('/api/v1/kiosk/identity/start', { ...auth, 'Idempotency-Key': uuid() }, { sessionId: open.sessionId, method: 'GUEST' });
  console.log('guest:', { patientId: !!guest.patientId, provider: guest.providerName, verified: guest.verified });

  const versions = await fetch(API + '/api/v1/consent/versions?locale=en-IN').then(j);
  console.log('consent version:', versions.consentVersion, 'purposes:', versions.purposes.map((p) => p.key).join(','));

  const decisions = versions.purposes.map((p, i) => ({ purpose: p.key, granted: i < 2, categories: i < 2 ? p.categories : [] }));
  const consent = await post('/api/v1/kiosk/consent', { ...auth, 'Idempotency-Key': uuid() }, { sessionId: open.sessionId, patientId: guest.patientId, consentVersion: versions.consentVersion, locale: 'en-IN', method: 'TOUCH_CONFIRMED', decisions });
  console.log('partial consent:', { id: !!consent.id, decisions: consent.decisions.map((d) => d.purpose + '=' + d.granted).join(','), stopRequired: consent.stopRequired });

  const view = await fetch(API + '/api/v1/kiosk/sessions/' + open.sessionId, { headers: auth }).then(j);
  console.log('view:', { step: view.step, hasConsent: !!view.consent });

  const patched = await fetch(API + '/api/v1/kiosk/sessions/' + open.sessionId, { method: 'PATCH', headers: { ...auth, 'Idempotency-Key': uuid(), 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'hi-IN' }) }).then(j);
  console.log('locale switch:', { locale: patched.locale, consentLocalePreserved: patched.consent && patched.consent.locale, step: patched.step });

  const revoked = await post('/api/v1/consent/' + consent.id + '/revoke', { ...auth, 'Idempotency-Key': uuid() }, { reason: 'PATIENT_REQUEST' });
  console.log('revoke:', { revokedAt: !!revoked.revokedAt, stopRequired: revoked.stopRequired });

  const afterRevoke = await fetch(API + '/api/v1/kiosk/sessions/' + open.sessionId, { headers: auth }).then(j);
  console.log('view after revoke:', afterRevoke.step);

  const wipe = await post('/api/v1/kiosk/sessions/' + open.sessionId + '/wipe', { ...auth, 'Idempotency-Key': uuid() }, {});
  console.log('wipe:', wipe);

  const postWipe = await fetch(API + '/api/v1/kiosk/sessions/' + open.sessionId, { headers: auth }).then(j);
  console.log('view after wipe:', postWipe.error && postWipe.error.code);

  // OTP failure accounting on a second session
  const open2 = await post('/api/v1/kiosk/sessions', { 'X-Kiosk-Id': KIOSK_ID, 'X-Kiosk-Token': DT, 'Idempotency-Key': uuid() }, { locale: 'en-IN' });
  const auth2 = { Authorization: 'Bearer ' + open2.token };
  const chal = await post('/api/v1/kiosk/identity/start', { ...auth2, 'Idempotency-Key': uuid() }, { sessionId: open2.sessionId, method: 'ABHA_OTP' });
  let last;
  for (let i = 0; i < 6; i++) {
    last = await post('/api/v1/kiosk/identity/verify', { ...auth2, 'Idempotency-Key': uuid() }, { challengeId: chal.challengeId, otp: i === 5 ? '123456' : '00000' + i });
  }
  console.log('sixth OTP attempt with correct code after 5 failures:', last.error && last.error.code);

  const staffLogin = await post('/api/v1/auth/login', {}, { tenantSlug: 'demo-hospital', username: 'admin.patil', password: 'demo-pass-1234' });
  const staffWipe = await post('/api/v1/kiosk/sessions/' + open2.sessionId + '/wipe', { Authorization: 'Bearer ' + staffLogin.token, 'Idempotency-Key': uuid() }, {});
  console.log('staff wipe:', staffWipe);
})().catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
