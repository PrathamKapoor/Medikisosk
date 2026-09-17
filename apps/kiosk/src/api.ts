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
  incomplete: boolean;
  outstandingRequired: string[];
}
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
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
        throw new ApiError(data.error?.code ?? "UNKNOWN", response.status);
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

  /** POST /api/v1/encounters/:id/interview/response — record a touch answer. */
  async respond(args: {
    encounterId: string;
    token: string;
    questionKey: string;
    state?: "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN" | "NOT_APPLICABLE";
    rawAnswer?: string;
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
          modality: "TOUCH",
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
}
