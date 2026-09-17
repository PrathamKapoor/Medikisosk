import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import {
  buildTestApp,
  TEST_NOW,
  type BuiltTestApp,
} from "../../testing/test-app";
import { createLogger } from "../../platform/logger";
import { loadConfig } from "../../config/env";
import { TEST_ENV } from "../../testing/test-app";

let fixture: BuiltTestApp | undefined;
afterEach(async () => {
  await fixture?.destroy();
  fixture = undefined;
});
const credentials = {
  tenantSlug: "demo-hospital",
  username: "dr.rao",
  password: "demo-pass-1234",
};
const login = (app: BuiltTestApp["app"], payload = credentials) =>
  app.inject({ method: "POST", url: "/api/v1/auth/login", payload });

describe("staff authentication", () => {
  it("authenticates the seeded staff member, timestamps success, and audits logout without revoking a stateless token", async () => {
    fixture = await buildTestApp();
    const response = await login(fixture.app);
    expect(response.statusCode).toBe(200);
    const signedIn = response.json();
    const headers = { authorization: `Bearer ${signedIn.token}` };
    const me = await fixture.app.inject({ url: "/api/v1/auth/me", headers });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { username: "dr.rao", roles: ["PHYSICIAN"] },
      tenant: { id: fixture.tenantId },
    });
    const user = await fixture.db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", signedIn.user.id)
      .executeTakeFirstOrThrow();
    expect(user.lastLoginAt).toBe(TEST_NOW().toISOString());
    const logout = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers,
    });
    expect(logout.statusCode).toBe(204);
    const audit = await fixture.db
      .selectFrom("audit_events")
      .selectAll()
      .where("action", "=", "USER_LOGOUT")
      .executeTakeFirstOrThrow();
    expect(audit).toMatchObject({
      tenantId: fixture.tenantId,
      actorId: user.id,
      result: "SUCCESS",
    });
    expect(
      (await fixture.app.inject({ url: "/api/v1/auth/me", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await fixture.app.inject({ method: "POST", url: "/api/v1/auth/logout" }))
        .statusCode,
    ).toBe(401);
  });

  it("does not distinguish unknown users from wrong passwords or timestamp a failed login", async () => {
    fixture = await buildTestApp();
    const unknown = await login(fixture.app, {
      ...credentials,
      username: "nonexistent",
    });
    const wrong = await login(fixture.app, {
      ...credentials,
      password: "incorrect",
    });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe(wrong.json().error.code);
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
    const user = await fixture.db
      .selectFrom("users")
      .select("lastLoginAt")
      .where("username", "=", credentials.username)
      .executeTakeFirstOrThrow();
    expect(user.lastLoginAt).toBeNull();
  });

  it("rejects disabled accounts and malformed role grants", async () => {
    fixture = await buildTestApp();
    await fixture.db
      .updateTable("users")
      .set({ active: 0 })
      .where("username", "=", credentials.username)
      .execute();
    expect((await login(fixture.app)).statusCode).toBe(403);
    await fixture.db
      .updateTable("users")
      .set({ active: 1, rolesJson: '["NOT_A_ROLE"]' })
      .where("username", "=", credentials.username)
      .execute();
    expect((await login(fixture.app)).statusCode).toBe(403);
    expect(
      (
        await fixture.app.inject({
          url: "/api/v1/auth/me",
          headers: { authorization: "Bearer invalid" },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("continues login when last-login storage fails without emitting the database error payload", async () => {
    const logger = createLogger(loadConfig(TEST_ENV).config);
    const logged = vi.spyOn(logger, "error");
    fixture = await buildTestApp({ logger });
    await sql`create trigger reject_last_login before update of lastLoginAt on users
      begin select raise(ABORT, 'sensitive-database-payload'); end`.execute(
      fixture.db,
    );
    expect((await login(fixture.app)).statusCode).toBe(200);
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain(
      "sensitive-database-payload",
    );
  });

  it("expires the issued staff token at the advertised instant using the application clock", async () => {
    let now = TEST_NOW();
    fixture = await buildTestApp({ now: () => now });
    const response = await login(fixture.app);
    expect(response.statusCode).toBe(200);
    const signedIn = response.json();
    const headers = { authorization: `Bearer ${signedIn.token}` };
    now = new Date(new Date(signedIn.expiresAt).getTime() - 1000);
    expect(
      (await fixture.app.inject({ url: "/api/v1/auth/me", headers }))
        .statusCode,
    ).toBe(200);
    now = new Date(signedIn.expiresAt);
    expect(
      (await fixture.app.inject({ url: "/api/v1/auth/me", headers }))
        .statusCode,
    ).toBe(401);
  });

  it("bounds login attempts per source address without throttling health checks", async () => {
    fixture = await buildTestApp();
    for (let attempt = 0; attempt < 5; attempt++) {
      // Invalid bodies avoid bcrypt while exercising the same early route throttle.
      const response = await fixture.app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    }
    const limited = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {},
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
    expect((await fixture.app.inject({ url: "/health" })).statusCode).toBe(200);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          remoteAddress: "127.0.0.2",
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });
});
