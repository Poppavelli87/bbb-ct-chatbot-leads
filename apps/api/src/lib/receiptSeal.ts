import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify
} from "node:crypto";

import { logger } from "../logger.js";
import type { AppStore, LeadRecord, SubmissionReceiptRecord } from "../store.js";

type SealKeyConfig = {
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
};

type CanonicalReceiptPayload = {
  schema_version: "receipt_v1";
  lead_id: string;
  receipt_id: string;
  intent: LeadRecord["intent"];
  accreditation_status: LeadRecord["accreditationStatus"];
  is_ct_business: LeadRecord["isCtBusiness"];
  business_name: LeadRecord["businessName"];
  flow_version: "v1";
  completed_at: string;
  nonce: string;
};

let cachedSealKeys: SealKeyConfig | null = null;

const receiptCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomCode = (length: number): string => {
  const bytes = randomBytes(length);
  let result = "";

  for (let index = 0; index < length; index += 1) {
    const bucket = bytes[index] ?? 0;
    result += receiptCharset[bucket % receiptCharset.length] ?? "X";
  }

  return result;
};

const getSealKeys = (): SealKeyConfig => {
  if (cachedSealKeys) {
    return cachedSealKeys;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const privateKeyFromEnv = process.env.SEAL_PRIVATE_KEY_PEM;
  const publicKeyFromEnv = process.env.SEAL_PUBLIC_KEY_PEM;
  const keyId = process.env.SEAL_KEY_ID || "k1";

  if (privateKeyFromEnv && publicKeyFromEnv) {
    cachedSealKeys = {
      privateKeyPem: privateKeyFromEnv,
      publicKeyPem: publicKeyFromEnv,
      keyId
    };
    return cachedSealKeys;
  }

  if (isProduction) {
    throw new Error(
      "SEAL_PRIVATE_KEY_PEM and SEAL_PUBLIC_KEY_PEM are required in production for submission sealing."
    );
  }

  const generated = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });

  logger.warn(
    "SEAL_PRIVATE_KEY_PEM/SEAL_PUBLIC_KEY_PEM not configured. Using ephemeral in-memory Ed25519 keys for development."
  );

  cachedSealKeys = {
    privateKeyPem: generated.privateKey,
    publicKeyPem: generated.publicKey,
    keyId
  };

  return cachedSealKeys;
};

const toStable = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => toStable(item)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${toStable(objectValue[key])}`);
  return `{${entries.join(",")}}`;
};

export const ensureSealKeysConfigured = (): void => {
  void getSealKeys();
};

export const generateReceiptId = (): string =>
  `BBB-CT-${randomCode(4)}-${randomCode(4)}`;

export const stableStringify = (value: unknown): string => toStable(value);

export const computeHash = (canonicalPayload: string): string =>
  createHash("sha256").update(canonicalPayload).digest("hex");

export const signHash = (hashHex: string, privateKeyPem?: string): string => {
  const keys = getSealKeys();
  const key = privateKeyPem ?? keys.privateKeyPem;
  const signature = sign(null, Buffer.from(hashHex, "hex"), key);
  return signature.toString("base64");
};

export const verifyHash = (
  hashHex: string,
  signatureBase64: string,
  publicKeyPem?: string
): boolean => {
  const keys = getSealKeys();
  const key = publicKeyPem ?? keys.publicKeyPem;

  return verify(
    null,
    Buffer.from(hashHex, "hex"),
    key,
    Buffer.from(signatureBase64, "base64")
  );
};

const buildCanonicalPayload = (
  lead: LeadRecord,
  receiptId: string
): CanonicalReceiptPayload => ({
  schema_version: "receipt_v1",
  lead_id: lead.id,
  receipt_id: receiptId,
  intent: lead.intent,
  accreditation_status: lead.accreditationStatus,
  is_ct_business: lead.isCtBusiness,
  business_name: lead.businessName,
  flow_version: "v1",
  completed_at: (lead.completedAt ?? new Date()).toISOString(),
  nonce: randomBytes(16).toString("base64")
});

export type SealedLeadReceipt = SubmissionReceiptRecord & {
  verificationCode: string;
};

export const sealLeadCompletion = async (
  lead: LeadRecord,
  store: Pick<AppStore, "createSubmissionReceipt" | "getSubmissionReceiptByReceiptId">
): Promise<SealedLeadReceipt> => {
  const keys = getSealKeys();

  let receiptId = generateReceiptId();
  let attempts = 0;

  while (attempts < 10) {
    // Prevent rare receipt ID collisions before insert.
    const existing = await store.getSubmissionReceiptByReceiptId(receiptId);
    if (!existing) {
      break;
    }

    receiptId = generateReceiptId();
    attempts += 1;
  }

  const payload = buildCanonicalPayload(lead, receiptId);
  const canonical = stableStringify(payload);
  const payloadHash = computeHash(canonical);
  const signature = signHash(payloadHash, keys.privateKeyPem);

  const created = await store.createSubmissionReceipt({
    receiptId,
    leadId: lead.id,
    keyId: keys.keyId,
    payloadJson: payload,
    payloadHash,
    signature
  });

  return {
    ...created,
    verificationCode: payloadHash.slice(0, 12)
  };
};
