CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "public"."accreditation_status" AS ENUM('not_accredited', 'accredited', 'not_sure', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."lead_intent" AS ENUM('accreditation', 'advertising', 'ignite', 'both', 'out_of_scope', 'redirect_bbb_org');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('pending_verification', 'verified', 'fulfilled', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('access', 'correct', 'delete');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "lead_status" DEFAULT 'in_progress' NOT NULL,
	"intent" "lead_intent" NOT NULL,
	"accreditation_status" "accreditation_status" NOT NULL,
	"is_ct_business" boolean NOT NULL,
	"business_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"last_step_key" text,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_type" "privacy_request_type" NOT NULL,
	"email" text NOT NULL,
	"lead_id" uuid,
	"status" "privacy_request_status" DEFAULT 'pending_verification' NOT NULL,
	"token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "leads_intent_idx" ON "leads" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_business_name_idx" ON "leads" USING btree ("business_name");
