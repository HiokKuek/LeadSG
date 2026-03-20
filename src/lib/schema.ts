import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
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

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  tier: varchar("tier", { length: 32 }).notNull().default("free"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const paymentCodes = pgTable("payment_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  totalDetailCalls: integer("total_detail_calls").notNull(),
  remainingDetailCalls: integer("remaining_detail_calls").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  codeUnique: uniqueIndex("payment_codes_code_unique").on(table.code),
}));

export const paymentCodeRedemptions = pgTable("payment_code_redemptions", {
  id: serial("id").primaryKey(),
  paymentCodeId: integer("payment_code_id").notNull().references(() => paymentCodes.id),
  userId: integer("user_id").notNull().references(() => users.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paymentCodeIdUnique: uniqueIndex("payment_code_redemptions_payment_code_id_unique").on(table.paymentCodeId),
  userIdIdx: index("payment_code_redemptions_user_id_idx").on(table.userId),
}));

export const companyContactEnrichment = pgTable("company_contact_enrichment", {
  uen: varchar("uen", { length: 32 }).notNull().primaryKey(),
  placeId: varchar("place_id", { length: 128 }),
  foundName: text("found_name"),
  nationalPhoneNumber: text("national_phone_number"),
  internationalPhoneNumber: text("international_phone_number"),
  websiteUri: text("website_uri"),
  formattedAddress: text("formatted_address"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  errorStage: varchar("error_stage", { length: 64 }),
  errorCode: varchar("error_code", { length: 64 }),
  errorMessage: text("error_message"),
  attemptsSearch: integer("attempts_search").notNull().default(0),
  attemptsDetails: integer("attempts_details").notNull().default(0),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expiresAtIdx: index("company_contact_enrichment_expires_at_idx").on(table.expiresAt),
  statusIdx: index("company_contact_enrichment_status_idx").on(table.status),
}));

export const enrichmentJobs = pgTable("enrichment_jobs", {
  id: varchar("id", { length: 64 }).notNull().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  paymentCodeId: integer("payment_code_id").references(() => paymentCodes.id),
  ssicList: jsonb("ssic_list").$type<string[]>().notNull(),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  estimatedCandidateCount: integer("estimated_candidate_count").notNull().default(0),
  estimatedCacheHitCount: integer("estimated_cache_hit_count").notNull().default(0),
  estimatedPaidCalls: integer("estimated_paid_calls").notNull().default(0),
  reservedPaidCalls: integer("reserved_paid_calls").notNull().default(0),
  consumedPaidCalls: integer("consumed_paid_calls").notNull().default(0),
  estimatedMaxCostUsd: integer("estimated_max_cost_usd_cents").notNull().default(0),
  stopReason: varchar("stop_reason", { length: 64 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => ({
  userIdIdx: index("enrichment_jobs_user_id_idx").on(table.userId),
  statusIdx: index("enrichment_jobs_status_idx").on(table.status),
  createdAtIdx: index("enrichment_jobs_created_at_idx").on(table.createdAt),
}));

export const enrichmentJobItems = pgTable("enrichment_job_items", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 64 }).notNull().references(() => enrichmentJobs.id),
  uen: varchar("uen", { length: 32 }).notNull(),
  primarySsicCode: varchar("primary_ssic_code", { length: 5 }).notNull(),
  cacheHit: boolean("cache_hit").notNull().default(false),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  searchStatus: varchar("search_status", { length: 32 }),
  detailsStatus: varchar("details_status", { length: 32 }),
  attemptsSearch: integer("attempts_search").notNull().default(0),
  attemptsDetails: integer("attempts_details").notNull().default(0),
  costUnits: integer("cost_units").notNull().default(0),
  errorCode: varchar("error_code", { length: 64 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  jobIdIdx: index("enrichment_job_items_job_id_idx").on(table.jobId),
  uenIdx: index("enrichment_job_items_uen_idx").on(table.uen),
  statusIdx: index("enrichment_job_items_status_idx").on(table.status),
}));
