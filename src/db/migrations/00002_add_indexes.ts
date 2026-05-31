import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Speeds up: garden listing by user
  await db.schema.createIndex('idx_garden_userId').on('garden').column('userId').execute();

  // Speeds up: plant listing by garden, plants added count
  await db.schema
    .createIndex('idx_plant_gardenId_createdAt')
    .on('plant')
    .columns(['gardenId', 'createdAt'])
    .execute();

  // Speeds up: watering frequency query
  await db.schema
    .createIndex('idx_plant_metric_plantId_irrigationStart')
    .on('plant_metric')
    .columns(['plantId', 'lastIrrigationStartTime'])
    .execute();

  // Speeds up: latest metric lookup per plant
  await db.schema
    .createIndex('idx_plant_metric_plantId_createdAt')
    .on('plant_metric')
    .columns(['plantId', 'createdAt'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_plant_metric_plantId_createdAt').ifExists().execute();
  await db.schema.dropIndex('idx_plant_metric_plantId_irrigationStart').ifExists().execute();
  await db.schema.dropIndex('idx_plant_gardenId_createdAt').ifExists().execute();
  await db.schema.dropIndex('idx_garden_userId').ifExists().execute();
}
