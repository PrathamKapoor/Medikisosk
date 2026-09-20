import type { RegistrationLocale } from "@medikiosk/i18n";

export interface Device {
  id: string;
  token: string;
}
export interface Session {
  sessionId: string;
  token: string;
  expiresAt: string;
  ttlMinutes: number;
  kiosk: { id: string; name: string };
  tenant: { id: string; name: string };
}
export interface Decision {
  purpose: string;
  granted: boolean;
  categories: string[];
}
export interface ConsentRecord {
  id: string;
  sessionId: string;
  patientId: string;
  consentVersion: string;
  locale: RegistrationLocale;
  decisions: Decision[];
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  stopRequired: boolean;
}
export interface ConsentPurpose {
  key: string;
  statementKey: string;
  statement: string;
  categories: string[];
  required: boolean;
  action: string;
  destination: string;
}
export interface ConsentVersion {
  consentVersion: string;
  locale: RegistrationLocale;
  translationVersion: string;
  purposes: ConsentPurpose[];
}
export interface Challenge {
  challengeId: string;
  otpLength: number;
  expiresAt: string;
  providerName: "mock";
}
export interface Identity {
  patientId: string;
  guestRef?: string;
  verified: boolean;
  providerName: "mock";
  displayNameMasked?: string;
}
export interface SessionState {
  sessionId: string;
  patientId: string | null;
  locale: RegistrationLocale;
  status: string;
  expiresAt: string;
  remainingSeconds: number;
  step: string;
  consent?: ConsentRecord;
}
export interface Encounter {
  encounterId: string;
  status: string;
  activePathways: string[];
  interviewSessionId: string;
}
export interface QuestionOption {
  key: string;
  conceptCodes?: readonly string[];
  severity?: string;
}
export interface Question {
  key: string;
  kind:
    | "YES_NO"
    | "SINGLE_CHOICE"
    | "MULTI_CHOICE"
    | "FREE_TEXT"
    | "SEVERITY"
    | "BODY_SITE"
    | "DURATION"
    | "NUMBER"
    | "DATE"
    | "DOCUMENT_UPLOAD"
    | "INSTRUCTION";
  category: string;
  pathwayKey: string;
  promptKey: string;
  options: QuestionOption[];
  socratesDimensions: readonly string[];
  rationale: string;
  required: boolean;
  askCount: number;
}
export interface ProgressView {
  asked: number;
  activeCount: number;
  requiredClosed: number;
  requiredTotal: number;
  socratesRequiredRatio: number;
}
export interface CompletionView {
  status:
    | "IN_PROGRESS"
    | "COMPLETE"
    | "INCOMPLETE"
    | "NEEDS_CLARIFICATION"
    | "SAFETY_ESCALATION";
  outstandingRequired: readonly string[];
  outstandingReason: Readonly<Record<string, string>>;
  canFinishAnyway: boolean;
  maxQuestionsReached: boolean;
}
export interface NextResult {
  question: Question | null;
  progress: ProgressView;
  completion: CompletionView;
  safetyStatus: "GREEN" | "AMBER" | "RED" | "NOT_EVALUATED";
  requiresHumanReview: boolean;
  rationale: string | null;
}
export interface Advisory {
  key: string;
  advisory: string;
}
export interface ResponseResult {
  responseId: string;
  evidenceIds: string[];
  advisories: Advisory[];
  nextQuestionKey: string | null;
  normalisationAgreed: boolean;
  state: string;
  progress: ProgressView;
  completion: CompletionView;
  safetyStatus: string;
  requiresHumanReview: boolean;
}
export interface SubmitResult {
  status: string;
  triageLevel: string;
  priority: string;
  queueEntryId: string;
  tokenNumber: string | null;
  incomplete: boolean;
  outstandingRequired: string[];
}
export interface VitalEntry {
  code: string;
  componentCode?: "SYSTOLIC" | "DIASTOLIC";
  value: number;
  unit?: string;
}
export interface SavedVital {
  id: string;
  code: string;
  display: string;
  value: number;
  unit: string;
}
export interface HistoryEntry {
  kind: "CONDITION" | "SURGERY" | "FAMILY_HISTORY" | "HOSPITALISATION";
  conceptCode?: string;
  displayName: string;
  relation?: string;
  onsetYear?: number;
  notes?: string;
}
export interface SavedHistory {
  id: string;
  kind: string;
  displayName: string;
}
export interface MedicationEntry {
  name: string;
  conceptCode?: string;
  doseText?: string;
  frequency?: string;
  durationDays?: number;
  startedOn?: string;
}
export interface SavedMedication {
  id: string;
  name: string;
  source: string;
}
export interface AllergyEntry {
  name: string;
  conceptCode?: string;
  reaction?: string;
  severity?: string;
}
export interface SavedAllergy {
  id: string;
  name: string;
}
export interface Review {
  patient: {
    displayName: string | null;
    ageYears: number | null;
    sex: string | null;
  };
  encounter: {
    id: string;
    status: string;
    chiefComplaintCodes: string[];
    chiefComplaintVerbatim: string | null;
    patientConfirmedAt: string | null;
  };
  responses: {
    questionKey: string;
    rawAnswer: string | null;
    language: string | null;
  }[];
  symptoms: {
    displayName: string;
    severity: string | null;
    durationDays: number | null;
    patientText: string | null;
  }[];
  history: {
    id: string;
    kind: string;
    displayName: string;
    relation: string | null;
    onsetYear: number | null;
    originClass: string;
  }[];
  medications: {
    id: string;
    name: string;
    frequency: string;
    originClass: string;
  }[];
  allergies: {
    id: string;
    name: string | null;
    reaction: string | null;
    severity: string;
    originClass: string;
  }[];
  vitals: {
    id: string;
    code: string;
    componentCode: string | null;
    value: number;
    unit: string;
  }[];
  documents: {
    id: string;
    documentType: string;
    status: string;
    uploadedAt: string;
    entities: {
      id: string;
      kind: string;
      rawText: string;
      confidence: number;
      verificationState: string;
    }[];
  }[];
  evidence: {
    id: string;
    type: string;
    originClass: string;
    source: string;
    rawValue: string | null;
    confidence: number;
    verificationState: string;
  }[];
  safety: { level: string; requiresHumanReview: boolean } | null;
}
export interface DocumentEntity {
  id: string;
  kind: string;
  rawText: string;
  confidence: number;
  conceptCode?: string | null;
  testCode?: string | null;
}
export interface UploadResult {
  documentId: string;
  documentType: string;
  status: string;
  demoExtraction: boolean;
  ocrConfidence: number;
  ocrIssues: string[];
  entities: DocumentEntity[];
  alreadyExisted?: boolean;
}
export interface DemoDocument {
  name: string;
  documentType: string;
  mimeType: string;
  byteSize: number;
}
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly serverMessage?: string,
  ) {
    super(code);
  }
}

/** Keys survive a failed response only while this in-memory session is active.
 * A retry of identical input reuses its key; credentials are never part of this map. */
export class KioskApi {
  private readonly keys = new Map<string, string>();
  private readonly controllers = new Set<AbortController>();
  clear(): void {
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.keys.clear();
  }
  async request<T>(
    path: string,
    options: {
      method?: "POST" | "PATCH";
      body?: unknown;
      token?: string;
      device?: Device;
    } = {},
  ): Promise<T> {
    const body =
      options.body === undefined ? undefined : JSON.stringify(options.body);
    const signature = `${options.method ?? "GET"}:${path}:${body ?? ""}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.device) {
      headers["X-Kiosk-Id"] = options.device.id;
      headers["X-Kiosk-Token"] = options.device.token;
    }
    if (options.method) {
      let key = this.keys.get(signature);
      if (!key) {
        key = crypto.randomUUID();
        this.keys.set(signature, key);
      }
      headers["Idempotency-Key"] = key;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/v1${path}`, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const data = await response.json();
      if (!response.ok) {
        // A definite rejected mutation can be corrected and submitted as a fresh operation.
        if (response.status < 500) this.keys.delete(signature);
        throw new ApiError(
          data.error?.code ?? "UNKNOWN",
          response.status,
          typeof data.error?.message === "string"
            ? data.error.message
            : undefined,
        );
      }
      this.keys.delete(signature);
      return data as T;
    } finally {
      window.clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  /** POST /api/v1/encounters — open an OPD encounter for the interview. */
  async createEncounter(args: {
    sessionId: string;
    token: string;
    patientId: string;
    locale: string;
    chiefComplaintCodes: string[];
    chiefComplaintVerbatim?: string;
  }): Promise<Encounter> {
    return this.request<Encounter>("/encounters", {
      method: "POST",
      token: args.token,
      body: {
        patientId: args.patientId,
        sessionId: args.sessionId,
        encounterType: "OPD",
        chiefComplaintCodes: args.chiefComplaintCodes,
        chiefComplaintVerbatim: args.chiefComplaintVerbatim,
        locale: args.locale,
      },
    });
  }

  /** GET /api/v1/encounters/:id/interview/next — the engine decides the next question. */
  async nextQuestion(encounterId: string, token: string): Promise<NextResult> {
    return this.request<NextResult>(
      `/encounters/${encounterId}/interview/next`,
      { token },
    );
  }

  /** POST /api/v1/encounters/:id/interview/response — record a touch or voice answer. */
  async respond(args: {
    encounterId: string;
    token: string;
    questionKey: string;
    state?: "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN" | "NOT_APPLICABLE";
    rawAnswer?: string;
    modality?: "VOICE" | "TOUCH";
    asrConfidence?: number;
  }): Promise<ResponseResult> {
    return this.request<ResponseResult>(
      `/encounters/${args.encounterId}/interview/response`,
      {
        method: "POST",
        token: args.token,
        body: {
          questionKey: args.questionKey,
          state: args.state ?? "ANSWERED",
          rawAnswer: args.rawAnswer,
          modality: args.modality ?? "TOUCH",
          ...(args.asrConfidence === undefined
            ? {}
            : { asrConfidence: args.asrConfidence }),
        },
      },
    );
  }

  /** POST /api/v1/encounters/:id/submit — finish and queue the encounter. */
  async submitEncounter(
    encounterId: string,
    token: string,
  ): Promise<SubmitResult> {
    return this.request<SubmitResult>(`/encounters/${encounterId}/submit`, {
      method: "POST",
      token,
      body: {},
    });
  }

  /** POST /api/v1/encounters/:id/vitals — record structured measurements. */
  async recordVitals(args: {
    encounterId: string;
    token: string;
    vitals: VitalEntry[];
  }): Promise<{ vitals: SavedVital[]; safetyStatus: string }> {
    return this.request(`/encounters/${args.encounterId}/vitals`, {
      method: "POST",
      token: args.token,
      body: { vitals: args.vitals },
    });
  }

  /** POST /api/v1/encounters/:id/history — add history entries. */
  async addHistory(args: {
    encounterId: string;
    token: string;
    entries: HistoryEntry[];
  }): Promise<{ history: SavedHistory[] }> {
    return this.request(`/encounters/${args.encounterId}/history`, {
      method: "POST",
      token: args.token,
      body: { entries: args.entries },
    });
  }

  /** POST /api/v1/encounters/:id/medications — add medication entries. */
  async addMedications(args: {
    encounterId: string;
    token: string;
    medications: MedicationEntry[];
  }): Promise<{ medications: SavedMedication[] }> {
    return this.request(`/encounters/${args.encounterId}/medications`, {
      method: "POST",
      token: args.token,
      body: { medications: args.medications },
    });
  }

  /** POST /api/v1/encounters/:id/allergies — add allergies or record none known. */
  async addAllergies(args: {
    encounterId: string;
    token: string;
    allergies: AllergyEntry[];
    noKnownAllergies?: boolean;
  }): Promise<{
    allergies: SavedAllergy[];
    noKnownAllergiesRecorded: boolean;
  }> {
    return this.request(`/encounters/${args.encounterId}/allergies`, {
      method: "POST",
      token: args.token,
      body: {
        allergies: args.allergies,
        ...(args.noKnownAllergies ? { noKnownAllergies: true } : {}),
      },
    });
  }

  /** POST /api/v1/encounters/:id/clinical/remove — withdraw a patient-entered row. */
  async removeClinicalEntry(args: {
    encounterId: string;
    token: string;
    kind: "medications" | "allergies" | "history" | "vitals";
    rowId: string;
  }): Promise<{ removed: boolean }> {
    return this.request(`/encounters/${args.encounterId}/clinical/remove`, {
      method: "POST",
      token: args.token,
      body: { kind: args.kind, rowId: args.rowId },
    });
  }

  /** GET /api/v1/encounters/:id/review — the assembled record for confirmation. */
  async getReview(encounterId: string, token: string): Promise<Review> {
    return this.request<Review>(`/encounters/${encounterId}/review`, {
      token,
    });
  }

  /** POST /api/v1/encounters/:id/confirm — the explicit review gate. */
  async confirmReview(
    encounterId: string,
    token: string,
  ): Promise<{ patientConfirmedAt: string; alreadyConfirmed: boolean }> {
    return this.request(`/encounters/${encounterId}/confirm`, {
      method: "POST",
      token,
      body: {},
    });
  }

  /** GET /api/v1/demo-documents — the fixed synthetic set for attachment. */
  async listDemoDocuments(token: string): Promise<DemoDocument[]> {
    return this.request<DemoDocument[]>("/demo-documents", { token });
  }

  /** GET /api/v1/demo-documents/:name — raw bytes of one synthetic document. */
  async fetchDemoDocument(name: string, token: string): Promise<Blob> {
    const response = await fetch(
      `/api/v1/demo-documents/${encodeURIComponent(name)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (!response.ok) throw new ApiError("DOCUMENT_MALFORMED", response.status);
    return response.blob();
  }

  /** POST /api/v1/encounters/:id/documents — multipart upload with extraction. */
  async uploadDocument(args: {
    encounterId: string;
    token: string;
    file: Blob;
    filename: string;
    mimeType: string;
    documentType: string;
  }): Promise<UploadResult> {
    const form = new FormData();
    form.append("documentType", args.documentType);
    form.append("file", args.file, args.filename);
    const key = crypto.randomUUID();
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(
        `/api/v1/encounters/${args.encounterId}/documents`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${args.token}`,
            "Idempotency-Key": key,
          },
          body: form,
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new ApiError(
          data.error?.code ?? "UNKNOWN",
          response.status,
          typeof data.error?.message === "string"
            ? data.error.message
            : undefined,
        );
      return data as UploadResult;
    } finally {
      window.clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  /** POST .../documents/:id/confirm — accept the extracted information. */
  async confirmDocument(args: {
    encounterId: string;
    documentId: string;
    token: string;
  }): Promise<{ status: string }> {
    return this.request(
      `/encounters/${args.encounterId}/documents/${args.documentId}/confirm`,
      { method: "POST", token: args.token, body: {} },
    );
  }

  /** POST .../documents/:id/reject — reject a bad extraction. */
  async rejectDocument(args: {
    encounterId: string;
    documentId: string;
    token: string;
  }): Promise<{ status: string }> {
    return this.request(
      `/encounters/${args.encounterId}/documents/${args.documentId}/reject`,
      { method: "POST", token: args.token, body: {} },
    );
  }
}
