/**
 * FHIR R4 subset mapping — input contract.
 *
 * The mapper is a pure function over an `ExportCase`: the API layer assembles the case from
 * tenant-scoped rows and the mapper produces a FHIR R4 Bundle. No database, no clock (the
 * generation timestamp is injected), no network. The output is a DEMO INTEROPERABILITY
 * REPRESENTATION: it is not connected to any real health information exchange and must never be
 * presented as such (ADR-006).
 */

/** Minimal FHIR `Reference`. */
export interface FhirReference {
  readonly reference: string;
  readonly display?: string;
}

/** Loosely-typed FHIR R4 resource: every resource is a `{ resourceType, ... }` object. */
export interface FhirResource {
  readonly resourceType: string;
  readonly id?: string;
  [key: string]: unknown;
}

/** FHIR R4 search-set style bundle. */
export interface FhirBundle {
  readonly resourceType: "Bundle";
  readonly id?: string;
  readonly type: "collection" | "searchset" | "document";
  readonly timestamp: string;
  readonly meta?: Record<string, unknown>;
  readonly entry: readonly {
    readonly fullUrl?: string;
    readonly resource: FhirResource;
  }[];
}

export interface ExportPatient {
  readonly id: string;
  readonly fullName: string | null;
  readonly dateOfBirth: string | null;
  readonly sex: "MALE" | "FEMALE" | "OTHER" | null;
  readonly preferredLanguage: string;
  readonly phoneMasked: string | null;
}

export interface ExportEncounter {
  readonly id: string;
  readonly status: "planned" | "in-progress" | "finished" | "cancelled";
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly chiefComplaintCodes: readonly string[];
  readonly chiefComplaintVerbatim: string | null;
  readonly classDisplay: string;
}

export interface ExportObservation {
  readonly id: string;
  /** LOINC-ish display only; the demo vocabulary is NOT LOINC. */
  readonly code: string;
  readonly display: string;
  readonly value: number;
  readonly unit: string;
  readonly effectiveAt: string;
  readonly componentCode?: string;
}

export interface ExportCondition {
  readonly id: string;
  readonly code: string | null;
  readonly display: string;
  readonly clinicalStatus: "active" | "recurrence" | "resolved";
  readonly recordedAt: string;
}

export interface ExportMedicationStatement {
  readonly id: string;
  readonly code: string | null;
  readonly display: string;
  readonly dosageText: string | null;
  readonly status: "active" | "completed" | "stopped";
  readonly effectiveStart: string | null;
}

export interface ExportAllergy {
  readonly id: string;
  readonly code: string | null;
  readonly display: string;
  readonly reactionText: string | null;
  readonly severity: string | null;
}

export interface ExportDocumentReference {
  readonly id: string;
  readonly documentType: string;
  readonly mimeType: string;
  readonly created: string;
  readonly status: "current" | "superseded";
}

/** Everything the mapper needs to emit one encounter's bundle. */
export interface ExportCase {
  readonly generatedAt: string;
  readonly patient: ExportPatient;
  readonly encounter: ExportEncounter;
  readonly vitals: readonly ExportObservation[];
  readonly labs: readonly ExportObservation[];
  readonly conditions: readonly ExportCondition[];
  readonly symptoms: readonly ExportCondition[];
  readonly medications: readonly ExportMedicationStatement[];
  readonly allergies: readonly ExportAllergy[];
  readonly documents: readonly ExportDocumentReference[];
}
