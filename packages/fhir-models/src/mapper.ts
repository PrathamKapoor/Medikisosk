/**
 * FHIR R4 subset mapper — deterministic export of one clinical encounter.
 *
 * Pure function: same input always produces the same bundle. The resource subset (Patient,
 * Encounter, Observation, Condition, MedicationStatement, AllergyIntolerance, DocumentReference)
 * is what a downstream Indian HMIS/FHIR store would need for an OPD encounter. The bundle is
 * explicitly meta-tagged as a demo representation (ADR-006): no real interoperability endpoint
 * is connected.
 */

import type {
  ExportCase,
  FhirBundle,
  FhirReference,
  FhirResource,
} from "./types";

export const FHIR_EXPORT_PROFILE =
  "https://medikiosk.example/fhir/StructureDefinition/demo-export";
export const FHIR_EXPORT_META = {
  profile: [FHIR_EXPORT_PROFILE],
  tag: [
    {
      system: "https://medikiosk.example/fhir/CodeSystem/export-origin",
      code: "demo-export",
      display: "Demo interoperability representation - not a live HIE exchange",
    },
  ],
};

function ref(kind: string, id: string, display?: string): FhirReference {
  return display
    ? { reference: `${kind}/${id}`, display }
    : { reference: `${kind}/${id}` };
}

function codeableConcept(
  system: string,
  code: string,
  display: string,
): Record<string, unknown> {
  return {
    coding: [{ system, code, display }],
    text: display,
  };
}

const MK_SYSTEM =
  "https://medikiosk.example/fhir/CodeSystem/medikiosk-concepts";

function patientResource(input: ExportCase): FhirResource {
  const patient = input.patient;
  return {
    resourceType: "Patient",
    id: patient.id,
    meta: FHIR_EXPORT_META,
    identifier: [
      {
        system: `${MK_SYSTEM}/patient-id`,
        value: patient.id,
      },
    ],
    name: patient.fullName ? [{ text: patient.fullName }] : undefined,
    birthDate: patient.dateOfBirth ?? undefined,
    gender:
      patient.sex === "MALE"
        ? "male"
        : patient.sex === "FEMALE"
          ? "female"
          : patient.sex === "OTHER"
            ? "other"
            : "unknown",
    telecom: patient.phoneMasked
      ? [{ system: "phone", value: patient.phoneMasked }]
      : undefined,
    communication: [
      {
        language: codeableConcept(
          "urn:ietf:bcp:47",
          patient.preferredLanguage,
          patient.preferredLanguage,
        ),
        preferred: true,
      },
    ],
  };
}

function encounterResource(input: ExportCase): FhirResource {
  const encounter = input.encounter;
  return {
    resourceType: "Encounter",
    id: encounter.id,
    meta: FHIR_EXPORT_META,
    status: encounter.status,
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "AMB",
      display: encounter.classDisplay,
    },
    subject: ref("Patient", input.patient.id),
    period: {
      start: encounter.startedAt,
      end: encounter.endedAt ?? undefined,
    },
    reasonCode:
      encounter.chiefComplaintCodes.length > 0
        ? encounter.chiefComplaintCodes.map((code) =>
            codeableConcept(MK_SYSTEM, code, code),
          )
        : encounter.chiefComplaintVerbatim
          ? [{ text: encounter.chiefComplaintVerbatim }]
          : undefined,
  };
}

function observationResource(
  patientId: string,
  encounterId: string,
  observation: ExportCase["vitals"][number],
): FhirResource {
  return {
    resourceType: "Observation",
    id: observation.id,
    meta: FHIR_EXPORT_META,
    status: "final",
    category: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "vital-signs",
          },
        ],
      },
    ],
    code: codeableConcept(MK_SYSTEM, observation.code, observation.display),
    subject: ref("Patient", patientId),
    encounter: ref("Encounter", encounterId),
    effectiveDateTime: observation.effectiveAt,
    valueQuantity: {
      value: observation.value,
      unit: observation.unit,
      system: "http://unitsofmeasure.org",
      code: observation.unit,
    },
    component: observation.componentCode
      ? [
          {
            code: codeableConcept(
              MK_SYSTEM,
              observation.componentCode,
              observation.componentCode,
            ),
          },
        ]
      : undefined,
  };
}

function labObservationResource(
  patientId: string,
  encounterId: string,
  lab: ExportCase["labs"][number],
): FhirResource {
  return {
    resourceType: "Observation",
    id: lab.id,
    meta: FHIR_EXPORT_META,
    status: "final",
    category: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "laboratory",
          },
        ],
      },
    ],
    code: codeableConcept(MK_SYSTEM, lab.code, lab.display),
    subject: ref("Patient", patientId),
    encounter: ref("Encounter", encounterId),
    effectiveDateTime: lab.effectiveAt,
    valueQuantity: {
      value: lab.value,
      unit: lab.unit,
      system: "http://unitsofmeasure.org",
      code: lab.unit,
    },
  };
}

function conditionResource(
  patientId: string,
  encounterId: string,
  condition: ExportCase["conditions"][number],
): FhirResource {
  return {
    resourceType: "Condition",
    id: condition.id,
    meta: FHIR_EXPORT_META,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: condition.clinicalStatus,
        },
      ],
    },
    code: condition.code
      ? codeableConcept(MK_SYSTEM, condition.code, condition.display)
      : { text: condition.display },
    subject: ref("Patient", patientId),
    encounter: ref("Encounter", encounterId),
    recordedDate: condition.recordedAt,
  };
}

function symptomConditionResource(
  patientId: string,
  encounterId: string,
  symptom: ExportCase["symptoms"][number],
): FhirResource {
  return {
    resourceType: "Condition",
    id: symptom.id,
    meta: FHIR_EXPORT_META,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: symptom.clinicalStatus,
        },
      ],
    },
    code: codeableConcept(MK_SYSTEM, symptom.code ?? "SYM", symptom.display),
    subject: ref("Patient", patientId),
    encounter: ref("Encounter", encounterId),
    recordedDate: symptom.recordedAt,
  };
}

function medicationStatementResource(
  patientId: string,
  medication: ExportCase["medications"][number],
): FhirResource {
  return {
    resourceType: "MedicationStatement",
    id: medication.id,
    meta: FHIR_EXPORT_META,
    status: medication.status,
    medicationCodeableConcept: medication.code
      ? codeableConcept(MK_SYSTEM, medication.code, medication.display)
      : { text: medication.display },
    subject: ref("Patient", patientId),
    effectivePeriod: medication.effectiveStart
      ? { start: medication.effectiveStart }
      : undefined,
    dosage: medication.dosageText
      ? [{ text: medication.dosageText }]
      : undefined,
  };
}

function allergyResource(
  patientId: string,
  allergy: ExportCase["allergies"][number],
): FhirResource {
  return {
    resourceType: "AllergyIntolerance",
    id: allergy.id,
    meta: FHIR_EXPORT_META,
    clinicalStatus: {
      coding: [
        {
          system:
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    },
    code: allergy.code
      ? codeableConcept(MK_SYSTEM, allergy.code, allergy.display)
      : { text: allergy.display },
    patient: ref("Patient", patientId),
    reaction: allergy.reactionText
      ? [{ manifestation: [{ text: allergy.reactionText }] }]
      : undefined,
    criticality: undefined,
  };
}

function documentReferenceResource(
  patientId: string,
  encounterId: string,
  document: ExportCase["documents"][number],
): FhirResource {
  return {
    resourceType: "DocumentReference",
    id: document.id,
    meta: FHIR_EXPORT_META,
    status: document.status,
    type: codeableConcept(
      MK_SYSTEM,
      document.documentType,
      document.documentType,
    ),
    subject: ref("Patient", patientId),
    context: {
      encounter: [ref("Encounter", encounterId)],
    },
    date: document.created,
    content: [
      {
        attachment: {
          contentType: document.mimeType,
          title: document.documentType,
        },
      },
    ],
  };
}

/**
 * Map one clinical encounter to a FHIR R4 collection bundle.
 * Deterministic: entry order follows the fixed resource sequence below.
 */
export function mapEncounterBundle(input: ExportCase): FhirBundle {
  const patientId = input.patient.id;
  const encounterId = input.encounter.id;

  const resources: FhirResource[] = [
    patientResource(input),
    encounterResource(input),
    ...input.vitals.map((vital) =>
      observationResource(patientId, encounterId, vital),
    ),
    ...input.labs.map((lab) =>
      labObservationResource(patientId, encounterId, lab),
    ),
    ...input.conditions.map((condition) =>
      conditionResource(patientId, encounterId, condition),
    ),
    ...input.symptoms.map((symptom) =>
      symptomConditionResource(patientId, encounterId, symptom),
    ),
    ...input.medications.map((medication) =>
      medicationStatementResource(patientId, medication),
    ),
    ...input.allergies.map((allergy) => allergyResource(patientId, allergy)),
    ...input.documents.map((document) =>
      documentReferenceResource(patientId, encounterId, document),
    ),
  ];

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: input.generatedAt,
    meta: FHIR_EXPORT_META,
    entry: resources.map((resource) => ({
      fullUrl: `urn:uuid:medikiosk-${resource.resourceType.toLowerCase()}-${resource.id ?? "unknown"}`,
      resource,
    })),
  };
}
