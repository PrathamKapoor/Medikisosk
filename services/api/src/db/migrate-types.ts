/**
 * The dialect-neutral migration builder.
 *
 * Each migration calls these helpers instead of writing SQL, so the same migration set produces
 * correct DDL on SQLite and on Postgres (ADR-002). The helpers deliberately expose only the
 * intersection both engines support well; anything cleverer belongs in application code.
 */

export interface ColumnBuilder {
  primaryKey(): ColumnBuilder;
  notNull(): ColumnBuilder;
  nullable(): ColumnBuilder;
  defaultTo(value: string | number): ColumnBuilder;
  unique(): ColumnBuilder;
  references(table: string, column: string): ColumnBuilder;
}

export interface TableBuilder {
  text(name: string, length?: number): ColumnBuilder;
  integer(name: string): ColumnBuilder;
  real(name: string): ColumnBuilder;
  boolean(name: string): ColumnBuilder;
  timestamp(name: string): ColumnBuilder;
  date(name: string): ColumnBuilder;
  json(name: string): ColumnBuilder;
  tenant(name: string): ColumnBuilder;
}

export interface MigrationBuilder {
  createTable(name: string, build: (table: TableBuilder) => void, primaryKey?: readonly string[]): Promise<void>;
  dropTable(name: string): Promise<void>;
  createIndex(table: string, name: string, columns: readonly string[], unique?: boolean): Promise<void>;
  dropIndex(name: string): Promise<void>;
}

export interface Migration {
  readonly id: string;
  readonly up: (builder: MigrationBuilder) => Promise<void>;
  readonly down: (builder: MigrationBuilder) => Promise<void>;
}

export const MIGRATION_TABLE = 'schema_migrations';