import { generateKeyPairSync } from "node:crypto";

const toSingleLineEnvValue = (pem) => pem.replace(/\r?\n/g, "\\n");

const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

console.log("SEAL_PRIVATE_KEY_PEM='" + toSingleLineEnvValue(privateKey) + "'");
console.log("SEAL_PUBLIC_KEY_PEM='" + toSingleLineEnvValue(publicKey) + "'");
console.log("SEAL_KEY_ID='k1'");
