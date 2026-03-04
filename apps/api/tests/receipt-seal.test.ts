import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";
import {
  computeHash,
  signHash,
  stableStringify,
  verifyHash
} from "../src/lib/receiptSeal.js";
import { SessionStore } from "../src/session.js";
import { MemoryStore } from "../src/store.js";

describe("receipt sealing", () => {
  it("stableStringify uses deterministic key ordering", () => {
    const valueA = {
      z: [{ b: 2, a: 1 }, "x"],
      a: {
        d: 4,
        c: 3
      },
      b: 1
    };

    const valueB = {
      b: 1,
      a: {
        c: 3,
        d: 4
      },
      z: [{ a: 1, b: 2 }, "x"]
    };

    expect(stableStringify(valueA)).toBe(stableStringify(valueB));
    expect(stableStringify(valueA)).toBe(
      "{\"a\":{\"c\":3,\"d\":4},\"b\":1,\"z\":[{\"a\":1,\"b\":2},\"x\"]}"
    );
  });

  it("signHash and verifyHash roundtrip with ed25519 keys", () => {
    const keyPair = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    });

    const hash = computeHash(stableStringify({ hello: "world", n: 1 }));
    const signature = signHash(hash, keyPair.privateKey);

    expect(verifyHash(hash, signature, keyPair.publicKey)).toBe(true);
    expect(
      verifyHash(
        computeHash(stableStringify({ hello: "tampered", n: 1 })),
        signature,
        keyPair.publicKey
      )
    ).toBe(false);
  });

  it("returns verified receipt summary after lead completion", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, sessionStore: new SessionStore(), serveStatic: false });

    const started = await request(app).post("/api/leads/start").send({
      isCtBusiness: true,
      accreditationStatus: "not_accredited",
      intent: "accreditation",
      businessName: "Northwind Builders"
    });

    expect(started.status).toBe(201);
    const leadId = started.body.lead.id as string;

    const completed = await request(app).post(`/api/leads/${leadId}/complete`).send({});
    expect(completed.status).toBe(200);
    expect(completed.body.receipt.receiptId).toBeTypeOf("string");
    expect(completed.body.receipt.verificationCode).toHaveLength(12);

    const receiptId = completed.body.receipt.receiptId as string;
    const receiptLookup = await request(app).get(`/api/receipt/${encodeURIComponent(receiptId)}`);

    expect(receiptLookup.status).toBe(200);
    expect(receiptLookup.body.receiptId).toBe(receiptId);
    expect(receiptLookup.body.verified).toBe(true);
    expect(receiptLookup.body.businessName).toBe("Northwind Builders");
    expect(receiptLookup.body.intent).toBe("accreditation");
    expect(receiptLookup.body.email).toBeUndefined();
    expect(receiptLookup.body.phone).toBeUndefined();
  });
});
