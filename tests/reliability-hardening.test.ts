import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:reliability'], 'node --import tsx tests/reliability-hardening.test.ts');

const registry = read('services/queue/jobRegistry.ts');
assert.match(registry, /maxAttempts:\s*number/);
assert.match(registry, /csv\.import\.process/);
assert.match(registry, /document\.ingest\.process/);
assert.match(registry, /memory\.relationship\.upsert/);
assert.match(registry, /customer\.health\.recalculate/);

const reliability = read('services/queue/reliability.ts');
assert.match(reliability, /buildGatewayIdempotencyKey/);
assert.match(reliability, /organizationId\?: string/);
assert.match(reliability, /failureCategory:\s*QueueFailureCategory/);
assert.match(reliability, /status: exhausted \? 'FAILED' : 'QUEUED'/);
assert.match(reliability, /status:\s*'DEAD_LETTERED'/);
assert.match(reliability, /createOutboxEvent/);

const worker = read('services/queue/worker.ts');
assert.match(worker, /AUTHENTICATION/);
assert.match(worker, /VALIDATION/);
assert.match(worker, /TRANSIENT/);
assert.doesNotMatch(worker, /category:\s*'AUTH'/);
assert.doesNotMatch(worker, /category:\s*'PROVIDER'/);

const gateway = read('services/gateway/universalGateway.ts');
assert.match(gateway, /decision:\s*buildGatewayMessage\(input\)/);
assert.match(gateway, /subject:\s*input\.subject/);
assert.match(gateway, /approverEmail:\s*input\.approver_email/);

const founder = read('services/founder.ts');
assert.match(founder, /prisma\.backgroundJob\.count/);
assert.match(founder, /prisma\.deadLetterJob\.count/);
assert.match(founder, /prisma\.outboxEvent\.count/);
assert.match(founder, /Dead letter ·/);
assert.match(founder, /Outbox event ·/);

const operationsPage = read('app/founder/operations/page.tsx');
assert.match(operationsPage, /Queued jobs and outbox events/);
assert.match(operationsPage, /Universal Gateway outbox or dead-letter failures/);

const classifierPersistence = read('services/classifier/persistence.ts');
assert.match(classifierPersistence, /failureReason:\s*error instanceof Error \? error\.message : 'Classifier persistence failed'/);

const migration = read('prisma/migrations/20260717153000_week3_reliability_hardening/migration.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS "IdempotencyRecord"/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS "BackgroundJob"/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS "DeadLetterJob"/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS "OutboxEvent"/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS "WorkerHeartbeat"/);

const repairMigration = read('prisma/migrations/20260719170000_repair_reliability_columns/migration.sql');
for (const table of ['MessageSource', 'ApprovalRecord', 'ClassifierResult', 'Event']) {
  assert.match(repairMigration, new RegExp(`ALTER TABLE "${table}"`));
}
for (const column of [
  'duplicateDisposition',
  'duplicateReason',
  'sourceSystem',
  'sourceRecordId',
  'contentHash',
  'correlationId',
  'idempotencyKey',
]) {
  assert.match(repairMigration, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
}
assert.match(repairMigration, /MessageSource_organizationId_provider_externalId_key/);
assert.match(repairMigration, /ClassifierResult_organizationId_idempotencyKey_key/);

const playbooks = read('services/playbooks.ts');
assert.doesNotMatch(playbooks, /^import .* from ["']pdf-parse["'];/m);
assert.match(playbooks, /await import\(["']pdf-parse["']\)/);

console.log('Validated Week 3 reliability hardening wiring, schema-drift repair, and lazy server-side PDF parsing.');
