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
}
