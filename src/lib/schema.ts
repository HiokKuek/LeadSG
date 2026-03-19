import { pgTable, pgView, text, varchar } from "drizzle-orm/pg-core";

const entityColumns = {
  uen: varchar("uen", { length: 32 }).notNull(),
  entityName: text("entity_name").notNull(),
  streetName: text("street_name").notNull(),
  primarySsicCode: varchar("primary_ssic_code", { length: 5 }).notNull(),
};

export const entitiesA = pgTable("entities_a", entityColumns);

export const entitiesB = pgTable("entities_b", entityColumns);

export const activeEntities = pgView("active_entities", entityColumns).existing();
