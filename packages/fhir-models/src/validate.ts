/**
 * Self-implemented structural validator for the exported FHIR subset.
 *
 * Deliberately NOT a full FHIR validator: it checks the invariants the demo export promises —
 * Bundle shape, resource types, required reference wiring, value presence — so a broken mapper
 * or a bad row fails loudly instead of producing an empty bundle. It never calls a network
 * validator (none is available in the demo environment).
 */

import type { FhirBundle, FhirResource } from "./types";

export interface ValidationIssue {
  readonly path: string;
  readonly problem: string;
}

const REQUIRED_INTEGRATION_RESOURCES = new Set(["Patient", "Encounter"]);

const PATIENT_ID_PATTERN = /^[A-Za-z0-9\-\.]{1,64}$/;

/**
 * Structural validation of the bundle. Returns every problem found (an empty list means valid).
 */
export function validateBundle(bundle: FhirBundle): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (path: string, problem: string) =>
    issues.push({ path, problem });

  if (bundle.resourceType !== "Bundle")
    push("Bundle", "resourceType must be 'Bundle'");
  if (!bundle.timestamp) push("Bundle.timestamp", "timestamp is required");
  if (!Array.isArray(bundle.entry))
    push("Bundle.entry", "entry array is required");

  const seen = new Map<string, FhirResource>();
  for (const [index, entry] of (bundle.entry ?? []).entries()) {
    const resource = entry?.resource;
    if (!resource || typeof resource !== "object") {
      push(`Bundle.entry[${index}]`, "entry.resource is required");
      continue;
    }
    const path = `Bundle.entry[${index}].resource`;
    if (!resource.resourceType) push(path, "resourceType is required");
    if (typeof resource.id !== "string" || !resource.id) {
      push(`${path}.id`, "resource id is required");
    }
    const key = `${resource.resourceType}/${resource.id}`;
    if (seen.has(key)) push(path, `duplicate resource ${key}`);
    else seen.set(key, resource);
  }

  // The integration minimum: exactly one Patient and one Encounter.
  for (const required of REQUIRED_INTEGRATION_RESOURCES) {
    const matching = [...seen.keys()].filter((key) =>
      key.startsWith(`${required}/`),
    );
    if (matching.length === 0)
      push("Bundle", `${required} resource is required`);
    if (matching.length > 1)
      push("Bundle", `multiple ${required} resources are not supported`);
  }

  // Reference wiring: every subject/patient/encounter reference must resolve in-bundle.
  for (const [key, resource] of seen) {
    for (const referenceField of ["subject", "patient", "encounter"]) {
      const value = resource[referenceField] as
        { reference?: string } | undefined;
      const target = value?.reference;
      if (!target) continue;
      if (!seen.has(target))
        push(
          `${key}.${referenceField}`,
          `reference ${target} does not resolve inside the bundle`,
        );
    }
  }

  // Patient shape: the identifier must be a non-empty string; names are optional (guest patients).
  const patient = [...seen.values()].find((r) => r.resourceType === "Patient");
  if (patient) {
    const identifier = patient["identifier"] as
      { value?: string }[] | undefined;
    const value = identifier?.[0]?.value;
    if (typeof value !== "string" || !PATIENT_ID_PATTERN.test(value))
      push(
        "Patient.identifier[0].value",
        "patient identifier is missing or malformed",
      );
  }

  // Observation shape: numeric value present.
  for (const [key, resource] of seen) {
    if (resource.resourceType !== "Observation") continue;
    const quantity = resource["valueQuantity"] as
      { value?: unknown; unit?: unknown } | undefined;
    if (typeof quantity?.value !== "number")
      push(
        `${key}.valueQuantity.value`,
        "observation must carry a numeric value",
      );
    if (typeof quantity?.unit !== "string" || !quantity.unit)
      push(`${key}.valueQuantity.unit`, "observation must carry a unit");
  }

  return issues;
}

/** Validate and throw a descriptive error listing every issue (used by the API export route). */
export function assertValidBundle(bundle: FhirBundle): void {
  const issues = validateBundle(bundle);
  if (issues.length > 0) {
    const summary = issues
      .map((issue) => `${issue.path}: ${issue.problem}`)
      .join("; ");
    throw new Error(`FHIR bundle validation failed: ${summary}`);
  }
}
