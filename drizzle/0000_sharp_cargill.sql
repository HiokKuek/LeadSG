CREATE TABLE IF NOT EXISTS "company_contact_enrichment" (
	"uen" varchar(32) PRIMARY KEY NOT NULL,
	"place_id" varchar(128),
	"found_name" text,
	"national_phone_number" text,
	"international_phone_number" text,
	"website_uri" text,
	"formatted_address" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"error_stage" varchar(64),
	"error_code" varchar(64),
	"error_message" text,
	"attempts_search" integer DEFAULT 0 NOT NULL,
	"attempts_details" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrichment_job_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" varchar(64) NOT NULL,
	"uen" varchar(32) NOT NULL,
	"primary_ssic_code" varchar(5) NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"search_status" varchar(32),
	"details_status" varchar(32),
	"attempts_search" integer DEFAULT 0 NOT NULL,
	"attempts_details" integer DEFAULT 0 NOT NULL,
	"cost_units" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrichment_jobs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"payment_code_id" integer,
	"ssic_list" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"estimated_candidate_count" integer DEFAULT 0 NOT NULL,
	"estimated_cache_hit_count" integer DEFAULT 0 NOT NULL,
	"estimated_paid_calls" integer DEFAULT 0 NOT NULL,
	"reserved_paid_calls" integer DEFAULT 0 NOT NULL,
	"consumed_paid_calls" integer DEFAULT 0 NOT NULL,
	"estimated_max_cost_usd_cents" integer DEFAULT 0 NOT NULL,
	"stop_reason" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entities_a" (
	"uen" text NOT NULL,
	"entity_name" text NOT NULL,
	"street_name" text NOT NULL,
	"primary_ssic_code" varchar(5) NOT NULL,
	"entity_status_description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entities_b" (
	"uen" text NOT NULL,
	"entity_name" text NOT NULL,
	"street_name" text NOT NULL,
	"primary_ssic_code" varchar(5) NOT NULL,
	"entity_status_description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "etl_metadata" (
	"id" smallint PRIMARY KEY NOT NULL,
	"last_updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_code_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_code_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"total_detail_calls" integer NOT NULL,
	"remaining_detail_calls" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"tier" varchar(32) DEFAULT 'free' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrichment_job_items" ADD CONSTRAINT "enrichment_job_items_job_id_enrichment_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."enrichment_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_payment_code_id_payment_codes_id_fk" FOREIGN KEY ("payment_code_id") REFERENCES "public"."payment_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_code_redemptions" ADD CONSTRAINT "payment_code_redemptions_payment_code_id_payment_codes_id_fk" FOREIGN KEY ("payment_code_id") REFERENCES "public"."payment_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_code_redemptions" ADD CONSTRAINT "payment_code_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_contact_enrichment_expires_at_idx" ON "company_contact_enrichment" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "company_contact_enrichment_status_idx" ON "company_contact_enrichment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enrichment_job_items_job_id_idx" ON "enrichment_job_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "enrichment_job_items_uen_idx" ON "enrichment_job_items" USING btree ("uen");--> statement-breakpoint
CREATE INDEX "enrichment_job_items_status_idx" ON "enrichment_job_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enrichment_jobs_user_id_idx" ON "enrichment_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "enrichment_jobs_status_idx" ON "enrichment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enrichment_jobs_created_at_idx" ON "enrichment_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_code_redemptions_payment_code_id_unique" ON "payment_code_redemptions" USING btree ("payment_code_id");--> statement-breakpoint
CREATE INDEX "payment_code_redemptions_user_id_idx" ON "payment_code_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_codes_code_unique" ON "payment_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");