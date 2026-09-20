import { useEffect, useState } from "react";
import type { RegistrationLocale } from "@medikiosk/i18n";
import {
  ApiError,
  type AllergyEntry,
  type HistoryEntry,
  type KioskApi,
  type MedicationEntry,
  type Review,
  type VitalEntry,
} from "./api";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

type Step =
  "hub" | "history" | "medications" | "allergies" | "vitals" | "documents";
const STEP_ORDER: Exclude<Step, "hub">[] = [
  "history",
  "medications",
  "allergies",
  "vitals",
  "documents",
];

const FREQUENCIES = [
  { value: "OD", labelKey: "details.freq_od" },
  { value: "BD", labelKey: "details.freq_bd" },
  { value: "TDS", labelKey: "details.freq_tds" },
  { value: "QID", labelKey: "details.freq_qid" },
  { value: "HS", labelKey: "details.freq_hs" },
  { value: "SOS", labelKey: "details.freq_sos" },
  { value: "UNKNOWN", labelKey: "details.freq_unknown" },
] as const;

const SEVERITIES = [
  { value: "MILD", labelKey: "severity.mild" },
  { value: "MODERATE", labelKey: "severity.moderate" },
  { value: "SEVERE", labelKey: "severity.severe" },
  { value: "UNKNOWN", labelKey: "severity.unknown" },
] as const;

const HISTORY_KINDS = [
  { value: "CONDITION", labelKey: "details.history_kind_condition" },
  { value: "SURGERY", labelKey: "details.history_kind_surgery" },
  { value: "FAMILY_HISTORY", labelKey: "details.history_kind_family" },
  { value: "HOSPITALISATION", labelKey: "details.history_kind_hospital" },
] as const;

const DOCUMENT_TYPES = [
  { value: "PRESCRIPTION", labelKey: "document.type.prescription" },
  { value: "LAB_REPORT", labelKey: "document.type.lab_report" },
  { value: "DISCHARGE_SUMMARY", labelKey: "document.type.discharge_summary" },
  { value: "MEDICAL_CERTIFICATE", labelKey: "document.type.certificate" },
  { value: "OTHER", labelKey: "document.type.other" },
] as const;

interface StepProps {
  encounterId: string;
  token: string;
  locale: RegistrationLocale;
  t: Translate;
  api: KioskApi;
  review: Review | null;
  onDone: () => void;
  onBack: () => void;
}

function errorMessage(t: Translate, cause: unknown): string {
  if (cause instanceof ApiError && cause.serverMessage)
    return t("details.vitals_server_error", { message: cause.serverMessage });
  return t("details.error");
}

function StepShell({
  title,
  lead,
  t,
  busy,
  error,
  onBack,
  onDone,
  doneLabel,
  children,
}: {
  title: string;
  lead: string;
  t: Translate;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onDone: () => void;
  doneLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="details-step">
      <h2>{title}</h2>
      <p className="lead">{lead}</p>
      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {children}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={onDone}>
          {doneLabel}
        </button>
        <button disabled={busy} onClick={onBack}>
          {t("details.back_to_steps")}
        </button>
      </div>
    </div>
  );
}

function HistoryStep(props: StepProps) {
  const { t, api, encounterId, token, review } = props;
  const [kind, setKind] = useState<HistoryEntry["kind"]>("CONDITION");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const displayName = name.trim();
    if (!displayName || busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsedYear = Number.parseInt(year, 10);
      await api.addHistory({
        encounterId,
        token,
        entries: [
          {
            kind,
            displayName,
            ...(Number.isFinite(parsedYear) ? { onsetYear: parsedYear } : {}),
          },
        ],
      });
      setName("");
      setYear("");
      await propsRefresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const propsRefresh = async () => {
    // The parent refreshes the review after each step closes; refresh here too so the list
    // reflects the server immediately.
    window.dispatchEvent(new CustomEvent("medikiosk:refresh-review"));
  };

  const remove = async (rowId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeClinicalEntry({
        encounterId,
        token,
        kind: "history",
        rowId,
      });
      await propsRefresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      title={t("details.history_title")}
      lead={t("details.history_lead")}
      t={t}
      busy={busy}
      error={error}
      onBack={props.onBack}
      onDone={props.onDone}
      doneLabel={t("details.history_done")}
    >
      <div className="form-row">
        <label htmlFor="history-kind">{t("details.history_name_label")}</label>
        <select
          id="history-kind"
          value={kind}
          disabled={busy}
          onChange={(event) =>
            setKind(event.target.value as HistoryEntry["kind"])
          }
        >
          {HISTORY_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <input
          value={name}
          disabled={busy}
          placeholder={t("details.history_name_placeholder")}
          aria-label={t("details.history_name_label")}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          value={year}
          disabled={busy}
          inputMode="numeric"
          placeholder={t("details.history_year_label")}
          aria-label={t("details.history_year_label")}
          onChange={(event) =>
            setYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
          }
        />
        <button disabled={busy || !name.trim()} onClick={add}>
          {t("details.history_add")}
        </button>
      </div>
      <h3>{t("details.history_list")}</h3>
      {review && review.history.length > 0 ? (
        <ul className="entry-list">
          {review.history.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.displayName}
                {entry.onsetYear ? ` (${entry.onsetYear})` : ""}
              </span>
              <button
                disabled={busy}
                onClick={() => void remove(entry.id)}
                aria-label={`${t("details.history_remove")}: ${entry.displayName}`}
              >
                {t("details.history_remove")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="caption">{t("details.history_empty")}</p>
      )}
    </StepShell>
  );
}

function MedicationsStep(props: StepProps) {
  const { t, api, encounterId, token, review } = props;
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState<string>("UNKNOWN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    window.dispatchEvent(new CustomEvent("medikiosk:refresh-review"));

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry: MedicationEntry = { name: trimmed };
      if (dose.trim()) entry.doseText = dose.trim();
      if (frequency !== "UNKNOWN") entry.frequency = frequency;
      await api.addMedications({ encounterId, token, medications: [entry] });
      setName("");
      setDose("");
      setFrequency("UNKNOWN");
      refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rowId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeClinicalEntry({
        encounterId,
        token,
        kind: "medications",
        rowId,
      });
      refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      title={t("details.meds_title")}
      lead={t("details.meds_lead")}
      t={t}
      busy={busy}
      error={error}
      onBack={props.onBack}
      onDone={props.onDone}
      doneLabel={t("details.meds_done")}
    >
      <div className="form-row">
        <input
          value={name}
          disabled={busy}
          placeholder={t("details.med_name_label")}
          aria-label={t("details.med_name_label")}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          value={dose}
          disabled={busy}
          placeholder={t("details.med_dose_label")}
          aria-label={t("details.med_dose_label")}
          onChange={(event) => setDose(event.target.value)}
        />
      </div>
      <div className="form-row">
        <label htmlFor="med-frequency">
          {t("details.med_frequency_label")}
        </label>
        <select
          id="med-frequency"
          value={frequency}
          disabled={busy}
          onChange={(event) => setFrequency(event.target.value)}
        >
          {FREQUENCIES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
        <button disabled={busy || !name.trim()} onClick={add}>
          {t("details.med_add")}
        </button>
      </div>
      <h3>{t("details.med_list")}</h3>
      {review && review.medications.length > 0 ? (
        <ul className="entry-list">
          {review.medications.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.name}
                {entry.frequency !== "UNKNOWN" ? ` (${entry.frequency})` : ""}
              </span>
              {entry.originClass === "PATIENT_REPORTED" ? (
                <button
                  disabled={busy}
                  onClick={() => void remove(entry.id)}
                  aria-label={`${t("details.med_remove")}: ${entry.name}`}
                >
                  {t("details.med_remove")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="caption">{t("details.med_empty")}</p>
      )}
      <div className="secondary-actions">
        <button disabled={busy} onClick={props.onDone}>
          {t("details.med_none")}
        </button>
      </div>
    </StepShell>
  );
}

function AllergiesStep(props: StepProps) {
  const { t, api, encounterId, token, review } = props;
  const [name, setName] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState<string>("UNKNOWN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    window.dispatchEvent(new CustomEvent("medikiosk:refresh-review"));

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry: AllergyEntry = { name: trimmed };
      if (reaction.trim()) entry.reaction = reaction.trim();
      if (severity !== "UNKNOWN") entry.severity = severity;
      await api.addAllergies({ encounterId, token, allergies: [entry] });
      setName("");
      setReaction("");
      setSeverity("UNKNOWN");
      refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const recordNone = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.addAllergies({
        encounterId,
        token,
        allergies: [],
        noKnownAllergies: true,
      });
      refresh();
      props.onDone();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rowId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeClinicalEntry({
        encounterId,
        token,
        kind: "allergies",
        rowId,
      });
      refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      title={t("details.allergies_title")}
      lead={t("details.allergies_lead")}
      t={t}
      busy={busy}
      error={error}
      onBack={props.onBack}
      onDone={props.onDone}
      doneLabel={t("details.allergies_done")}
    >
      <div className="form-row">
        <input
          value={name}
          disabled={busy}
          placeholder={t("details.allergy_name_label")}
          aria-label={t("details.allergy_name_label")}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          value={reaction}
          disabled={busy}
          placeholder={t("details.allergy_reaction_label")}
          aria-label={t("details.allergy_reaction_label")}
          onChange={(event) => setReaction(event.target.value)}
        />
      </div>
      <div className="form-row">
        <label htmlFor="allergy-severity">
          {t("details.allergy_severity_label")}
        </label>
        <select
          id="allergy-severity"
          value={severity}
          disabled={busy}
          onChange={(event) => setSeverity(event.target.value)}
        >
          {SEVERITIES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
        <button disabled={busy || !name.trim()} onClick={add}>
          {t("details.allergy_add")}
        </button>
      </div>
      <h3>{t("details.allergy_list")}</h3>
      {review && review.allergies.length > 0 ? (
        <ul className="entry-list">
          {review.allergies.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.name}
                {entry.reaction ? ` — ${entry.reaction}` : ""}
              </span>
              {entry.originClass === "PATIENT_REPORTED" ? (
                <button
                  disabled={busy}
                  onClick={() => void remove(entry.id)}
                  aria-label={`${t("details.allergy_remove")}: ${entry.name}`}
                >
                  {t("details.allergy_remove")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="caption">{t("details.allergy_empty")}</p>
      )}
      <div className="secondary-actions">
        <button disabled={busy} onClick={recordNone}>
          {t("details.no_known_allergies")}
        </button>
      </div>
    </StepShell>
  );
}

interface VitalField {
  readonly code: string;
  readonly component?: "SYSTOLIC" | "DIASTOLIC";
  readonly labelKey: string;
  readonly unit: string;
  readonly group?: string;
}

const VITAL_FIELDS: readonly VitalField[] = [
  {
    code: "MK-VIT-001",
    component: "SYSTOLIC",
    labelKey: "details.vital_sys",
    unit: "mmHg",
    group: "details.vital_bp",
  },
  {
    code: "MK-VIT-001",
    component: "DIASTOLIC",
    labelKey: "details.vital_dia",
    unit: "mmHg",
    group: "details.vital_bp",
  },
  { code: "MK-VIT-002", labelKey: "details.vital_pulse", unit: "beats/min" },
  { code: "MK-VIT-003", labelKey: "details.vital_temp", unit: "Cel" },
  { code: "MK-VIT-004", labelKey: "details.vital_spo2", unit: "%" },
  { code: "MK-VIT-005", labelKey: "details.vital_rr", unit: "breaths/min" },
  { code: "MK-VIT-006", labelKey: "details.vital_sugar", unit: "mg/dL" },
  { code: "MK-VIT-008", labelKey: "details.vital_weight", unit: "kg" },
  { code: "MK-VIT-007", labelKey: "details.vital_height", unit: "cm" },
];

function VitalsStep(props: StepProps) {
  const { t, api, encounterId, token, review } = props;
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const keyOf = (field: (typeof VITAL_FIELDS)[number]) =>
    `${field.code}:${field.component ?? "-"}`;

  const save = async () => {
    if (busy) return;
    const entries: VitalEntry[] = [];
    for (const field of VITAL_FIELDS) {
      const raw = (values[keyOf(field)] ?? "").trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        setError(t("details.error"));
        return;
      }
      entries.push({
        code: field.code,
        ...(field.component
          ? {
              componentCode: field.component as "SYSTOLIC" | "DIASTOLIC",
            }
          : {}),
        value,
        unit: field.unit,
      });
    }
    if (entries.length === 0) {
      props.onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.recordVitals({ encounterId, token, vitals: entries });
      setSaved(true);
      setValues({});
      window.dispatchEvent(new CustomEvent("medikiosk:refresh-review"));
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      title={t("details.vitals_title")}
      lead={t("details.vitals_lead")}
      t={t}
      busy={busy}
      error={error}
      onBack={props.onBack}
      onDone={props.onDone}
      doneLabel={t("details.history_done")}
    >
      {saved ? (
        <div className="notice success" role="status">
          {t("details.vitals_saved")}
        </div>
      ) : null}
      <div className="vitals-grid">
        {VITAL_FIELDS.map((field) => (
          <label key={keyOf(field)} className="vital-field">
            <span>
              {field.group ? `${t(field.group)} — ` : ""}
              {t(field.labelKey)}
              <small> ({field.unit})</small>
            </span>
            <input
              value={values[keyOf(field)] ?? ""}
              disabled={busy}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  [keyOf(field)]: event.target.value.replace(/[^0-9.]/g, ""),
                }))
              }
            />
          </label>
        ))}
      </div>
      <p className="caption">{t("details.vitals_skip_note")}</p>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={save}>
          {t("details.vitals_save")}
        </button>
      </div>
      {review && review.vitals.length > 0 ? (
        <>
          <h3>{t("details.review_vitals")}</h3>
          <ul className="entry-list static">
            {review.vitals.map((vital) => (
              <li key={vital.id}>
                <span>
                  {vital.code}
                  {vital.componentCode ? ` (${vital.componentCode})` : ""}:{" "}
                  {vital.value} {vital.unit}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </StepShell>
  );
}

function DocumentsStep(props: StepProps) {
  const { t, api, encounterId, token, review } = props;
  const [documentType, setDocumentType] = useState<string>("PRESCRIPTION");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [demos, setDemos] = useState<
    { name: string; documentType: string }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listDemoDocuments(token)
      .then((items) => {
        if (!cancelled) setDemos(items);
      })
      .catch(() => {
        if (!cancelled) setDemos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, token]);

  const refresh = () =>
    window.dispatchEvent(new CustomEvent("medikiosk:refresh-review"));

  const uploadBlob = async (blob: Blob, filename: string, mimeType: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.uploadDocument({
        encounterId,
        token,
        file: blob,
        filename,
        mimeType,
        documentType,
      });
      if (result.entities.length === 0)
        setNotice(t("details.docs_unrecognised"));
      refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file || busy) return;
    void uploadBlob(file, file.name, file.type || "application/octet-stream");
  };

  const onDemo = async (name: string, type: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await api.fetchDemoDocument(name, token);
      // The uploaded type follows the demo file's own type so extraction matches.
      const result = await api.uploadDocument({
        encounterId,
        token,
        file: blob,
        filename: name,
        mimeType: "text/plain",
        documentType: type,
      });
      if (result.entities.length === 0)
        setNotice(t("details.docs_unrecognised"));
      refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (documentId: string, accept: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (accept) {
        await api.confirmDocument({ encounterId, documentId, token });
        setNotice(t("details.docs_confirmed"));
      } else {
        await api.rejectDocument({ encounterId, documentId, token });
        setNotice(t("details.docs_rejected"));
      }
      refresh();
    } catch (cause) {
      setError(errorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      title={t("details.docs_title")}
      lead={t("details.docs_lead")}
      t={t}
      busy={busy}
      error={error}
      onBack={props.onBack}
      onDone={props.onDone}
      doneLabel={t("details.docs_done")}
    >
      {notice ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}
      <p className="caption">{t("details.docs_demo_note")}</p>
      <div className="form-row">
        <label htmlFor="docs-type">{t("details.docs_type_label")}</label>
        <select
          id="docs-type"
          value={documentType}
          disabled={busy}
          onChange={(event) => setDocumentType(event.target.value)}
        >
          {DOCUMENT_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label className="file-button">
          {t("details.docs_choose")}
          <input
            type="file"
            hidden
            disabled={busy}
            accept=".txt,.md,.pdf,.jpg,.jpeg,.png,text/plain,application/pdf,image/jpeg,image/png"
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        {busy ? (
          <span className="pending" role="status">
            {t("details.docs_uploading")}
          </span>
        ) : null}
      </div>
      <h3>{t("details.docs_demo_title")}</h3>
      {demos === null ? (
        <p className="pending" role="status">
          {t("common.loading")}
        </p>
      ) : (
        <div className="options-grid">
          {demos.map((demo) => (
            <button
              key={demo.name}
              disabled={busy}
              onClick={() => void onDemo(demo.name, demo.documentType)}
            >
              {t(
                DOCUMENT_TYPES.find((d) => d.value === demo.documentType)
                  ?.labelKey ?? "document.type.other",
              )}
            </button>
          ))}
        </div>
      )}
      <h3>{t("details.docs_list")}</h3>
      {review && review.documents.length > 0 ? (
        <div className="document-list">
          {review.documents.map((document) => (
            <div key={document.id} className="document-card">
              <strong>
                {t(
                  DOCUMENT_TYPES.find((d) => d.value === document.documentType)
                    ?.labelKey ?? "document.type.other",
                )}
              </strong>
              <span className="caption"> — {document.status}</span>
              {document.entities.length > 0 ? (
                <>
                  <p className="caption">{t("details.docs_extracted")}</p>
                  <ul className="entry-list static">
                    {document.entities.map((entity) => (
                      <li key={entity.id}>
                        <span>
                          [{entity.kind}] {entity.rawText}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="caption">{t("details.docs_unrecognised")}</p>
              )}
              {document.status === "EXTRACTED" &&
              document.entities.length > 0 ? (
                <div className="secondary-actions">
                  <button
                    disabled={busy}
                    onClick={() => void confirm(document.id, true)}
                  >
                    {t("details.docs_confirm")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void confirm(document.id, false)}
                  >
                    {t("details.docs_reject")}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="caption">{t("details.docs_empty")}</p>
      )}
    </StepShell>
  );
}

/**
 * Post-interview structured capture: history, medications, allergies, vitals and documents.
 * Every part is optional; the parent moves to the review screen when the patient continues.
 */
export function HealthDetails({
  encounterId,
  token,
  locale,
  t,
  api,
  onContinue,
}: {
  encounterId: string;
  token: string;
  locale: RegistrationLocale;
  t: Translate;
  api: KioskApi;
  onContinue: () => void;
}) {
  const [step, setStep] = useState<Step>("hub");
  const [review, setReview] = useState<Review | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setReview(await api.getReview(encounterId, token));
    } catch {
      // The hub stays usable; each step surfaces its own errors.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener("medikiosk:refresh-review", listener);
    return () =>
      window.removeEventListener("medikiosk:refresh-review", listener);
  }, [encounterId]);

  const markDone = (key: string) => {
    setDone((previous) => ({ ...previous, [key]: true }));
    setStep("hub");
    void refresh();
  };

  if (step !== "hub") {
    const common = {
      encounterId,
      token,
      locale,
      t,
      api,
      review,
      onBack: () => {
        setStep("hub");
        void refresh();
      },
      onDone: () => markDone(step),
    };
    if (step === "history") return <HistoryStep {...common} />;
    if (step === "medications") return <MedicationsStep {...common} />;
    if (step === "allergies") return <AllergiesStep {...common} />;
    if (step === "vitals") return <VitalsStep {...common} />;
    return <DocumentsStep {...common} />;
  }

  return (
    <div className="details-hub">
      <h2>{t("details.title")}</h2>
      <p className="lead">{t("details.lead")}</p>
      {loading ? (
        <p className="pending" role="status">
          {t("common.loading")}
        </p>
      ) : null}
      <div className="details-grid">
        {STEP_ORDER.map((key) => (
          <button
            key={key}
            className="identity-card"
            onClick={() => setStep(key)}
          >
            <strong>
              {t(`details.step_${key}`)}
              {done[key] ? ` · ${t("details.step_done")}` : ""}
            </strong>
            <span>{t(`details.step_${key}_detail`)}</span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="primary" onClick={onContinue}>
          {t("details.continue_to_review")}
          <span aria-hidden="true"> →</span>
        </button>
      </div>
    </div>
  );
}
