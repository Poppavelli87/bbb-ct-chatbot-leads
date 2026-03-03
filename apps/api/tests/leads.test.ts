import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { SessionStore } from "../src/session.js";

describe("lead API", () => {
  const store = new MemoryStore();
  const app = createApp({ store, sessionStore: new SessionStore(), serveStatic: false });

  beforeEach(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "super-secret";
  });

  it("starts a lead and records an answer", async () => {
    const start = await request(app).post("/api/leads/start").send({
      isCtBusiness: true,
      accreditationStatus: "not_accredited",
      intent: "advertising",
      businessName: "Northwind Plumbing"
    });

    expect(start.status).toBe(201);
    expect(start.body.lead.id).toBeDefined();

    const leadId = start.body.lead.id as string;

    const answer = await request(app).post(`/api/leads/${leadId}/answer`).send({
      stepKey: "phone",
      value: "(860) 555-0199"
    });

    expect(answer.status).toBe(200);
    expect(answer.body.lead.phone).toBe("+18605550199");
    expect(answer.body.lead.lastStepKey).toBe("phone");
  });
});
