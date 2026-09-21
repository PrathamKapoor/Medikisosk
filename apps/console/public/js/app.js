/**
 * MediKiosk console — vanilla router and screens for the doctor and admin workstations.
 *
 * No framework, no build step: hash routing, direct DOM rendering, and the API client in
 * api.js. Every server string is HTML-escaped at the render boundary (XSS). Status is always
 * communicated with an icon plus text, never colour alone. Buttons always do something real or
 * are absent — there are no placeholders.
 */

import { ApiError, downloadDocument, getToken, request, setToken } from "./api.js";
import { mountWaves } from "./waves.js";

const view = document.getElementById("view");
const userLabel = document.getElementById("user-label");
const logoutButton = document.getElementById("logout-button");
const apiStatus = document.getElementById("api-status");

let currentUser = null;
let queueTimer = 0;

/** Escape every server value at the render boundary. */
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]),
  );
}

function badge(text, kind) {
  return `<span class="badge ${kind}"><span aria-hidden="true">${badgeIcon(kind)}</span> ${esc(text)}</span>`;
}

function badgeIcon(kind) {
  switch (kind) {
    case "emergency":
    case "red":
    case "rejected":
      return "⬤";
    case "urgent":
    case "amber":
      return "◐";
    case "routine":
    case "green":
    case "verified":
      return "●";
    case "info":
      return "ℹ";
    default:
      return "○";
  }
}

function priorityKind(priority) {
  if (priority === "EMERGENCY") return "emergency";
  if (priority === "URGENT") return "urgent";
  return "routine";
}

function levelKind(level) {
  if (level === "RED") return "red";
  if (level === "AMBER") return "amber";
  return "green";
}

function verificationKind(state) {
  if (state === "VERIFIED") return "verified";
  if (state === "REJECTED") return "rejected";
  return "info";
}

function originKind(origin) {
  if (origin === "PATIENT_REPORTED") return "patient";
  if (origin === "DOCUMENT_DERIVED") return "document";
  if (origin === "CLINICIAN_ENTERED" || origin === "DOCTOR_AUTHORED") return "doctor";
  return "system";
}

function errorBox(error) {
  const message =
    error instanceof ApiError && error.serverMessage
      ? error.serverMessage
      : error instanceof ApiError && error.code === "NETWORK_FAILED"
        ? "The API could not be reached. Check the connection and retry."
        : "The request could not be completed. Retry — nothing was lost.";
  return `<div class="notice error" role="alert"><p>${esc(message)}</p></div>`;
}

function loadingRow(columns) {
  return `<tr><td colspan="${columns}"><span class="pending" role="status"><span class="loading-dot" aria-hidden="true"></span>Loading…</span></td></tr>`;
}

function emptyRow(columns, text) {
  return `<tr><td colspan="${columns}" class="muted">${esc(text)}</td></tr>`;
}

async function refreshApiStatus() {
  try {
    await request("/system/health");
    apiStatus.textContent = "API connected";
    apiStatus.className = "ok";
  } catch {
    apiStatus.textContent = "API unreachable";
    apiStatus.className = "bad";
  }
}

function setUser(user) {
  currentUser = user;
  userLabel.textContent = user
    ? `${user.displayName} (${user.roles.join(", ")})`
    : "";
  logoutButton.hidden = !user;
  document
    .querySelectorAll("[data-nav]")
    .forEach((link) =>
      link.classList.toggle(
        "active",
        user && `#/${link.dataset.nav}` === location.hash.split("?")[0],
      ),
    );
}

logoutButton.addEventListener("click", async () => {
  try {
    await request("/auth/logout", { method: "POST" });
  } catch {
    // Local session state is cleared regardless.
  }
  setToken(null);
  setUser(null);
  location.hash = "#/login";
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const routes = {
  "/login": renderLogin,
  "/queue": renderQueue,
  "/patients": renderPatients,
  "/admin": renderAdmin,
};

async function router() {
  window.clearInterval(queueTimer);
  queueTimer = 0;
  const raw = location.hash.replace(/^#/, "") || "/queue";
  const [path] = raw.split("?");
  view.innerHTML = "";
  view.focus({ preventScroll: true });

  if (path === "/login") {
    await renderLogin();
    setUser(null);
    return;
  }
  if (!getToken()) {
    location.hash = "#/login";
    return;
  }
  if (!currentUser) {
    try {
      const me = await request("/auth/me");
      setUser(me.user);
    } catch {
      setToken(null);
      location.hash = "#/login";
      return;
    }
  }

  if (path.startsWith("/case/")) {
    await renderCase(decodeURIComponent(path.slice("/case/".length)));
    return;
  }
  if (path.startsWith("/patient/")) {
    await renderPatient(decodeURIComponent(path.slice("/patient/".length)));
    return;
  }
  const render = routes[path];
  if (render) {
    setActiveNav(path);
    await render();
  } else {
    location.hash = "#/queue";
  }
}

function setActiveNav(path) {
  document
    .querySelectorAll("[data-nav]")
    .forEach((link) =>
      link.classList.toggle("active", `#/${link.dataset.nav}` === path),
    );
}

window.addEventListener("hashchange", () => void router());

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function renderLogin() {
  setActiveNav("");
  view.innerHTML = `
    <div class="login-wrap">
      <div class="waves-host" id="waves-host" aria-hidden="true"></div>
      <section class="card login-card" aria-labelledby="login-title">
        <p class="eyebrow">Staff only</p>
        <h1 id="login-title">Console sign in</h1>
        <p class="lead">Doctors, nurses, triage and administrators. Demo accounts are listed below.</p>
        <form id="login-form" autocomplete="off">
          <label for="tenant">Hospital</label>
          <input id="tenant" name="tenant" value="demo-hospital" required maxlength="64" />
          <label for="username">Username</label>
          <input id="username" name="username" required maxlength="64" autocomplete="username" />
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required maxlength="200" autocomplete="current-password" />
          <div id="login-error"></div>
          <button class="primary" type="submit">Sign in</button>
        </form>
        <details class="demo-accounts">
          <summary>Demo accounts (password: demo-pass-1234)</summary>
          <ul>
            <li><code>dr.rao</code> — physician, full clinical access</li>
            <li><code>nurse.mehta</code> — nurse</li>
            <li><code>triage.desk</code> — triage desk</li>
            <li><code>admin.patil</code> — administrator, aggregates only</li>
          </ul>
        </details>
      </section>
    </div>`;
  const dispose = mountWaves(document.getElementById("waves-host"));
  const form = document.getElementById("login-form");
  const errorBox_ = document.getElementById("login-error");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox_.innerHTML = "";
    const data = new FormData(form);
    try {
      const result = await request("/auth/login", {
        method: "POST",
        body: {
          tenantSlug: String(data.get("tenant")),
          username: String(data.get("username")),
          password: String(data.get("password")),
        },
      });
      setToken(result.token);
      setUser(result.user);
      location.hash = "#/queue";
    } catch (error) {
      errorBox_.innerHTML = errorBox(error);
    }
  });
  // Dispose the WebGL context when leaving the login screen.
  const disposeOnLeave = () => {
    dispose();
    window.removeEventListener("hashchange", disposeOnLeave);
  };
  window.addEventListener("hashchange", disposeOnLeave);
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

async function renderQueue() {
  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Triage queue</p>
        <h1>Waiting patients</h1>
      </div>
      <div class="page-actions">
        <button id="queue-refresh" class="text-button">Refresh now</button>
      </div>
    </div>
    <div id="queue-body"><table class="table"><tbody>${loadingRow(6)}</tbody></table></div>`;
  const body = document.getElementById("queue-body");
  document
    .getElementById("queue-refresh")
    .addEventListener("click", () => void loadQueue());

  async function loadQueue() {
    try {
      const data = await request("/queue");
      body.innerHTML = queueTable(data.entries);
      wireQueueActions(body);
    } catch (error) {
      body.innerHTML = errorBox(error);
    }
  }

  await loadQueue();
  queueTimer = window.setInterval(() => void loadQueue(), 15000);
}

function queueTable(entries) {
  if (entries.length === 0) {
    return `<table class="table"><tbody>${emptyRow(6, "The queue is empty. New kiosk submissions appear here.")}</tbody></table>`;
  }
  const rows = entries
    .map(
      (entry) => `
      <tr>
        <td class="token-cell">${esc(entry.tokenNumber ?? "—")}</td>
        <td>
          <a href="#/case/${esc(entry.encounter.id)}">${esc(entry.patient.fullName)}</a>
          <div class="muted">${entry.patient.ageYears ?? "?"} · ${esc(entry.patient.sex ?? "")}</div>
        </td>
        <td>${entry.encounter.chiefComplaintLabels.map(esc).join("; ")}</td>
        <td>${badge(entry.priority, priorityKind(entry.priority))}</td>
        <td>${entry.waitingMinutes} min<br /><span class="muted">${esc(entry.status.replace(/_/g, " ").toLowerCase())}</span></td>
        <td class="row-actions">
          ${entry.status === "WAITING" ? `<button data-action="call" data-id="${esc(entry.id)}">Call</button>` : ""}
          ${entry.status === "WAITING" || entry.status === "CALLED" ? `<button data-action="start" data-id="${esc(entry.id)}">Start visit</button>` : ""}
          ${entry.status !== "COMPLETED" && entry.status !== "CANCELLED" ? `<button data-action="cancel" data-id="${esc(entry.id)}">Cancel</button>` : ""}
        </td>
      </tr>`,
    )
    .join("");
  return `<table class="table">
    <thead><tr><th>Token</th><th>Patient</th><th>Complaint</th><th>Priority</th><th>Waiting</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function wireQueueActions(root) {
  root.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const action = button.dataset.action;
      const id = button.dataset.id;
      try {
        await request(`/queue/${encodeURIComponent(id)}/${action}`, {
          method: "POST",
        });
        await renderQueue();
      } catch (error) {
        root.insertAdjacentHTML("afterbegin", errorBox(error));
        button.disabled = false;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Case view
// ---------------------------------------------------------------------------

async function renderCase(encounterId) {
  view.innerHTML = `<table class="table"><tbody>${loadingRow(2)}</tbody></table>`;
  let kase;
  try {
    kase = await request(`/encounters/${encodeURIComponent(encounterId)}/case`);
  } catch (error) {
    view.innerHTML = errorBox(error);
    return;
  }

  const triage = kase.systemGenerated.triage;
  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Case ${esc(kase.queue?.tokenNumber ?? "")}</p>
        <h1>${esc(kase.patient.fullName)}</h1>
        <p class="muted">${kase.patient.ageYears ?? "?"} · ${esc(kase.patient.sex ?? "")} · ${esc(kase.patient.preferredLanguage)} · encounter ${esc(kase.encounter.id.slice(0, 8))}… · ${esc(kase.encounter.status)}</p>
      </div>
      <div class="page-actions">
        <a class="button-link" href="#/queue">Back to queue</a>
        <a class="button-link" href="#/patient/${esc(kase.patient.id)}">Patient record</a>
        <button id="fhir-export">FHIR demo export</button>
      </div>
    </div>
    <div id="case-alert"></div>
    ${triage && triage.level !== "GREEN" ? `<div class="notice priority" role="alert"><strong>Priority assessment — ${esc(triage.level)} · ${esc(triage.priority)}</strong><p>${esc(triage.explanation)}</p></div>` : ""}
    <div class="case-grid">
      <section class="card" aria-labelledby="h-reported">
        <h2 id="h-reported">Patient-reported information</h2>
        ${caseReported(kase)}
      </section>
      <section class="card" aria-labelledby="h-system">
        <h2 id="h-system">System-generated information</h2>
        ${caseSystem(kase)}
      </section>
      <section class="card" aria-labelledby="h-long">
        <h2 id="h-long">Longitudinal history</h2>
        ${caseLongitudinal(kase)}
      </section>
      <section class="card" aria-labelledby="h-doctor">
        <h2 id="h-doctor">Doctor-authored information</h2>
        ${caseDoctor(kase)}
      </section>
    </div>
    <section class="card" aria-labelledby="h-summary">
      <h2 id="h-summary">Clinical summary (deterministic draft)</h2>
      ${caseSummary(kase)}
    </section>`;

  wireCaseActions(kase);
}

function originBadge(origin) {
  const labels = {
    PATIENT_REPORTED: "Patient-reported",
    DOCUMENT_DERIVED: "Document-derived",
    CLINICIAN_ENTERED: "Doctor-verified",
    SYSTEM_DERIVED: "System-generated",
  };
  return badge(labels[origin] ?? origin, originKind(origin));
}

function caseReported(kase) {
  const reported = kase.patientReported;
  const complaint = kase.complaints.verbatim ?? kase.complaints.labels.join("; ");
  const symptoms =
    reported.symptoms.length === 0
      ? `<p class="muted">No symptoms recorded.</p>`
      : `<ul class="fact-list">${reported.symptoms
          .map(
            (s) => `<li>${esc(s.displayName)}${s.severity ? ` · ${esc(s.severity)}` : ""}${s.durationDays !== null && s.durationDays !== undefined ? ` · ${esc(s.durationDays)} days` : ""} ${originBadge(s.originClass)} ${badge(s.verificationState, verificationKind(s.verificationState))}</li>`,
          )
          .join("")}</ul>`;
  const conditions =
    reported.conditions.length === 0
      ? `<p class="muted">None recorded.</p>`
      : `<ul class="fact-list">${reported.conditions
          .map(
            (c) => `<li>[${esc(c.kind)}] ${esc(c.displayName)} ${originBadge(c.originClass)}</li>`,
          )
          .join("")}</ul>`;
  const medications =
    reported.medications.length === 0
      ? `<p class="muted">None recorded.</p>`
      : `<ul class="fact-list">${reported.medications
          .map(
            (m) => `<li>${esc(m.asWrittenName)}${m.frequency !== "UNKNOWN" ? ` · ${esc(m.frequency)}` : ""} ${originBadge(m.originClass)} ${badge(m.verificationState, verificationKind(m.verificationState))}</li>`,
          )
          .join("")}</ul>`;
  const allergies =
    reported.allergies.length === 0
      ? `<p class="muted">None recorded.</p>`
      : `<ul class="fact-list">${reported.allergies
          .map(
            (a) => `<li>${esc(a.freeTextName ?? a.conceptCode ?? "")}${a.reactionText ? ` — ${esc(a.reactionText)}` : ""} ${originBadge(a.originClass)}</li>`,
          )
          .join("")}</ul>`;
  const vitals =
    reported.vitals.length === 0
      ? `<p class="muted">None recorded.</p>`
      : `<table class="table compact"><thead><tr><th>Measurement</th><th>Value</th><th>Source</th><th>State</th></tr></thead><tbody>${reported.vitals
          .map(
            (v) => `<tr><td>${esc(v.display)}${v.componentCode ? ` (${esc(v.componentCode)})` : ""}</td><td>${esc(v.value)} ${esc(v.unit)}</td><td>${originBadge(v.originClass)}</td><td>${badge(v.verificationState, verificationKind(v.verificationState))}</td></tr>`,
          )
          .join("")}</tbody></table>`;
  const labs =
    reported.labs.length === 0
      ? `<p class="muted">None recorded.</p>`
      : `<table class="table compact"><thead><tr><th>Test</th><th>Value</th><th>Flag</th><th>State</th></tr></thead><tbody>${reported.labs
          .map(
            (l) => `<tr><td>${esc(l.display)}</td><td>${esc(l.value)} ${esc(l.unit)}</td><td>${badge(l.flag, l.flag === "NORMAL" ? "green" : "amber")}</td><td>${badge(l.verificationState, verificationKind(l.verificationState))}</td></tr>`,
          )
          .join("")}</tbody></table>`;
  return `
    <h3>Chief complaint</h3><p>${esc(complaint)}</p>
    <h3>Symptoms</h3>${symptoms}
    <h3>History</h3>${conditions}
    <h3>Medications</h3>${medications}
    <h3>Allergies</h3>${allergies}
    <h3>Vitals</h3>${vitals}
    <h3>Labs</h3>${labs}`;
}

function caseSystem(kase) {
  const system = kase.systemGenerated;
  const triage = system.triage;
  const signals = !triage
    ? `<p class="muted">No safety assessment recorded.</p>`
    : `${badge(`${triage.level} · ${triage.priority}`, levelKind(triage.level))}
       <p>${esc(triage.explanation)}</p>
       <ul class="fact-list">${triage.hits
         .map(
           (hit) => `<li><strong>${esc(hit.identifier)}</strong> — ${esc(hit.description)}<br /><span class="muted">${esc(hit.clinicalRationale)}</span></li>`,
         )
         .join("")}</ul>`;
  const documents =
    system.documents.length === 0
      ? `<p class="muted">No documents attached.</p>`
      : system.documents
          .map(
            (document) => `
        <div class="document-card">
          <strong>${esc(document.documentType)}</strong>
          <span class="muted"> — ${esc(document.status)}${document.demoExtraction ? " · demo extraction" : ""}</span>
          <button data-download="${esc(document.id)}" data-filename="${esc(document.documentType)}.txt">Download</button>
          ${document.entities
            .map(
              (entity) => `
            <div class="entity-row">
              <span>[${esc(entity.kind)}] ${esc(entity.rawText)} ${badge(entity.verificationState, verificationKind(entity.verificationState))}</span>
              <span class="row-actions">
                <button data-verify="${esc(entity.id)}" data-document="${esc(document.id)}" data-action="VERIFY">Verify</button>
                <button data-verify="${esc(entity.id)}" data-document="${esc(document.id)}" data-action="REJECT">Reject</button>
                <button data-edit="${esc(entity.id)}" data-document="${esc(document.id)}">Edit</button>
              </span>
            </div>`,
            )
            .join("")}
        </div>`,
          )
          .join("");
  const evidence =
    system.evidence.length === 0
      ? `<p class="muted">No evidence rows.</p>`
      : `<p class="muted">${system.evidence.length} evidence rows back every fact above; selected trace:</p>
         <ul class="fact-list">${system.evidence
           .slice(0, 8)
           .map(
             (e) => `<li>[${esc(e.type)}] ${esc(e.rawValue ?? "")} · confidence ${esc(e.confidence)} ${badge(e.verificationState, verificationKind(e.verificationState))}</li>`,
           )
           .join("")}</ul>`;
  return `<h3>Safety signals (attention signals, not diagnoses)</h3>${signals}<h3>Documents and extracted values</h3>${documents}<h3>Evidence trace</h3>${evidence}`;
}

function caseLongitudinal(kase) {
  const longitudinal = kase.longitudinal;
  const previous =
    longitudinal.previousEncounters.length === 0
      ? `<p class="muted">No previous encounters.</p>`
      : `<ul class="fact-list">${longitudinal.previousEncounters
          .map(
            (e) => `<li><a href="#/case/${esc(e.id)}">${esc(e.createdAt.slice(0, 10))}</a> — ${esc(e.status)}${e.disposition ? ` · ${esc(e.disposition)}` : ""} — ${e.complaints.map(esc).join(", ")}</li>`,
          )
          .join("")}</ul>`;
  const changes =
    longitudinal.changesSincePrevious.length === 0
      ? `<p class="muted">No changes detected against the previous encounter.</p>`
      : `<table class="table compact"><thead><tr><th>Change</th><th>Direction</th><th>Was</th><th>Now</th></tr></thead><tbody>${longitudinal.changesSincePrevious
          .map(
            (change) => `<tr><td>${esc(change.kind)}<br />${esc(change.label)}</td><td>${badge(change.direction, "info")}</td><td>${esc(change.previous ?? "—")}</td><td>${esc(change.current ?? "—")}</td></tr>`,
          )
          .join("")}</tbody></table>`;
  return `<h3>Previous encounters</h3>${previous}<h3>Changes since previous</h3>${changes}`;
}

function caseDoctor(kase) {
  const authored = kase.doctorAuthored;
  const notes =
    authored.notes.length === 0
      ? `<p class="muted">No notes yet.</p>`
      : `<ul class="fact-list">${authored.notes
          .map(
            (note) => `<li><strong>${esc(note.authorName)}</strong> · ${esc(note.createdAt)}<br />${esc(note.note)}</li>`,
          )
          .join("")}</ul>`;
  const diagnoses =
    authored.diagnoses.length === 0
      ? `<p class="muted">No diagnosis recorded.</p>`
      : `<ul class="fact-list">${authored.diagnoses
          .map(
            (d) => `<li>${esc(d.displayText)} (${esc(d.status)})${d.icd10Code ? ` · ${esc(d.icd10Code)}` : ""}</li>`,
          )
          .join("")}</ul>`;
  const completed = kase.encounter.status === "COMPLETED";
  return `
    <h3>Diagnoses (doctor-recorded only)</h3>${diagnoses}
    <h3>Notes</h3>${notes}
    <h3>Add a note</h3>
    <form id="note-form">
      <textarea id="note-text" rows="3" maxlength="4000" required placeholder="Clinical note — stored as doctor-authored"></textarea>
      <button class="primary" type="submit">Save note</button>
    </form>
    <h3>Record a diagnosis</h3>
    <form id="diagnosis-form" class="inline-form">
      <input id="diagnosis-text" maxlength="200" required placeholder="Diagnosis, e.g. Viral fever" />
      <input id="diagnosis-icd" maxlength="16" placeholder="ICD-10 (optional)" />
      <select id="diagnosis-status">
        <option value="PROVISIONAL">Provisional</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="RULED_OUT">Ruled out</option>
      </select>
      <button class="primary" type="submit">Record</button>
    </form>
    <h3>Disposition</h3>
    <form id="disposition-form" class="inline-form">
      <select id="disposition-value">
        <option value="">Current: ${esc(kase.encounter.disposition ?? "none")}</option>
        <option value="DISCHARGE_HOME">Discharge home</option>
        <option value="FOLLOW_UP_OPD">Follow-up OPD</option>
        <option value="REFER_SPECIALIST">Refer to specialist</option>
        <option value="REFERRED_EMERGENCY">Refer to emergency</option>
        <option value="ADMIT">Admit</option>
        <option value="OBSERVE">Observe</option>
      </select>
      <button class="primary" type="submit">Save disposition</button>
    </form>
    <h3>Complete encounter</h3>
    ${
      completed
        ? `<p class="muted">Completed${kase.encounter.completedAt ? ` at ${esc(kase.encounter.completedAt)}` : ""}.</p>`
        : `<button id="complete-button" class="primary">Complete encounter</button>`
    }`;
}

function caseSummary(kase) {
  const summary = kase.summary;
  if (!summary || summary.sections.length === 0)
    return `<p class="muted">No summary available.</p>`;
  return summary.sections
    .map(
      (section) => `
    <details class="summary-section" open>
      <summary>${esc(section.sectionKey.replace(/_/g, " "))} <span class="muted">[${esc(section.kind)}]</span></summary>
      <pre>${esc(section.text)}</pre>
    </details>`,
    )
    .join("");
}

function wireCaseActions(kase) {
  const alert = document.getElementById("case-alert");
  const encounterId = kase.encounter.id;
  const fail = (error) => {
    alert.innerHTML = errorBox(error);
    alert.scrollIntoView();
  };

  view.querySelectorAll("button[data-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await downloadDocument(button.dataset.download, button.dataset.filename);
      } catch (error) {
        fail(error);
      }
    });
  });

  view.querySelectorAll("button[data-verify]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await request(
          `/documents/${encodeURIComponent(button.dataset.document)}/entities/${encodeURIComponent(button.dataset.verify)}/verify`,
          { method: "POST", body: { action: button.dataset.action } },
        );
        await renderCase(encounterId);
      } catch (error) {
        fail(error);
        button.disabled = false;
      }
    });
  });

  view.querySelectorAll("button[data-edit]").forEach((button) => {
    button.addEventListener("click", async () => {
      const field = window.prompt(
        "Corrected value (name for medicines, number for labs/vitals):",
        "",
      );
      if (field === null) return;
      const corrected = {};
      if (/^-?\d+(\.\d+)?$/.test(field.trim())) corrected.value = Number(field.trim());
      else if (field.trim()) corrected.name = field.trim();
      else return;
      button.disabled = true;
      try {
        await request(
          `/documents/${encodeURIComponent(button.dataset.document)}/entities/${encodeURIComponent(button.dataset.edit)}/verify`,
          { method: "POST", body: { action: "EDIT", correctedJson: corrected } },
        );
        await renderCase(encounterId);
      } catch (error) {
        fail(error);
        button.disabled = false;
      }
    });
  });

  document.getElementById("note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = document.getElementById("note-text").value.trim();
    if (!text) return;
    try {
      await request(`/encounters/${encodeURIComponent(encounterId)}/notes`, {
        method: "POST",
        body: { note: text },
      });
      await renderCase(encounterId);
    } catch (error) {
      fail(error);
    }
  });

  document
    .getElementById("diagnosis-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const displayText = document.getElementById("diagnosis-text").value.trim();
      if (!displayText) return;
      const icd10Code = document.getElementById("diagnosis-icd").value.trim();
      const status = document.getElementById("diagnosis-status").value;
      try {
        await request(
          `/encounters/${encodeURIComponent(encounterId)}/diagnoses`,
          {
            method: "POST",
            body: {
              displayText,
              ...(icd10Code ? { icd10Code } : {}),
              status,
            },
          },
        );
        await renderCase(encounterId);
      } catch (error) {
        fail(error);
      }
    });

  document
    .getElementById("disposition-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const disposition = document.getElementById("disposition-value").value;
      if (!disposition) return;
      try {
        await request(
          `/encounters/${encodeURIComponent(encounterId)}/disposition`,
          { method: "POST", body: { disposition } },
        );
        await renderCase(encounterId);
      } catch (error) {
        fail(error);
      }
    });

  const completeButton = document.getElementById("complete-button");
  if (completeButton) {
    completeButton.addEventListener("click", async () => {
      if (!window.confirm("Complete this encounter? It joins the patient history."))
        return;
      try {
        await request(`/encounters/${encodeURIComponent(encounterId)}/complete`, {
          method: "POST",
        });
        await renderCase(encounterId);
      } catch (error) {
        fail(error);
      }
    });
  }

  document.getElementById("fhir-export").addEventListener("click", async () => {
    try {
      const exported = await request(
        `/encounters/${encodeURIComponent(encounterId)}/fhir`,
      );
      const blob = new Blob([JSON.stringify(exported.bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fhir-demo-${encounterId}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      fail(error);
    }
  });
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

async function renderPatients() {
  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Patient search</p>
        <h1>Find a patient</h1>
      </div>
    </div>
    <form id="search-form" class="inline-form" role="search">
      <input id="search-query" minlength="2" maxlength="120" required placeholder="Name, patient ID, guest ref or phone tail" />
      <button class="primary" type="submit">Search</button>
    </form>
    <div id="search-results"></div>`;
  const results = document.getElementById("search-results");
  document
    .getElementById("search-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = document.getElementById("search-query").value.trim();
      results.innerHTML = `<table class="table"><tbody>${loadingRow(4)}</tbody></table>`;
      try {
        const data = await request(`/patients?query=${encodeURIComponent(query)}`);
        if (data.patients.length === 0) {
          results.innerHTML = `<table class="table"><tbody>${emptyRow(4, "No patients found.")}</tbody></table>`;
          return;
        }
        results.innerHTML = `<table class="table">
          <thead><tr><th>Patient</th><th>Age · Sex</th><th>Visits</th><th>Last visit</th></tr></thead>
          <tbody>${data.patients
            .map(
              (patient) => `<tr>
                <td><a href="#/patient/${esc(patient.id)}">${esc(patient.fullName)}</a></td>
                <td>${patient.ageYears ?? "?"} · ${esc(patient.sex ?? "")}</td>
                <td>${esc(patient.encounterCount)}</td>
                <td>${esc(patient.lastEncounterAt ?? "—")}<br /><span class="muted">${esc(patient.lastEncounterStatus ?? "")}</span></td>
              </tr>`,
            )
            .join("")}</tbody></table>`;
      } catch (error) {
        results.innerHTML = errorBox(error);
      }
    });
}

async function renderPatient(patientId) {
  view.innerHTML = `<table class="table"><tbody>${loadingRow(2)}</tbody></table>`;
  let record;
  let timeline;
  try {
    [record, timeline] = await Promise.all([
      request(`/patients/${encodeURIComponent(patientId)}`),
      request(`/patients/${encodeURIComponent(patientId)}/timeline`),
    ]);
  } catch (error) {
    view.innerHTML = errorBox(error);
    return;
  }
  const groups = timeline.groups.filter(
    (group) => group.groupKey !== " __ungrouped__",
  );
  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Patient record</p>
        <h1>${esc(record.patient.fullName)}</h1>
        <p class="muted">${record.patient.ageYears ?? "?"} · ${esc(record.patient.sex ?? "")} · ${esc(record.patient.preferredLanguage)}${record.patient.district ? ` · ${esc(record.patient.district)}` : ""}</p>
      </div>
      <div class="page-actions"><a class="button-link" href="#/patients">Back to search</a></div>
    </div>
    <div class="case-grid">
      <section class="card" aria-labelledby="h-encounters">
        <h2 id="h-encounters">Encounters (${record.encounters.length})</h2>
        <table class="table compact">
          <thead><tr><th>Date</th><th>Status</th><th>Complaint</th><th></th></tr></thead>
          <tbody>${record.encounters
            .map(
              (encounter) => `<tr>
                <td>${esc((encounter.createdAt ?? "").slice(0, 10))}</td>
                <td>${badge(encounter.status.replace(/_/g, " ").toLowerCase(), "info")}</td>
                <td>${encounter.chiefComplaintLabels.map(esc).join("; ")}</td>
                <td><a href="#/case/${esc(encounter.id)}">Open</a></td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>
      </section>
      <section class="card" aria-labelledby="h-timeline">
        <h2 id="h-timeline">Timeline</h2>
        <ol class="timeline">
          ${timeline.events
            .map(
              (event) => `<li><strong>${esc(event.eventAt.slice(0, 16).replace("T", " "))}</strong> — ${esc(event.headline)} <span class="muted">[${esc(event.source.replace(/_/g, " ").toLowerCase())}]</span></li>`,
            )
            .join("")}
        </ol>
      </section>
    </div>
    <section class="card" aria-labelledby="h-compare">
      <h2 id="h-compare">Compare two encounters</h2>
      <form id="compare-form" class="inline-form">
        <select id="compare-previous">${record.encounters.map((e) => `<option value="${esc(e.id)}">${esc(e.createdAt.slice(0, 10))} — ${esc(e.status)}</option>`).join("")}</select>
        <select id="compare-current">${record.encounters.map((e) => `<option value="${esc(e.id)}">${esc(e.createdAt.slice(0, 10))} — ${esc(e.status)}</option>`).join("")}</select>
        <button class="primary" type="submit">Compare</button>
      </form>
      <div id="compare-results"></div>
    </section>`;
  void groups;
  document
    .getElementById("compare-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const previous = document.getElementById("compare-previous").value;
      const current = document.getElementById("compare-current").value;
      const results = document.getElementById("compare-results");
      results.innerHTML = `<p class="pending" role="status">Comparing…</p>`;
      try {
        const compared = await request(
          `/patients/${encodeURIComponent(patientId)}/compare?previous=${encodeURIComponent(previous)}&current=${encodeURIComponent(current)}`,
        );
        results.innerHTML =
          compared.changes.length === 0
            ? `<p class="muted">No changes detected.</p>`
            : `<table class="table compact"><thead><tr><th>Change</th><th>Direction</th><th>Was</th><th>Now</th></tr></thead><tbody>${compared.changes
                .map(
                  (change) => `<tr><td>${esc(change.kind)}<br />${esc(change.label)}</td><td>${badge(change.direction, "info")}</td><td>${esc(change.previous ?? "—")}</td><td>${esc(change.current ?? "—")}</td></tr>`,
                )
                .join("")}</tbody></table>`;
      } catch (error) {
        results.innerHTML = errorBox(error);
      }
    });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function renderAdmin() {
  view.innerHTML = `<table class="table"><tbody>${loadingRow(2)}</tbody></table>`;
  let overview = null;
  let overviewError = null;
  try {
    overview = await request("/admin/overview");
  } catch (error) {
    overviewError = error;
  }
  let kiosks = [];
  try {
    kiosks = (await request("/admin/kiosks")).kiosks;
  } catch {
    kiosks = [];
  }
  let health = null;
  try {
    health = await request("/system/health");
  } catch {
    health = null;
  }

  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">System administration</p>
        <h1>Overview</h1>
      </div>
    </div>
    ${overviewError ? `<div class="notice" role="status"><p>Aggregate metrics are unavailable to this role (${esc(overviewError.code)}). Kiosk, audit and health sections below show what is permitted.</p></div>` : ""}
    ${overview ? adminCards(overview) : ""}
    <div class="case-grid">
      <section class="card" aria-labelledby="h-kiosks">
        <h2 id="h-kiosks">Kiosk fleet</h2>
        <table class="table compact">
          <thead><tr><th>Kiosk</th><th>Status</th><th>Last seen</th><th>Version</th></tr></thead>
          <tbody>${kiosks
            .map(
              (kiosk) => `<tr>
                <td>${esc(kiosk.name)}<br /><span class="muted">${esc(kiosk.location ?? "")}</span></td>
                <td>${badge(kiosk.status, kiosk.status === "Online" ? "green" : kiosk.status === "Maintenance" ? "amber" : "info")}<br /><span class="muted">${esc(kiosk.statusNote ?? "")}</span></td>
                <td>${esc(kiosk.lastSeenAt ?? "never")}</td>
                <td>${esc(kiosk.softwareVersion ?? "")}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>
      </section>
      <section class="card" aria-labelledby="h-health">
        <h2 id="h-health">System health</h2>
        ${health ? `<ul class="fact-list">
          <li>API ${badge(health.checks.api, "green")}</li>
          <li>Database ${badge(health.checks.database, health.checks.database === "ok" ? "green" : "red")}</li>
          <li>Storage ${badge(health.checks.storage, health.checks.storage === "ok" ? "green" : "amber")}</li>
          <li>Document processor ${badge(health.checks.documentProcessor.status, "amber")}</li>
        </ul>` : `<p class="muted">Health probe unavailable.</p>`}
      </section>
    </div>
    <section class="card" aria-labelledby="h-audit">
      <h2 id="h-audit">Audit log</h2>
      <form id="audit-form" class="inline-form">
        <input id="audit-action" maxlength="64" placeholder="Filter by action (optional)" />
        <button class="primary" type="submit">Load</button>
      </form>
      <div id="audit-results"></div>
    </section>`;

  document
    .getElementById("audit-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const action = document.getElementById("audit-action").value.trim();
      const results = document.getElementById("audit-results");
      results.innerHTML = `<p class="pending" role="status">Loading…</p>`;
      try {
        const data = await request(
          `/admin/audit?limit=100${action ? `&action=${encodeURIComponent(action)}` : ""}`,
        );
        results.innerHTML =
          data.events.length === 0
            ? `<p class="muted">No audit events.</p>`
            : `<table class="table compact"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Result</th></tr></thead><tbody>${data.events
                .map(
                  (entry) => `<tr><td>${esc(entry.createdAt)}</td><td>${esc(entry.actorKind)}</td><td>${esc(entry.action)}</td><td>${esc(entry.result)}</td></tr>`,
                )
                .join("")}</tbody></table>`;
      } catch (error) {
        results.innerHTML = errorBox(error);
      }
    });
}

function adminCards(overview) {
  const card = (label, value) =>
    `<div class="metric-card"><span class="metric-value">${esc(value)}</span><span class="metric-label">${esc(label)}</span></div>`;
  const distribution = (entries) =>
    Object.entries(entries)
      .map(([key, value]) => `<li>${esc(key)}: ${esc(value)}</li>`)
      .join("");
  return `
    <p class="muted">Live from the database · demo data included · generated ${esc(overview.generatedAt)}</p>
    <div class="metrics">
      ${card("Patients today", overview.patientsToday)}
      ${card("Encounters today", overview.encountersToday)}
      ${card("Waiting", overview.waiting)}
      ${card("Urgent waiting", overview.urgentWaiting)}
      ${card("Completed today", overview.completedToday)}
      ${card("Red assessments today", overview.redAssessmentsToday)}
      ${card("Avg intake (min)", overview.averageIntakeMinutes ?? "—")}
    </div>
    <div class="case-grid">
      <section class="card"><h2>Languages today</h2><ul class="fact-list">${distribution(overview.languageDistribution)}</ul></section>
      <section class="card"><h2>Complaints today</h2><ul class="fact-list">${distribution(overview.complaintDistribution)}</ul></section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

await refreshApiStatus();
await router();
