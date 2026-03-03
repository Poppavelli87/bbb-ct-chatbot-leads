import { describe, expect, it } from "vitest";
import { normalizePhoneToE164 } from "../src/schemas.js";
import { validateStepByIntent } from "../src/flows.js";

describe("flow validation", () => {
  it("validates accreditation year_opened", () => {
    const valid = validateStepByIntent("accreditation", "year_opened", 2018);
    expect(valid.success).toBe(true);
  });

  it("rejects invalid advertising budget", () => {
    const invalid = validateStepByIntent("advertising", "budget_range", "big");
    expect(invalid.success).toBe(false);
  });
});

describe("phone normalization", () => {
  it("formats common US format to E164", () => {
    expect(normalizePhoneToE164("(860) 555-0199")).toBe("+18605550199");
  });
});
