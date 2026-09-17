/**
 * Migration 0007 — documents and their extracted entities.
 *
 * Document bytes are stored outside the database (`storagePath`); only metadata and extraction results
 * live here. Keeping multi-megabyte scans out of the relational store keeps backup, restore and
 * replication workable, and it lets page images be deleted on session wipe without touching the
 * clinical record.
 */

import type { Kysely } from 'kysely';

export const MIGRATION_0007_DOCUMENTS = {
  id: '0007_documents',
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable('documents')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('documentType', 'varchar(32)', (col) => col.notNull())
      .addColumn('mimeType', 'varchar(64)', (col) => col.notNull())
      .addColumn('byteSize', 'integer', (col) => col.notNull())
      .addColumn('pageCount', 'integer', (col) => col.notNull())
      .addColumn('storagePath', 'varchar(400)', (col) => col.notNull())
      .addColumn('checksum', 'varchar(128)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('qualityJson', 'text', (col) => col.notNull())
      .addColumn('ocrConfidence', 'double precision')
      .addColumn('uploadedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('processedAt', 'varchar(30)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('deletedAt', 'varchar(30)')
      .execute();

    await schema
      .createIndex('idx_documents_encounter')
      .on('documents')
      .columns(['tenantId', 'encounterId'])
      .execute();

    await schema
      .createTable('document_pages')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('documentId', 'varchar(26)', (col) => col.notNull().references('documents.id'))
      .addColumn('pageNumber', 'integer', (col) => col.notNull())
      // OCR text is transient-adjacent: it is purged with the session wipe, while the extracted facts
      // and their evidence rows survive because they are part of the record.
      .addColumn('ocrText', 'text')
      .addColumn('qualityScore', 'double precision')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_document_pages')
      .on('document_pages')
      .columns(['documentId', 'pageNumber'])
      .execute();

    await schema
      .createTable('document_entities')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('documentId', 'varchar(26)', (col) => col.notNull().references('documents.id'))
      .addColumn('kind', 'varchar(32)', (col) => col.notNull())
      .addColumn('conceptCode', 'varchar(64)')
      .addColumn('testCode', 'varchar(64)')
      .addColumn('rawText', 'text', (col) => col.notNull())
      .addColumn('normalisedJson', 'text', (col) => col.notNull())
      .addColumn('flag', 'varchar(16)')
      .addColumn('confidence', 'double precision', (col) => col.notNull())
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      // Set below the confidence review threshold, and consulted before the entity may affect triage.
      .addColumn('needsClinicianReview', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('evidenceId', 'varchar(26)')
      .addColumn('verifiedAt', 'varchar(30)')
      .addColumn('verifiedBy', 'varchar(26)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_doc_entities_document')
      .on('document_entities')
      .columns(['tenantId', 'documentId'])
      .execute();
  },
};