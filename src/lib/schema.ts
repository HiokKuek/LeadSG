import {
  pgTable,
  pgView,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

const entityColumns = {
  uen: varchar("uen", { length: 32 }).notNull(),
  entityName: text("entity_name").notNull(),
  streetName: text("street_name").notNull(),
  primarySsicCode: varchar("primary_ssic_code", { length: 5 }).notNull(),
  entityStatusDescription: text("entity_status_description").notNull(),
};

export const entitiesA = pgTable("entities_a", entityColumns);

export const entitiesB = pgTable("entities_b", entityColumns);

export const activeEntities = pgView("active_entities", entityColumns).existing();

export const etlMetadata = pgTable("etl_metadata", {
  id: smallint("id").notNull().primaryKey(),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull(),
});
