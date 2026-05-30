import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('firstName', 'varchar(100)', (col) => col.notNull())
    .addColumn('lastName', 'varchar(100)', (col) => col.notNull())
    .addColumn('age', 'integer', (col) => col.notNull())
    .addColumn('email', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('createdAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn('updatedAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable('garden')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('userId', 'uuid', (col) => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('totalSurfaceArea', sql`decimal(10,2)`, (col) => col.notNull())
    .addColumn('locationDescription', 'varchar(500)')
    .addColumn('targetHumidityLevel', sql`decimal(5,2)`)
    .addColumn('createdAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn('updatedAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema.createType('plant_type').asEnum(['vegetable', 'fruit', 'flower']).execute();

  await db.schema
    .createTable('plant')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gardenId', 'uuid', (col) =>
      col.notNull().references('garden.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('species', 'varchar(200)', (col) => col.notNull())
    .addColumn('plantType', sql`plant_type`, (col) => col.notNull())
    .addColumn('plantationDate', 'timestamptz', (col) => col.notNull())
    .addColumn('surfaceAreaRequired', sql`decimal(10,2)`, (col) => col.notNull())
    .addColumn('idealHumidityLevel', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn('updatedAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable('plant_metric')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('plantId', 'uuid', (col) => col.notNull().references('plant.id').onDelete('cascade'))
    .addColumn('currentHumidityLevel', sql`decimal(5,2)`, (col) => col.notNull().defaultTo(50))
    .addColumn('lastIrrigationStartTime', 'timestamptz')
    .addColumn('lastIrrigationEndTime', 'timestamptz')
    .addColumn('createdAt', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('plant_metric').ifExists().execute();
  await db.schema.dropTable('plant').ifExists().execute();
  await db.schema.dropType('plant_type').ifExists().execute();
  await db.schema.dropTable('garden').ifExists().execute();
  await db.schema.dropTable('user').ifExists().execute();
}
