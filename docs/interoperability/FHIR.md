# FHIR R4 Interoperability

**Snapshot:** 2026-09-15 · **Status vocabulary and measured repository state:** [`../LIMITATIONS.md`](../LIMITATIONS.md) §2–§3.

**Status of this capability: `PLANNED`.** ADR-006 describes the FHIR layer as "fully implemented, not
mocked". `packages/fhir-models` contains only a `package.json` and no source, so **no FHIR resource has
ever been produced by this codebase**. The discrepancy between ADR-006 and the working tree is recorded
in [`../LIMITATIONS.md`](../LIMITATIONS.md) Appendix A.

---

## 1. Purpose and direction

FHIR R4 is MediKiosk's canonical **interoperability** format (ADR-006). It is not, and must never
become, the operational schema: the internal clinical model is optimised for clinical reasoning and
provenance (ADR-005), and FHIR is verbose, exchange-oriented and full of optionality.

**Mapping direction: internal clinical model → FHIR R4. One direction only.** The reverse mapping is
not the operational path. Attempting to run the system from FHIR resources would put the interchange
format in the position of the clinical record.

Two consequences of that decision:

1. FHIR mapping is a pure function of the internal model, and is therefore unit-testable without a
   server.
2. Because stored clinical data is internal rather than FHIR, a change in FHIR release behaviour cannot
   silently change the meaning of what is already stored.

## 2. Resources the mapper produces

| # | Resource | Intended source in the internal model | Status |
|---|---|---|---|
| 1 | `Patient` | Patient identity (kept separable from clinical data) | `PLANNED` |
| 2 | `Encounter` | Encounter (kiosk session, arrival, triage linkage) | `PLANNED` |
| 3 | `Condition` | Diagnoses / conditions, including negated and suspected states via `certainty` | `PLANNED` |
| 4 | `Observation` | Vitals and lab results, with units and reference ranges | `PLANNED` |
| 5 | `MedicationRequest` | Medications (current and prior), reconciled | `PLANNED` |
| 6 | `AllergyIntolerance` | Allergies by category (`DRUG`, `FOOD`, `ENVIRONMENTAL`, `OTHER`) | `PLANNED` |
| 7 | `Procedure` | Recorded procedures and AYUSH interventions | `PLANNED` |
| 8 | `DiagnosticReport` | A lab report as a whole, grouping its observations | `PLANNED` |
| 9 | `DocumentReference` | Uploaded documents and their extraction provenance | `PLANNED` |
| 10 | `Questionnaire` | A pathway as a FHIR questionnaire | `PLANNED` |
| 11 | `QuestionnaireResponse` | The patient's answers, including `DECLINED`/`UNKNOWN` states | `PLANNED` |
| 12 | `Composition` | The synthesised case summary (SOAP-style), with its evidence-linked sections | `PLANNED` |
| 13 | `Bundle` | The container actually transmitted | `PLANNED` |

Resource types are enumerated verbatim in ADR-006. **The exact profile, the required-vs-optional field
sets per resource, and the reference-graph shape are not fixed by any ADR** — they are left to the
implementer. See `../LIMITATIONS.md` Appendix A.

## 3. Terminology policy: never invent a standard code

| Situation | Policy | Mechanism |
|---|---|---|
| A real LOINC code is known for an observation | Emit LOINC | `standardCodingSchema.system` = `http://loinc.org` |
| A real SNOMED CT or ICD-10 code is known for a condition | Emit SNOMED CT / ICD-10 as applicable | `http://snomed.info/sct`, `http://hl7.org/fhir/sid/icd-10` |
| A real RxNorm code is known for a medication | Emit RxNorm | RxNorm system URI |
| **No real standard code is known** | Emit the **local** code with an **explicit local system URI**. Do not guess, do not paraphrase a LOINC display name into a plausible code, do not omit the coding silently. | `clinicalConceptSchema.code` (e.g. `MK-SYM-001`) plus a local system URI |

**Why:** false standard codes are worse than honest local ones. A downstream system that trusts a
fabricated LOINC code will file the observation under the wrong concept, and nothing downstream can
detect it. A local code may not be understood by the receiving system — which is a visible,
correctable failure, and therefore the safer one. The policy is already expressed in code:
`standardCodingSchema` requires a real `system` URL, and `standardCoding` defaults to `[]`, so a
concept carries a standard coding only when one is genuinely known
(`packages/clinical-schema/src/concept.ts`, `PARTIALLY IMPLEMENTED`).

Status: `PLANNED` for the mapper; `PARTIALLY IMPLEMENTED` for the vocabulary that governs it.

---

## 4. What "validation" means here

ADR-006 requires that output be validated before use: required fields, resource types, reference
integrity inside the bundle, and coding systems. Validation failures are errors, not warnings.

**The official HL7 FHIR validator cannot run in this environment** — it requires a JVM and a validator
jar (in practice container-distributed). `BASELINE.md` §2 records no JVM toolchain and no Docker, so
validation is **self-implemented**. That is a weaker guarantee and must be described as one.

| Check | A self-implemented validator **can** assert | It **cannot** assert |
|---|---|---|
| Required fields | Presence of the elements this project's profile marks required | Conformance to the full required-element set of any published profile |
| Resource types | `resourceType` is a value this project's mapper can emit | Validity against the published R4 schema |
| Reference integrity inside the bundle | Every `Reference` of the form `urn:uuid:…` resolves to a `Bundle.entry` in the same bundle; every `fullUrl` is unique | Referential integrity to resources outside the bundle |
| Coding systems | `system` is a URL; codes are drawn from the project's own concept catalogue whenever a standard code is claimed | Whether a code exists in the real LOINC/SNOMED CT/ICD-10/RxNorm release, whether it is current, or whether it is retired |
| Cardinality and slicing | The subset of cardinality rules the project chose to encode | Profile slicing, extensions, FHIRPath invariants (`inv-*`), terminology bindings of any strength |
| `Composition` structure | The section shape the mapper produces | Full `Composition` rules and `text.div` XHTML conformance |
| Terminologies | System-URL shape only | Value-set membership and code-system version compatibility |

**State this plainly to any reviewer:** a bundle that passes the self-implemented validator is
*internally consistent and well-formed by this project's own rules*. It is **not** certified to be
conformant FHIR. No claim of FHIR conformance testing may be made. When Docker or a JVM becomes
available, running the official validator is the correct verification step, and it is listed as a
staging verification task in [`../deployment/STAGING.md`](../deployment/STAGING.md).

---

## 5. Worked example Bundle skeleton (illustrative, `PLANNED`)

**This bundle has never been produced by the codebase.** It is a skeleton showing the intended shape:
one `Patient`, one `Encounter`, one `Condition`, one `Observation` carrying a *local* code because no
real LOINC code is known, one `Composition`, and the reference graph that ties them together. Values are
placeholders; no clinical value is asserted as real.

```json
{
  "resourceType": "Bundle",
  "id": "urn:uuid:00000000-0000-4000-8000-000000000001",
  "type": "document",
  "timestamp": "2026-09-15T10:30:00.000Z",
  "identifier": {
    "system": "https://medikiosk.local/bundle-id",
    "value": "MK-BUNDLE-SYNTHETIC-0001"
  },
  "entry": [
    {
      "fullUrl": "urn:uuid:00000000-0000-4000-8000-000000000101",
      "resource": {
        "resourceType": "Patient",
        "id": "MK-PATIENT-SYNTHETIC-0001",
        "identifier": [
          { "system": "https://medikiosk.local/patient-id", "value": "MK-PATIENT-SYNTHETIC-0001" }
        ],
        "name": [{ "text": "Synthetic Patient" }],
        "gender": "unknown",
        "birthDate": "1980-01-01"
      }
    },
    {
      "fullUrl": "urn:uuid:00000000-0000-4000-8000-000000000102",
      "resource": {
        "resourceType": "Encounter",
        "id": "MK-ENCOUNTER-SYNTHETIC-0001",
        "status": "finished",
        "class": {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          "code": "AMB",
          "display": "ambulatory"
        },
        "subject": { "reference": "urn:uuid:00000000-0000-4000-8000-000000000101" },
        "period": { "start": "2026-09-15T10:00:00.000Z" }
      }
    },
    {
      "fullUrl": "urn:uuid:00000000-0000-4000-8000-000000000103",
      "resource": {
        "resourceType": "Condition",
        "id": "MK-CONDITION-SYNTHETIC-0001",
        "clinicalStatus": {
          "coding": [
            { "system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active" }
          ]
        },
        "code": {
          "coding": [
            { "system": "https://medikiosk.local/concept", "code": "MK-SYM-001", "display": "Chest pain" }
          ],
          "text": "Chest pain (local code: no standard code asserted)"
        },
        "subject": { "reference": "urn:uuid:00000000-0000-4000-8000-000000000101" },
        "encounter": { "reference": "urn:uuid:00000000-0000-4000-8000-000000000102" }
      }
    },
    {
      "fullUrl": "urn:uuid:00000000-0000-4000-8000-000000000104",
      "resource": {
        "resourceType": "Observation",
        "id": "MK-OBSERVATION-SYNTHETIC-0001",
        "status": "final",
        "code": {
          "coding": [
            { "system": "https://medikiosk.local/concept", "code": "MK-VITAL-SPO2", "display": "Oxygen saturation" }
          ],
          "text": "SpO2 (local code: this mapper asserts no LOINC code)"
        },
        "subject": { "reference": "urn:uuid:00000000-0000-4000-8000-000000000101" },
        "encounter": { "reference": "urn:uuid:00000000-0000-4000-8000-000000000102" },
        "valueQuantity": { "value": 97, "unit": "%", "system": "http://unitsofmeasure.org", "code": "%" },
        "note": [
          { "text": "Synthetic value from a MOCKED vitals provider (TD-05). Not a device reading." }
        ]
      }
    },
    {
      "fullUrl": "urn:uuid:00000000-0000-4000-8000-000000000105",
      "resource": {
        "resourceType": "Composition",
        "id": "MK-COMPOSITION-SYNTHETIC-0001",
        "status": "preliminary",
        "type": {
          "coding": [{ "system": "http://loinc.org", "code": "11488-4", "display": "Consult note" }]
        },
        "subject": { "reference": "urn:uuid:00000000-0000-4000-8000-000000000101" },
        "encounter": { "reference": "urn:uuid:00000000-0000-4000-8000-000000000102" },
        "date": "2026-09-15T10:30:00.000Z",
        "title": "MediKiosk intake summary",
        "section": [
          {
            "title": "History",
            "entry": [
              { "reference": "urn:uuid:00000000-0000-4000-8000-000000000103" },
              { "reference": "urn:uuid:00000000-0000-4000-8000-000000000104" }
            ]
          },
          {
            "title": "Provenance and limitations",
            "text": {
              "status": "generated",
              "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Values marked AI_INFERRED require physician review. Triage is produced by a deterministic rule engine and its rule-set version is recorded. MediKiosk does not diagnose.</div>"
            }
          }
        ]
      }
    }
  ]
}
```

What a reviewer must take from this skeleton:

- Every internal reference is a `urn:uuid:…` resolved **inside** the bundle. That reference graph is
  exactly what the self-implemented validator checks (§4 asserted above), and nothing beyond it.
- The only real standard codings used are `v3-ActCode`, `condition-clinical` and the LOINC document type
  `11488-4`. Every clinical concept from MediKiosk's own ontology is emitted as a **local** code under
  `https://medikiosk.local/concept`.
- `Composition` carries the system's own limitations, so a receiving clinician who reads only this
  document still reads the caveats.

<!-- MEDIKIOSK-APPEND -->