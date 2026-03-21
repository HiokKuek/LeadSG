ALTER TABLE "enrichment_jobs" ADD COLUMN "processed_rows" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD COLUMN "cache_hit_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD COLUMN "phones_found_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD COLUMN "websites_found_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "enrichment_job_items_job_uen_unique" ON "enrichment_job_items" USING btree ("job_id","uen");