/**
 * Deterministic clinical summary builder.
 *
 * Assembles a doctor-facing structured summary from persisted rows only. No LLM, no inference,
 * no invented facts: every line traces to a row, and every line is tagged with its origin class
 * (PATIENT-REPORTED / DOCUMENT-DERIVED / SYSTEM-DERIVED / DOCTOR-VERIFIED / DOCTOR-AUTHORED) so
 * the console can render the provenance distinction the product promises (ADR-005).
 *
 * Pure function: same input, same sections, same order — byte-identical text. The API layer
 * assembles the input from tenant-scoped rows and persists the sections.
 */

import type { ChangeItem } from "@medikiosk/longitudinal";

export interface SummaryFact {
  readonly label: string;
  readonly detail?: string;
  readonly originClass: string;
  readonly verificationState: string;
  readonly evidenceIds?: readonly string[];
}

export interface SummaryTriageHit {
  readonly identifier: string;
  readonly description: string;
  readonly clinicalRationale: string;
  readonly severity: string;
}

export interface SummaryPreviousEncounter {
  readonly id: string;
  readonly createdAt: string;
  readonly status: string;
  readonly complaints: readonly string[];
  readonly disposition: string | null;
}

export interface SummaryInput {
  readonly patient: {
    readonly fullName: string | null;
    readonly ageYears: number | null;
    readonly sex: string | null;
    readonly preferredLanguage: string;
  };
  readonly encounter: {
    readonly id: string;
    readonly chiefComplaintCodes: readonly string[];
    readonly chiefComplaintCodesLabelled: readonly {
      code: string;
      display: string;
    }[];
    readonly chiefComplaintVerbatim: string | null;
    readonly locale: string;
    readonly createdAt: string;
    readonly submittedAt: string | null;
    readonly patientConfirmedAt: string | null;
  };
  readonly symptoms: readonly SummaryFact[];
  readonly conditions: readonly SummaryFact[];
  readonly medications: readonly SummaryFact[];
  readonly allergies: readonly SummaryFact[];
  readonly vitals: readonly SummaryFact[];
  readonly labs: readonly SummaryFact[];
  readonly documents: readonly {
    readonly documentType: string;
    readonly status: string;
    readonly entities: readonly {
      readonly kind: string;
      readonly rawText: string;
      readonly verificationState: string;
    }[];
  }[];
  readonly triage: {
    readonly level: string;
    readonly priority: string;
    readonly requiresHumanReview: boolean;
    readonly explanation: string;
    readonly hits: readonly SummaryTriageHit[];
  } | null;
  readonly previousEncounters: readonly SummaryPreviousEncounter[];
  readonly changes: readonly ChangeItem[];
  readonly notes: readonly {
    readonly authorName: string;
    readonly note: string;
    readonly createdAt: string;
  }[];
  readonly diagnoses: readonly {
    readonly displayText: string;
    readonly status: string;
  }[];
}

export interface SummarySection {
  readonly sectionKey: string;
  readonly kind: string;
  readonly text: string;
  readonly evidenceIds: readonly string[];
}

const NO_DATA = "Not provided.";

function factLine(fact: SummaryFact): string {
  const detail = fact.detail ? ` — ${fact.detail}` : "";
  return `• ${fact.label}${detail} [${fact.originClass} · ${fact.verificationState}]`;
}

function sectionFacts(title: string, facts: readonly SummaryFact[]): string {
  if (facts.length === 0) return `${title}\n${NO_DATA}`;
  return `${title}\n${facts.map(factLine).join("\n")}`;
}

function buildPatientOverview(input: SummaryInput): SummarySection {
  const patient = input.patient;
  const name = patient.fullName ?? "Guest patient";
  const age =
    patient.ageYears === null
      ? "age not recorded"
      : `${patient.ageYears} years`;
  const sex = patient.sex ?? "sex not recorded";
  return {
    sectionKey: "PATIENT_OVERVIEW",
    kind: "SYSTEM_DERIVED",
    text: `Patient overview\n${name}, ${age}, ${sex}. Preferred language ${patient.preferredLanguage}.`,
    evidenceIds: [],
  };
}

function buildChiefComplaint(input: SummaryInput): SummarySection {
  const encounter = input.encounter;
  const labelled = encounter.chiefComplaintCodesLabelled
    .map((c) => `${c.display} (${c.code})`)
    .join("; ");
  const verbatim = encounter.chiefComplaintVerbatim
    ? `Patient's own words: "${encounter.chiefComplaintVerbatim}" [PATIENT-REPORTED]`
    : "No verbatim statement recorded.";
  const confirmed = encounter.patientConfirmedAt
    ? `Patient confirmed the record at ${encounter.patientConfirmedAt}.`
    : "Patient confirmation NOT recorded.";
  return {
    sectionKey: "CHIEF_COMPLAINT",
    kind: "PATIENT_REPORTED",
    text: `Chief complaint\nCoded: ${labelled || NO_DATA}\n${verbatim}\n${confirmed}`,
    evidenceIds: [],
  };
}

function buildPresentIllness(input: SummaryInput): SummarySection {
  return {
    sectionKey: "HISTORY_PRESENT_ILLNESS",
    kind: "PATIENT_REPORTED",
    text: sectionFacts(
      "History of present complaint (patient-reported symptoms)",
      input.symptoms,
    ),
    evidenceIds: input.symptoms.flatMap((s) => s.evidenceIds ?? []),
  };
}

function buildSafetySignals(input: SummaryInput): SummarySection {
  if (!input.triage) {
    return {
      sectionKey: "SAFETY_SIGNALS",
      kind: "SYSTEM_DERIVED",
      text: "Safety signals\nNo safety assessment has been recorded for this encounter.",
      evidenceIds: [],
    };
  }
  const triage = input.triage;
  const hits =
    triage.hits.length === 0
      ? "No safety rules fired."
      : triage.hits
          .map(
            (hit) =>
              `• ${hit.identifier} (${hit.severity}): ${hit.description}\n  Rationale: ${hit.clinicalRationale}`,
          )
          .join("\n");
  return {
    sectionKey: "SAFETY_SIGNALS",
    kind: "SYSTEM_DERIVED",
    text:
      `Safety signals — SYSTEM-GENERATED ATTENTION SIGNALS, not diagnoses\n` +
      `Level: ${triage.level} · Priority: ${triage.priority} · Requires human review: ${triage.requiresHumanReview ? "yes" : "no"}\n` +
      `${hits}\nAssessment: ${triage.explanation}`,
    evidenceIds: [],
  };
}

function buildDocuments(input: SummaryInput): SummarySection {
  if (input.documents.length === 0) {
    return {
      sectionKey: "DOCUMENTS",
      kind: "SYSTEM_DERIVED",
      text: "Documents\nNo documents attached to this encounter.",
      evidenceIds: [],
    };
  }
  const lines = input.documents.map((document) => {
    const entities =
      document.entities.length === 0
        ? "  No values extracted (demo extraction found no recognised lines)."
        : document.entities
            .map(
              (entity) =>
                `  • [${entity.kind}] ${entity.rawText} (${entity.verificationState})`,
            )
            .join("\n");
    return `• ${document.documentType} — ${document.status} (demo extraction)\n${entities}`;
  });
  return {
    sectionKey: "DOCUMENTS",
    kind: "DOCUMENT_DERIVED",
    text: `Documents and extracted values\n${lines.join("\n")}`,
    evidenceIds: [],
  };
}

function buildLongitudinal(input: SummaryInput): SummarySection {
  const previous =
    input.previousEncounters.length === 0
      ? "No previous encounters on record."
      : input.previousEncounters
          .map(
            (encounter) =>
              `• ${encounter.createdAt.slice(0, 10)} — ${encounter.status}` +
              (encounter.complaints.length > 0
                ? ` — ${encounter.complaints.join(", ")}`
                : "") +
              (encounter.disposition
                ? ` — disposition: ${encounter.disposition}`
                : ""),
          )
          .join("\n");
  const changes =
    input.changes.length === 0
      ? "No comparable previous encounter, or no changes detected."
      : input.changes
          .map((change) => {
            const values =
              change.previous !== undefined || change.current !== undefined
                ? ` (was: ${change.previous ?? "—"} → now: ${change.current ?? "—"})`
                : "";
            return `• [${change.kind} · ${change.direction}] ${change.label}${values}`;
          })
          .join("\n");
  return {
    sectionKey: "LONGITUDINAL",
    kind: "SYSTEM_DERIVED",
    text: `Previous encounters\n${previous}\n\nChanges since the previous encounter\n${changes}`,
    evidenceIds: [],
  };
}

function buildClinician(input: SummaryInput): SummarySection {
  const diagnoses =
    input.diagnoses.length === 0
      ? "No diagnosis recorded."
      : input.diagnoses
          .map((d) => `• ${d.displayText} (${d.status}) [DOCTOR-AUTHORED]`)
          .join("\n");
  const notes =
    input.notes.length === 0
      ? "No clinician notes."
      : input.notes
          .map((n) => `• ${n.createdAt} — ${n.authorName}: ${n.note}`)
          .join("\n");
  return {
    sectionKey: "CLINICIAN",
    kind: "DOCTOR_AUTHORED",
    text: `Diagnoses and clinician notes — DOCTOR-AUTHORED\n${diagnoses}\n\n${notes}`,
    evidenceIds: [],
  };
}

/**
 * Build the fixed, ordered section list. Exactly twelve sections, always in this order, so the
 * console renders a stable document and tests can assert completeness.
 */
export function buildSummarySections(
  input: SummaryInput,
): readonly SummarySection[] {
  return [
    buildPatientOverview(input),
    buildChiefComplaint(input),
    buildPresentIllness(input),
    {
      sectionKey: "PAST_HISTORY",
      kind: "PATIENT_REPORTED",
      text: sectionFacts("Relevant medical history", input.conditions),
      evidenceIds: input.conditions.flatMap((c) => c.evidenceIds ?? []),
    },
    {
      sectionKey: "MEDICATIONS",
      kind: "PATIENT_REPORTED",
      text: sectionFacts(
        "Medications (source shown per line)",
        input.medications,
      ),
      evidenceIds: input.medications.flatMap((m) => m.evidenceIds ?? []),
    },
    {
      sectionKey: "ALLERGIES",
      kind: "PATIENT_REPORTED",
      text: sectionFacts("Allergies", input.allergies),
      evidenceIds: input.allergies.flatMap((a) => a.evidenceIds ?? []),
    },
    {
      sectionKey: "VITALS",
      kind: "PATIENT_REPORTED",
      text: sectionFacts("Vitals", input.vitals),
      evidenceIds: input.vitals.flatMap((v) => v.evidenceIds ?? []),
    },
    {
      sectionKey: "INVESTIGATIONS",
      kind: "DOCUMENT_DERIVED",
      text: sectionFacts("Laboratory values", input.labs),
      evidenceIds: input.labs.flatMap((l) => l.evidenceIds ?? []),
    },
    buildSafetySignals(input),
    buildDocuments(input),
    buildLongitudinal(input),
    buildClinician(input),
  ];
}

export const SUMMARY_SECTION_KEYS = [
  "PATIENT_OVERVIEW",
  "CHIEF_COMPLAINT",
  "HISTORY_PRESENT_ILLNESS",
  "PAST_HISTORY",
  "MEDICATIONS",
  "ALLERGIES",
  "VITALS",
  "INVESTIGATIONS",
  "SAFETY_SIGNALS",
  "DOCUMENTS",
  "LONGITUDINAL",
  "CLINICIAN",
] as const;
