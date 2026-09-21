/**
 * Console API client: JSON over fetch against the MediKiosk API.
 *
 * The staff JWT lives in sessionStorage only (never localStorage): closing the tab ends the
 * console session. Every response carries loading/error handling by the caller; this module maps
 * the API error envelope onto Error objects with `code` and `status`.
 */

const API_BASE = "";

export class ApiError extends Error {
  constructor(code, status, serverMessage) {
    super(code);
    this.code = code;
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

export function getToken() {
  return sessionStorage.getItem("medikiosk.console.token") ?? null;
}

export function setToken(token) {
  if (token) sessionStorage.setItem("medikiosk.console.token", token);
  else sessionStorage.removeItem("medikiosk.console.token");
}

export async function request(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers,
      body: payload,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiError("NETWORK_FAILED", 0, "The API could not be reached.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data?.error?.code ?? "UNKNOWN",
      response.status,
      typeof data?.error?.message === "string"
        ? data.error.message
        : undefined,
    );
  }
  return data;
}

/** Download a document's bytes (used for evidence review links). */
export async function downloadDocument(documentId, filename) {
  const token = getToken();
  const response = await fetch(
    `${API_BASE}/api/v1/documents/${encodeURIComponent(documentId)}/download`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    },
  );
  if (!response.ok) throw new ApiError("DOCUMENT_MALFORMED", response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || `document-${documentId}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
