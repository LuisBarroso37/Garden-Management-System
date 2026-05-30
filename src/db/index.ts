import { Pool, types } from 'pg';
import { Kysely, LogEvent, PostgresDialect } from 'kysely';
import type { DB } from './types.js';
import { dayjs } from '../utils/dayjs.js';

// PostgreSQL OIDs
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;
const NUMERIC_OID = 1700;

// Return timestamps as ISO strings without milliseconds
types.setTypeParser(TIMESTAMP_OID, (val) => dayjs.utc(val).format('YYYY-MM-DDTHH:mm:ss[Z]'));
types.setTypeParser(TIMESTAMPTZ_OID, (val) => dayjs.utc(val).format('YYYY-MM-DDTHH:mm:ss[Z]'));
// Return numeric/decimal as number instead of string
types.setTypeParser(NUMERIC_OID, (val) => parseFloat(val));

let kyselyClient: Kysely<DB> | undefined;

const logRawQuery = (event: LogEvent) => {
  console.info(`[QUERY_DURATION]: [${event.queryDurationMillis}]`);
  console.info(`[QUERY]: [${event.query.sql}]`);
};

export const createKyselyDatabaseClient = (): Kysely<DB> => {
  if (kyselyClient) {
    return kyselyClient;
  }

  const dialect = new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: true,
    }),
  });

  kyselyClient = new Kysely<DB>({
    dialect,
    log: logRawQuery,
  });

  return kyselyClient;
};
