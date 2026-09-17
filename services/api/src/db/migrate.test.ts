import { afterEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase, type AppDatabase } from "./kysely";
import { loadConfig } from "../config/env";
import { TEST_ENV } from "../testing/test-app";
import { runMigrations } from "./migrate";
import { MIGRATIONS } from "./migrations";

let db: AppDatabase | undefined;
afterEach(async () => {
  await db?.destroy();
  db = undefined;
});

describe("SQLite migrations", () => {
  it("reapplying migrations preserves existing records and the ledger", async () => {
    db = (await createDatabase(loadConfig(TEST_ENV).config)).db;
    await runMigrations(db, MIGRATIONS);
    const at = "2026-09-17T12:00:00.000Z";
    await db
      .insertInto("tenants")
      .values({
        id: "tenant-one",
        slug: "one",
        name: "Synthetic hospital",
        brandingJson: "{}",
        localesJson: "[]",
        settingsJson: "{}",
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      })
      .execute();
    const before =
      await sql`select * from schema_migrations order by id`.execute(db);
    const again = await runMigrations(db, MIGRATIONS);
    expect(again.applied).toEqual([]);
    expect(
      (await sql`select * from schema_migrations order by id`.execute(db)).rows,
    ).toEqual(before.rows);
    expect(
      await db
        .selectFrom("tenants")
        .select("name")
        .where("id", "=", "tenant-one")
        .executeTakeFirstOrThrow(),
    ).toEqual({ name: "Synthetic hospital" });
  });

  it("enforces tenant-scoped username uniqueness and rejects orphaned staff", async () => {
    db = (await createDatabase(loadConfig(TEST_ENV).config)).db;
    await runMigrations(db, MIGRATIONS);
    const at = "2026-09-17T12:00:00.000Z";
    const tenant = {
      id: "tenant-one",
      slug: "one",
      name: "Synthetic hospital",
      brandingJson: "{}",
      localesJson: "[]",
      settingsJson: "{}",
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    };
    await db
      .insertInto("tenants")
      .values([tenant, { ...tenant, id: "tenant-two", slug: "two" }])
      .execute();
    const user = {
      id: "staff-one",
      tenantId: tenant.id,
      username: "same-name",
      displayName: "Synthetic staff",
      passwordHash: "not-a-login-fixture",
      rolesJson: '["PHYSICIAN"]',
      active: 1,
      lastLoginAt: null,
      createdAt: at,
      updatedAt: at,
    };
    await db.insertInto("users").values(user).execute();
    await expect(
      db
        .insertInto("users")
        .values({ ...user, id: "duplicate" })
        .execute(),
    ).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT_UNIQUE" });
    await db
      .insertInto("users")
      .values({ ...user, id: "staff-two", tenantId: "tenant-two" })
      .execute();
    expect(
      (
        await db
          .selectFrom("users")
          .select("tenantId")
          .where("username", "=", user.username)
          .orderBy("tenantId")
          .execute()
      ).map((row) => row.tenantId),
    ).toEqual(["tenant-one", "tenant-two"]);
    await expect(
      db
        .insertInto("users")
        .values({ ...user, id: "orphan", tenantId: "missing" })
        .execute(),
    ).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" });
  });
});
