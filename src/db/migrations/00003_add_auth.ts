import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('user')
    .addColumn('passwordHash', 'varchar(255)', (col) => col.notNull().defaultTo(''))
    .execute();

  await db.schema
    .createTable('refresh_token')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('userId', 'uuid', (col) => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('tokenHash', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
    .addColumn('createdAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createIndex('idx_refresh_token_userId')
    .on('refresh_token')
    .column('userId')
    .execute();

  await db.schema
    .createIndex('idx_refresh_token_expiresAt')
    .on('refresh_token')
    .column('expiresAt')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('refresh_token').execute();
  await db.schema.alterTable('user').dropColumn('passwordHash').execute();
}
