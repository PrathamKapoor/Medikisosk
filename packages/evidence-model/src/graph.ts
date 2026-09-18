/**
 * Evidence provenance graph.
 *
 * Models the tiered chain a physician inspects in the evidence trace: a SOURCE evidence row → the
 * FACT it supports → the ASSESSMENT (triage rule) that referenced that fact. All assembly here is
 * a pure function of the inputs; nothing is fetched, derived or guessed.
 */

/** The provenance source kind of an evidence row. */
export type EvidenceSourceKind =
  "QUESTIONNAIRE_RESPONSE" | "DOCUMENT" | "VITAL" | "PHYSICIAN_NOTE" | "SYSTEM";

/** The tier of a trace node in the SOURCE → FACT → ASSESSMENT chain. */
export type TraceTier = "SOURCE" | "FACT" | "ASSESSMENT";

export interface TraceNode {
  tier: TraceTier;
  kind: string;
  label: string;
  detailJson?: string;
  evidenceId?: string;
  timestamp?: string;
  confidence?: number;
}

/** A single clinical fact referenced by assessments, backed by source evidence. */
export interface TraceFact {
  kind: string;
  label: string;
  detailJson?: string;
  evidenceId?: string;
  timestamp?: string;
  confidence?: number;
}

/** A single assessed rule hit that references a fact. */
export interface TraceAssessment {
  kind: string;
  label: string;
  detailJson?: string;
  evidenceId?: string;
  timestamp?: string;
  confidence?: number;
}

export interface TraceInput {
  source: {
    kind: EvidenceSourceKind;
    label: string;
    detailJson?: string;
    evidenceId?: string;
    timestamp?: string;
    confidence?: number;
  };
  fact: TraceFact;
  assessments: readonly TraceAssessment[];
}

/**
 * Assemble a tiered, ordered trace: source evidence → the fact it supports → the assessments that
 * cite that fact. Empty assessments assemblies yield just [source, fact].
 */
export function renderTrace(input: TraceInput): readonly TraceNode[] {
  const source: TraceNode = {
    tier: "SOURCE",
    kind: input.source.kind,
    label: input.source.label,
    ...(input.source.detailJson === undefined
      ? {}
      : { detailJson: input.source.detailJson }),
    ...(input.source.evidenceId === undefined
      ? {}
      : { evidenceId: input.source.evidenceId }),
    ...(input.source.timestamp === undefined
      ? {}
      : { timestamp: input.source.timestamp }),
    ...(input.source.confidence === undefined
      ? {}
      : { confidence: input.source.confidence }),
  };
  const fact: TraceNode = {
    tier: "FACT",
    kind: input.fact.kind,
    label: input.fact.label,
    ...(input.fact.detailJson === undefined
      ? {}
      : { detailJson: input.fact.detailJson }),
    ...(input.fact.evidenceId === undefined
      ? {}
      : { evidenceId: input.fact.evidenceId }),
    ...(input.fact.timestamp === undefined
      ? {}
      : { timestamp: input.fact.timestamp }),
    ...(input.fact.confidence === undefined
      ? {}
      : { confidence: input.fact.confidence }),
  };
  const assessments: TraceNode[] = input.assessments.map((assessment) => ({
    tier: "ASSESSMENT" as const,
    kind: assessment.kind,
    label: assessment.label,
    ...(assessment.detailJson === undefined
      ? {}
      : { detailJson: assessment.detailJson }),
    ...(assessment.evidenceId === undefined
      ? {}
      : { evidenceId: assessment.evidenceId }),
    ...(assessment.timestamp === undefined
      ? {}
      : { timestamp: assessment.timestamp }),
    ...(assessment.confidence === undefined
      ? {}
      : { confidence: assessment.confidence }),
  }));
  return [source, fact, ...assessments];
}

/**
 * A graph view of the trace for the evidence UI. Nodes are the trace nodes (a stable id is derived
 * from the evidence id, falling back to a positional key); edges run source→fact and fact→each
 * assessment.
 */
export interface EvidenceGraphNode extends TraceNode {
  readonly id: string;
}

export interface EvidenceGraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface EvidenceGraph {
  readonly nodes: readonly EvidenceGraphNode[];
  readonly edges: readonly EvidenceGraphEdge[];
}

/** Derive a stable node id from the trace. */
function nodeId(node: TraceNode, index: number): string {
  return node.evidenceId
    ? `evidence:${node.evidenceId}`
    : `${node.tier}:${index}`;
}

/** Build a graph from an assembled trace. The first node is the source, the second the fact. */
export function buildEvidenceGraph(trace: readonly TraceNode[]): EvidenceGraph {
  const nodes = trace.map((node, index) => ({
    ...node,
    id: nodeId(node, index),
  }));
  const edges: EvidenceGraphEdge[] = [];
  if (nodes.length >= 2) {
    edges.push({ from: nodes[0]!.id, to: nodes[1]!.id });
    for (let i = 2; i < nodes.length; i++) {
      edges.push({ from: nodes[1]!.id, to: nodes[i]!.id });
    }
  }
  return { nodes, edges };
}

/** A reference from a fact to an evidence id. */
export interface EvidenceReference {
  readonly evidenceId: string;
}

/**
 * Group flat evidence rows by the facts that reference them. `factRefs` maps a fact key to the
 * evidence ids that fact cites; the result maps each fact key to the subset of `evidence` whose id
 * is referenced, preserving input order.
 */
export function groupEvidenceByFact(
  evidence: readonly EvidenceReference[],
  factRefs: Readonly<Record<string, readonly string[]>>,
): Record<string, readonly EvidenceReference[]> {
  const byId = new Map(evidence.map((e) => [e.evidenceId, e]));
  const result: Record<string, readonly EvidenceReference[]> = {};
  for (const [factKey, refs] of Object.entries(factRefs)) {
    const selected: EvidenceReference[] = [];
    for (const ref of refs) {
      const row = byId.get(ref);
      if (row) selected.push(row);
    }
    result[factKey] = selected;
  }
  return result;
}
