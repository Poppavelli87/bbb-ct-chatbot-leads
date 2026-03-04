import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const leadStatusEnum = pgEnum("lead_status", ["in_progress", "complete"]);

export const leadIntentEnum = pgEnum("lead_intent", [
  "accreditation",
  "advertising",
  "ignite",
  "both",
  "out_of_scope",
  "redirect_bbb_org"
]);

export const accreditationStatusEnum = pgEnum("accreditation_status", [
  "not_accredited",
  "accredited",
  "not_sure",
  "unknown"
]);

export const privacyRequestTypeEnum = pgEnum("privacy_request_type", [
  "access",
  "correct",
  "delete"
]);

export const privacyRequestStatusEnum = pgEnum("privacy_request_status", [
  "pending_verification",
  "verified",
  "fulfilled",
  "rejected",
  "expired"
]);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    status: leadStatusEnum("status").notNull().default("in_progress"),
    intent: leadIntentEnum("intent").notNull(),
    accreditationStatus: accreditationStatusEnum("accreditation_status").notNull(),
    isCtBusiness: boolean("is_ct_business").notNull(),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    lastStepKey: text("last_step_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({})
  },
  (table) => ({
    intentIdx: index("leads_intent_idx").on(table.intent),
    statusIdx: index("leads_status_idx").on(table.status),
    createdAtIdx: index("leads_created_at_idx").on(table.createdAt),
    businessNameIdx: index("leads_business_name_idx").on(table.businessName)
  })
);

export const privacyRequests = pgTable("privacy_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  requestType: privacyRequestTypeEnum("request_type").notNull(),
  email: text("email").notNull(),
  leadId: uuid("lead_id"),
  status: privacyRequestStatusEnum("status")
    .notNull()
    .default("pending_verification"),
  tokenHash: text("token_hash").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({})
});

export const submissionReceipts = pgTable(
  "submission_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: text("receipt_id").notNull(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    keyId: text("key_id").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    signature: text("signature").notNull(),
    sealedAt: timestamp("sealed_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
  },
  (table) => ({
    receiptIdUnique: uniqueIndex("submission_receipts_receipt_id_uidx").on(table.receiptId),
    receiptIdIdx: index("submission_receipts_receipt_id_idx").on(table.receiptId),
    leadIdIdx: index("submission_receipts_lead_id_idx").on(table.leadId)
  })
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type PrivacyRequest = typeof privacyRequests.$inferSelect;
export type NewPrivacyRequest = typeof privacyRequests.$inferInsert;
export type SubmissionReceipt = typeof submissionReceipts.$inferSelect;
export type NewSubmissionReceipt = typeof submissionReceipts.$inferInsert;
