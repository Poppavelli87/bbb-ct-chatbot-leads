import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";
import { SessionStore } from "../src/session.js";
import { MemoryStore } from "../src/store.js";

describe("admin auth", () => {
  it("logs in and can access stats", async () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "super-secret";

    const app = createApp({
      store: new MemoryStore(),
      sessionStore: new SessionStore(),
      serveStatic: false
    });

    const login = await request(app).post("/api/admin/login").send({
      username: "admin",
      password: "super-secret"
    });

    expect(login.status).toBe(200);

    const cookie = login.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();

    const stats = await request(app).get("/api/admin/stats").set("Cookie", cookie);
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBeTypeOf("number");
  });
});
