import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('plant').addColumn('deletedAt', 'timestamptz').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('plant').dropColumn('deletedAt').execute();
}
