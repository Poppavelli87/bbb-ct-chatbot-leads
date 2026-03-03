import { z } from "zod";

export const leadIntentSchema = z.enum([
  "accreditation",
  "advertising",
  "ignite",
  "both",
  "out_of_scope",
  "redirect_bbb_org"
]);

export type LeadIntent = z.infer<typeof leadIntentSchema>;

export const accreditationStatusSchema = z.enum([
  "not_accredited",
  "accredited",
  "not_sure",
  "unknown"
]);

export type AccreditationStatus = z.infer<typeof accreditationStatusSchema>;

export const leadStatusSchema = z.enum(["in_progress", "complete"]);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const budgetRangeSchema = z.enum([
  "under_500",
  "500_1000",
  "1000_2500",
  "2500_plus",
  "unsure"
]);

export const requestTypeSchema = z.enum(["access", "correct", "delete"]);
export const privacyRequestStatusSchema = z.enum([
  "pending_verification",
  "verified",
  "fulfilled",
  "rejected",
  "expired"
]);

export type PrivacyRequestType = z.infer<typeof requestTypeSchema>;
export type PrivacyRequestStatus = z.infer<typeof privacyRequestStatusSchema>;

export const advertisingInterestOptions = [
  "seal_usage",
  "directory_listing",
  "sponsored_content",
  "social_ads",
  "other"
] as const;

export const workspacePreferenceOptions = [
  "hot_desk",
  "dedicated_desk",
  "private_office",
  "meeting_room",
  "virtual_mail",
  "unsure"
] as const;

export const sanitizeText = (value: string): string =>
  value.replace(/[\u0000-\u001F\u007F]/g, "").trim();

export const normalizePhoneToE164 = (value: string): string => {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (value.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new Error("Invalid phone number format");
};

export const phoneInputSchema = z
  .string()
  .min(7)
  .max(25)
  .regex(/^[+()\-\s0-9.]+$/, "Invalid phone number format");

export const emailSchema = z.email();

export const urlOptionalSchema = z
  .union([z.literal(""), z.url()])
  .transform((value) => (value === "" ? null : value));

export const businessNameSchema = z.string().min(2).max(200);

export const stepAnswerSchema = z.object({
  stepKey: z.string().min(1),
  value: z.unknown()
});

export const startLeadSchema = z.object({
  isCtBusiness: z.boolean(),
  accreditationStatus: accreditationStatusSchema,
  intent: leadIntentSchema,
  businessName: businessNameSchema
});

export const completeLeadSchema = z.object({
  leadId: z.uuid()
});

export const adminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const privacyRequestCreateSchema = z.object({
  email: z.email(),
  requestType: requestTypeSchema,
  leadId: z.uuid().optional(),
  details: z.record(z.string(), z.unknown()).optional()
});

export type StartLeadInput = z.infer<typeof startLeadSchema>;
export type StepAnswerInput = z.infer<typeof stepAnswerSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type PrivacyRequestCreateInput = z.infer<typeof privacyRequestCreateSchema>;
