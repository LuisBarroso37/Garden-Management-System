/// <reference types="vite/client" />
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { Pool, types } from 'pg';
import type { DB } from '../../src/db/types.js';
import { dayjs } from '../../src/utils/dayjs.js';

// Match the type parsers from src/db/index.ts
types.setTypeParser(1114, (val) => dayjs.utc(val).format('YYYY-MM-DDTHH:mm:ss[Z]'));
types.setTypeParser(1184, (val) => dayjs.utc(val).format('YYYY-MM-DDTHH:mm:ss[Z]'));
types.setTypeParser(1700, (val) => parseFloat(val));

const migrationModules = import.meta.glob<Migration>('../../src/db/migrations/*.ts', {
  eager: true,
});

const migrationProvider: MigrationProvider = {
  async getMigrations() {
    const migrations: Record<string, Migration> = {};
    for (const [path, module] of Object.entries(migrationModules)) {
      const name = path.split('/').pop()!.replace('.ts', '');
      migrations[name] = module;
    }
    return migrations;
  },
};

let container: StartedPostgreSqlContainer;

export async function startTestDatabase(): Promise<{
  database: Kysely<DB>;
  teardown: () => Promise<void>;
  truncate: (tableName: string) => Promise<void>;
}> {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();

  const connectionString = container.getConnectionUri();
  const pool = new Pool({ connectionString });
  const database = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

  const migrator = new Migrator({
    db: database,
    provider: migrationProvider,
  });

  const { error } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }

  const teardown = async () => {
    await database.destroy();
  };

  const truncate = async (tableName: string) => {
    const table = sql.table(tableName);
    await sql`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`.execute(database);
  };

  return {
    database,
    teardown,
    truncate,
  };
}
