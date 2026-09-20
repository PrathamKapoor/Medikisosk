/**
 * Synthetic demo documents and the deterministic mock-OCR entry map.
 *
 * These files are FIXED synthetic fixtures: the kiosk offers them as "demo documents" to attach
 * (a judge can exercise the document pipeline without real files), and the mock OCR provider
 * recognises their exact bytes by SHA-256. Content the provider has never seen resolves to an
 * explicit UNRECOGNISED_SYNTHETIC_CONTENT issue instead of fabricated text — the mock never
 * pretends to read real documents (ADR-003, capability registry).
 *
 * Everything here is synthetic. No real patient, provider or hospital data.
 */

import { sha256Hex } from "@medikiosk/ai";

const PRESCRIPTION_DEMO = `CITY CARE POLYCLINIC - OUTPATIENT PRESCRIPTION
Date: 2026-08-14
Patient: Ramesh Kumar
Age/Sex: 67/M

Rx
Tab Metformin 500 mg BD
Tab Amlodipine 5 mg OD

Dr. S. Rao
Registration: MMC-REG-8842`;

const LAB_REPORT_DEMO = `CITY CARE DIAGNOSTICS - LABORATORY REPORT
Date: 2026-08-14
Patient: Ramesh Kumar
Specimen: Blood

Haemoglobin: 9.2 g/dL (Low)
HbA1c: 6.9 %
Total cholesterol: 188 mg/dL

Reported by: Dr. A. Sharma
Pathologist: MMC-LAB-2210`;

const DISCHARGE_SUMMARY_DEMO = `CITY CARE HOSPITAL - DISCHARGE SUMMARY
Date: 2026-06-02
Patient: Ramesh Kumar
Diagnosis: Unstable angina, stabilised
Admission: 2026-05-30
Discharge: 2026-06-02

Treatment during admission
Tab Aspirin 75 mg OD
Tab Atorvastatin 40 mg HS

Dr. S. Rao`;

const MEDICAL_CERTIFICATE_DEMO = `CITY CARE POLYCLINIC - MEDICAL CERTIFICATE
Date: 2026-07-21
Patient: Ramesh Kumar

This is to certify that the above named was examined on the date shown and
advised two days of rest.

Dr. S. Rao`;

const OTHER_DEMO = `CITY CARE POLYCLINIC - GENERAL NOTE
Date: 2026-07-01
Patient: Ramesh Kumar

Patient prefers morning appointments. Reviews medication list at each visit.

Dr. S. Rao`;

export interface DemoDocumentFixture {
  readonly name: string;
  readonly documentType: "PRESCRIPTION" | "LAB_REPORT" | "DISCHARGE_SUMMARY" | "MEDICAL_CERTIFICATE" | "OTHER";
  readonly mimeType: "text/plain";
  readonly content: string;
  readonly bytes: Uint8Array;
}

function fixture(
  name: string,
  documentType: DemoDocumentFixture["documentType"],
  content: string,
): DemoDocumentFixture {
  return {
    name,
    documentType,
    mimeType: "text/plain",
    content,
    bytes: new TextEncoder().encode(content),
  };
}

/** The fixed demo set, in offer order. */
export const DEMO_DOCUMENTS: readonly DemoDocumentFixture[] = [
  fixture("prescription-demo.txt", "PRESCRIPTION", PRESCRIPTION_DEMO),
  fixture("lab-report-demo.txt", "LAB_REPORT", LAB_REPORT_DEMO),
  fixture("discharge-summary-demo.txt", "DISCHARGE_SUMMARY", DISCHARGE_SUMMARY_DEMO),
  fixture("medical-certificate-demo.txt", "MEDICAL_CERTIFICATE", MEDICAL_CERTIFICATE_DEMO),
  fixture("general-note-demo.txt", "OTHER", OTHER_DEMO),
];

export function demoDocumentByName(
  name: string,
): DemoDocumentFixture | undefined {
  return DEMO_DOCUMENTS.find((fixture) => fixture.name === name);
}

/**
 * The mock-OCR entry map: SHA-256 of each demo file's bytes → the page text the deterministic
 * provider returns verbatim. Registered once at service construction.
 */
export function mockOcrEntries(): Record<
  string,
  { text: string; confidence: number }
> {
  const entries: Record<string, { text: string; confidence: number }> = {};
  for (const fixture of DEMO_DOCUMENTS) {
    entries[sha256Hex(fixture.bytes)] = { text: fixture.content, confidence: 0.99 };
  }
  return entries;
}
