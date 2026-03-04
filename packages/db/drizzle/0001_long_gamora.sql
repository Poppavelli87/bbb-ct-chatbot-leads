CREATE TABLE "submission_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"key_id" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"signature" text NOT NULL,
	"sealed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "submission_receipts" ADD CONSTRAINT "submission_receipts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_receipts_receipt_id_uidx" ON "submission_receipts" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "submission_receipts_receipt_id_idx" ON "submission_receipts" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "submission_receipts_lead_id_idx" ON "submission_receipts" USING btree ("lead_id");