import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Kysely, PostgresDialect } from 'kysely';
import { Migrator, FileMigrationProvider } from 'kysely/migration';
import { Pool } from 'pg';
import { DB } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function rollback() {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: process.env.DATABASE_URL }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`Rollback "${it.migrationName}" executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`Rollback "${it.migrationName}" failed`);
    }
  });

  if (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  }

  await db.destroy();
}

rollback();
