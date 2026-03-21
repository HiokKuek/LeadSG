ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "users" CASCADE;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" DROP CONSTRAINT "enrichment_jobs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_code_redemptions" DROP CONSTRAINT "payment_code_redemptions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "payment_code_redemptions" ALTER COLUMN "user_id" SET DATA TYPE text;