import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { Transaction } from "kysely";
import {
  errors,
  MediKioskError,
  type ErrorCode,
} from "@medikiosk/shared-types";
import type { AppDatabase } from "../db/kysely";
import type { Database } from "../db/schema";

export type MutationResult = {
  status: number;
  body: unknown;
  error?: { code: ErrorCode; message: string };
};
export function failure(code: ErrorCode, message: string): MutationResult {
  const error = new MediKioskError(code, message);
  return { status: error.status, body: null, error: { code, message } };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function seal(value: MutationResult, key: Buffer, scope: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(scope));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}
function unseal(value: string, key: Buffer, scope: string): MutationResult {
  const [iv, tag, data] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data) throw new Error("Invalid replay ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(scope));
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"),
  ) as MutationResult;
}
export async function replayMutation(options: {
  db: AppDatabase;
  secret: string;
  tenantId: string;
  actor: string;
  route: string;
  key: string | undefined;
  body: unknown;
  sessionId: string | null;
  now: Date;
  expiresAt: string;
  authenticate: (tx: Transaction<Database>) => Promise<void>;
  execute: (tx: Transaction<Database>) => Promise<MutationResult>;
}): Promise<MutationResult> {
  if (
    !options.key ||
    !/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9A-HJKMNP-TV-Z]{26})$/i.test(
      options.key,
    )
  )
    throw errors.validation("Idempotency-Key must be a UUID or ULID.");
  const scope = `${options.tenantId}:${options.actor}:${options.route}`;
  const key = createHash("sha256").update(options.secret).digest();
  const storedKey = createHash("sha256")
    .update(`${scope}:${options.key}`)
    .digest("hex");
  // Keyed digest prevents offline guessing of the short synthetic OTP from a database copy.
  const requestHash = createHmac("sha256", key)
    .update(canonical(options.body))
    .digest("hex");
  return options.db.transaction().execute(async (tx) => {
    await options.authenticate(tx);
    // INSERT ON CONFLICT serializes concurrent requests sharing a key on both dialects.
    const inserted = await tx
      .insertInto("idempotency_keys")
      .values({
        key: storedKey,
        tenantId: options.tenantId,
        route: options.route,
        requestHash,
        statusCode: 0,
        responseJson: "",
        createdAt: options.now.toISOString(),
        expiresAt: options.expiresAt,
        sessionId: options.sessionId,
      })
      .onConflict((oc) => oc.column("key").doNothing())
      .executeTakeFirst();
    if (Number(inserted.numInsertedOrUpdatedRows) === 0) {
      const previous = await tx
        .selectFrom("idempotency_keys")
        .selectAll()
        .where("key", "=", storedKey)
        .where("tenantId", "=", options.tenantId)
        .executeTakeFirstOrThrow();
      if (previous.requestHash !== requestHash)
        throw new MediKioskError(
          "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
          "This key was already used with different input.",
        );
      if (previous.expiresAt <= options.now.toISOString())
        throw errors.conflict("This replay window has expired. Use a new key.");
      return unseal(previous.responseJson, key, scope);
    }
    const result = await options.execute(tx);
    await tx
      .updateTable("idempotency_keys")
      .set({
        statusCode: result.status,
        responseJson: seal(result, key, scope),
      })
      .where("key", "=", storedKey)
      .execute();
    return result;
  });
}
