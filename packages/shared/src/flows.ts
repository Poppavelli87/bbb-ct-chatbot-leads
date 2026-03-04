import { z } from "zod";
import {
  advertisingInterestOptions,
  budgetRangeSchema,
  emailSchema,
  LeadIntent,
  phoneInputSchema,
  sanitizeText,
  urlOptionalSchema,
  workspacePreferenceOptions
} from "./schemas.js";

export type StepInputType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "phone"
  | "url"
  | "select"
  | "multi_select"
  | "boolean"
  | "object";

export type StepOption = {
  label: string;
  value: string;
};

export type StepDefinition = {
  key: string;
  prompt: string;
  type: StepInputType;
  options?: StepOption[];
  placeholder?: string;
  schema: z.ZodTypeAny;
  helperText?: string;
};

export type FlowDefinition = {
  intent: LeadIntent;
  title: string;
  steps: StepDefinition[];
};

const commonSchemas = {
  contactName: z.string().min(2).max(120),
  roleTitle: z.string().min(2).max(120),
  teamSize: z.coerce.number().int().min(1).max(10000),
  employeeCount: z.coerce.number().int().min(1).max(100000),
  notes: z.string().max(4000).optional().or(z.literal("")),
  businessStructure: z.enum([
    "sole_prop",
    "llc",
    "corp",
    "partnership",
    "nonprofit",
    "other"
  ]),
  yearOpened: z.coerce.number().int().min(1800).max(new Date().getFullYear()),
  preferredContactMethod: z.enum(["phone", "email"]),
  startTimeline: z.enum(["asap", "30_days", "60_90_days", "exploring"]),
  visitInterest: z.boolean(),
  industryType: z
    .object({
      value: z.enum([
        "home_services",
        "professional_services",
        "retail",
        "healthcare",
        "automotive",
        "hospitality",
        "construction",
        "other"
      ]),
      otherText: z.string().max(200).optional()
    })
    .superRefine((value, ctx) => {
      if (value.value === "other" && !value.otherText?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["otherText"],
          message: "Please specify industry type"
        });
      }
    }),
  addressLines: z.object({
    addressLine1: z.string().min(2).max(200),
    addressLine2: z.string().max(200).optional().or(z.literal(""))
  }),
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  phone: phoneInputSchema,
  email: emailSchema,
  website: urlOptionalSchema,
  advertisingInterests: z
    .object({
      values: z.array(z.enum(advertisingInterestOptions)).min(1),
      otherText: z.string().max(300).optional()
    })
    .superRefine((value, ctx) => {
      if (value.values.includes("other") && !value.otherText?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["otherText"],
          message: "Please specify other interest"
        });
      }
    }),
  workspacePreferences: z.array(z.enum(workspacePreferenceOptions)).min(1)
};

const makeTextStep = (
  key: string,
  prompt: string,
  schema: z.ZodTypeAny,
  placeholder?: string,
  type: StepInputType = "text"
): StepDefinition => {
  const base: StepDefinition = {
    key,
    prompt,
    schema: schema.transform((value) =>
      typeof value === "string" ? sanitizeText(value) : value
    ),
    type
  };

  if (placeholder) {
    return {
      ...base,
      placeholder
    };
  }

  return base;
};

export const flowDefinitions: Record<LeadIntent, FlowDefinition | null> = {
  out_of_scope: null,
  redirect_bbb_org: null,
  accreditation: {
    intent: "accreditation",
    title: "BBB Accreditation Application",
    steps: [
      makeTextStep("year_opened", "To get started, what year did your business open?", commonSchemas.yearOpened, "e.g., 2014", "number"),
      makeTextStep(
        "licenses_certifications",
        "Please share any licenses or certifications your business holds.",
        z.string().min(2).max(500),
        "State license #, trade certs, etc.",
        "textarea"
      ),
      {
        key: "business_structure",
        prompt: "Which business structure best describes your business?",
        type: "select",
        options: [
          { label: "Sole proprietorship", value: "sole_prop" },
          { label: "LLC", value: "llc" },
          { label: "Corporation", value: "corp" },
          { label: "Partnership", value: "partnership" },
          { label: "Nonprofit", value: "nonprofit" },
          { label: "Other", value: "other" }
        ],
        schema: commonSchemas.businessStructure
      },
      {
        key: "industry_type",
        prompt: "What industry is your business in?",
        type: "object",
        schema: commonSchemas.industryType,
        options: [
          { label: "Home Services", value: "home_services" },
          { label: "Professional Services", value: "professional_services" },
          { label: "Retail", value: "retail" },
          { label: "Healthcare", value: "healthcare" },
          { label: "Automotive", value: "automotive" },
          { label: "Hospitality", value: "hospitality" },
          { label: "Construction", value: "construction" },
          { label: "Other", value: "other" }
        ]
      },
      makeTextStep("owner_title", "What is the owner's or principal's title?", z.string().min(2).max(120)),
      makeTextStep("employee_count", "About how many employees are on your team?", commonSchemas.employeeCount, "e.g., 12", "number"),
      makeTextStep("website", "If you have one, what is your website? (optional)", commonSchemas.website, "https://example.com", "url"),
      {
        key: "address_lines",
        prompt: "What is your business address? (Line 1 required, Line 2 optional.)",
        type: "object",
        schema: commonSchemas.addressLines
      },
      makeTextStep("city", "What city is your business located in?", commonSchemas.city),
      makeTextStep("state", "What state is your business located in?", commonSchemas.state, "CT"),
      makeTextStep("zip", "What is your business ZIP code?", commonSchemas.zip, "06001"),
      makeTextStep("phone", "What's the best phone number to reach you?", commonSchemas.phone, "(860) 555-0199", "phone"),
      makeTextStep("email", "What's the best email address to reach you?", commonSchemas.email, "hello@business.com", "email"),
      {
        key: "preferred_contact_method",
        prompt: "How would you prefer our team contact you?",
        type: "select",
        options: [
          { label: "Phone", value: "phone" },
          { label: "Email", value: "email" }
        ],
        schema: commonSchemas.preferredContactMethod
      },
      makeTextStep("notes", "Is there anything else you'd like us to know? (optional)", commonSchemas.notes, "Anything else we should know", "textarea")
    ]
  },
  advertising: {
    intent: "advertising",
    title: "Advertising Inquiry",
    steps: [
      makeTextStep("contact_name", "Who is the best person for us to contact?", commonSchemas.contactName),
      makeTextStep("role_title", "What is your role/title?", commonSchemas.roleTitle),
      makeTextStep("phone", "What's the best phone number to reach you?", commonSchemas.phone, "(860) 555-0199", "phone"),
      makeTextStep("email", "What's the best email address to reach you?", commonSchemas.email, "name@business.com", "email"),
      {
        key: "budget_range",
        prompt: "What budget range are you considering?",
        type: "select",
        options: [
          { label: "Under $500", value: "under_500" },
          { label: "$500 - $1000", value: "500_1000" },
          { label: "$1000 - $2500", value: "1000_2500" },
          { label: "$2500+", value: "2500_plus" },
          { label: "Unsure", value: "unsure" }
        ],
        schema: budgetRangeSchema
      },
      {
        key: "advertising_interests",
        prompt: "Which advertising options are you most interested in? (Select one or more)",
        type: "object",
        schema: commonSchemas.advertisingInterests,
        options: [
          { label: "BBB Seal Usage", value: "seal_usage" },
          { label: "Directory Listing", value: "directory_listing" },
          { label: "Sponsored Content", value: "sponsored_content" },
          { label: "Social Ads", value: "social_ads" },
          { label: "Other", value: "other" }
        ]
      },
      makeTextStep("notes", "Any additional details you'd like to share? (optional)", commonSchemas.notes, "Goals, timeline, notes", "textarea")
    ]
  },
  ignite: {
    intent: "ignite",
    title: "Ignite Coworking Inquiry",
    steps: [
      makeTextStep("contact_name", "Who is the best person for us to contact?", commonSchemas.contactName),
      makeTextStep("phone", "What's the best phone number to reach you?", commonSchemas.phone, "(860) 555-0199", "phone"),
      makeTextStep("email", "What's the best email address to reach you?", commonSchemas.email, "name@business.com", "email"),
      makeTextStep("team_size", "How many people are on your team?", commonSchemas.teamSize, "e.g., 5", "number"),
      {
        key: "workspace_preferences",
        prompt: "Which workspace options are you most interested in?",
        type: "multi_select",
        options: [
          { label: "Hot Desk", value: "hot_desk" },
          { label: "Dedicated Desk", value: "dedicated_desk" },
          { label: "Private Office", value: "private_office" },
          { label: "Meeting Room", value: "meeting_room" },
          { label: "Virtual Mail", value: "virtual_mail" },
          { label: "Unsure", value: "unsure" }
        ],
        schema: commonSchemas.workspacePreferences
      },
      {
        key: "start_timeline",
        prompt: "When would you ideally like to get started?",
        type: "select",
        options: [
          { label: "ASAP", value: "asap" },
          { label: "Within 30 days", value: "30_days" },
          { label: "In 60-90 days", value: "60_90_days" },
          { label: "Just exploring", value: "exploring" }
        ],
        schema: commonSchemas.startTimeline
      },
      {
        key: "visit_interest",
        prompt: "Would you like to schedule a visit?",
        type: "boolean",
        schema: commonSchemas.visitInterest
      },
      makeTextStep("notes", "Anything else you'd like us to know? (optional)", commonSchemas.notes, "Anything we should prepare", "textarea")
    ]
  },
  both: {
    intent: "both",
    title: "Advertising + Ignite Inquiry",
    steps: [
      makeTextStep("contact_name", "Who is the best person for us to contact?", commonSchemas.contactName),
      makeTextStep("role_title", "What is your role/title? (optional)", commonSchemas.roleTitle.optional().or(z.literal(""))),
      makeTextStep("phone", "What's the best phone number to reach you?", commonSchemas.phone, "(860) 555-0199", "phone"),
      makeTextStep("email", "What's the best email address to reach you?", commonSchemas.email, "name@business.com", "email"),
      {
        key: "budget_range",
        prompt: "What budget range are you considering?",
        type: "select",
        options: [
          { label: "Under $500", value: "under_500" },
          { label: "$500 - $1000", value: "500_1000" },
          { label: "$1000 - $2500", value: "1000_2500" },
          { label: "$2500+", value: "2500_plus" },
          { label: "Unsure", value: "unsure" }
        ],
        schema: budgetRangeSchema
      },
      {
        key: "advertising_interests",
        prompt: "Which advertising interests are top of mind for you?",
        type: "object",
        schema: commonSchemas.advertisingInterests,
        options: [
          { label: "BBB Seal Usage", value: "seal_usage" },
          { label: "Directory Listing", value: "directory_listing" },
          { label: "Sponsored Content", value: "sponsored_content" },
          { label: "Social Ads", value: "social_ads" },
          { label: "Other", value: "other" }
        ]
      },
      makeTextStep("team_size", "How many people are on your team?", commonSchemas.teamSize, "e.g., 5", "number"),
      {
        key: "workspace_preferences",
        prompt: "Which workspace options are you most interested in?",
        type: "multi_select",
        options: [
          { label: "Hot Desk", value: "hot_desk" },
          { label: "Dedicated Desk", value: "dedicated_desk" },
          { label: "Private Office", value: "private_office" },
          { label: "Meeting Room", value: "meeting_room" },
          { label: "Virtual Mail", value: "virtual_mail" },
          { label: "Unsure", value: "unsure" }
        ],
        schema: commonSchemas.workspacePreferences
      },
      {
        key: "start_timeline",
        prompt: "When would you ideally like to get started?",
        type: "select",
        options: [
          { label: "ASAP", value: "asap" },
          { label: "Within 30 days", value: "30_days" },
          { label: "In 60-90 days", value: "60_90_days" },
          { label: "Just exploring", value: "exploring" }
        ],
        schema: commonSchemas.startTimeline
      },
      {
        key: "visit_interest",
        prompt: "Would you like to schedule a visit?",
        type: "boolean",
        schema: commonSchemas.visitInterest
      },
      makeTextStep("notes", "Anything else you'd like us to know? (optional)", commonSchemas.notes, "Anything else we should know", "textarea")
    ]
  }
};

export const getFlowByIntent = (intent: LeadIntent): FlowDefinition | null =>
  flowDefinitions[intent];

export const validateStepByIntent = (
  intent: LeadIntent,
  stepKey: string,
  value: unknown
): { success: true; parsed: unknown } | { success: false; error: string } => {
  const flow = flowDefinitions[intent];
  if (!flow) {
    return { success: false, error: "No flow for this intent" };
  }

  const step = flow.steps.find((entry) => entry.key === stepKey);
  if (!step) {
    return { success: false, error: "Unknown step key" };
  }

  const result = step.schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid answer";
    return { success: false, error: message };
  }

  return { success: true, parsed: result.data };
};
