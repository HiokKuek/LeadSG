CREATE TABLE "enrichment_internal_quota" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"remaining_detail_calls" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_preflight_requests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"ssic_list" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'requested' NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"projected_paid_calls" integer DEFAULT 0 NOT NULL,
	"estimated_price_usd_cents" integer DEFAULT 0 NOT NULL,
	"payment_code_id" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code_issued_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD COLUMN "preflight_request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD COLUMN "initiated_by_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_codes" ADD COLUMN "preflight_request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "payment_codes" ADD COLUMN "issued_to_user_id" text;--> statement-breakpoint
ALTER TABLE "payment_codes" ADD COLUMN "issued_by_admin_user_id" text;--> statement-breakpoint
ALTER TABLE "payment_codes" ADD COLUMN "is_single_use" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "enrichment_preflight_requests_user_id_idx" ON "enrichment_preflight_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "enrichment_preflight_requests_status_idx" ON "enrichment_preflight_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enrichment_preflight_requests_requested_at_idx" ON "enrichment_preflight_requests" USING btree ("requested_at");--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_preflight_request_id_enrichment_preflight_requests_id_fk" FOREIGN KEY ("preflight_request_id") REFERENCES "public"."enrichment_preflight_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_codes_preflight_request_id_unique" ON "payment_codes" USING btree ("preflight_request_id");