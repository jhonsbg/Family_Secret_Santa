import { createHash, createHmac, randomBytes } from "node:crypto";
import { hash, verify, type Options } from "@node-rs/argon2";

export const validPin = (value: string) => value.length === 6 && /^[0-9]{6}$/.test(value);
export const validToken = (value: string) => value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value);
export const newToken = () => randomBytes(32).toString("base64url");

export function tokenDigest(kind: "invite" | "general" | "login" | "session" | "session-view" | "display" | "recovery-code" | "recovery-invite", token: string) {
  return createHash("sha256").update(kind).update(":").update(token).digest("hex");
}

export function authPepper(value = process.env.AUTH_PEPPER) {
  if (!value || !validToken(value) || Buffer.from(value, "base64url").length !== 32) {
    throw new Error("Configura AUTH_PEPPER con 32 bytes aleatorios codificados en base64url.");
  }
  return Buffer.from(value, "base64url");
}

export function keyedDigest(pepper: Buffer, scope: string, value: string) {
  return createHmac("sha256", pepper).update(scope).update(":").update(value).digest();
}

const argon2id = 2; // Argon2id identifier in @node-rs/argon2.
const options: Options = { algorithm: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPin(pepper: Buffer, pin: string) {
  return hash(keyedDigest(pepper, "pin", pin).toString("hex"), options);
}

export function verifyPin(pepper: Buffer, digest: string, pin: string) {
  return verify(digest, keyedDigest(pepper, "pin", pin).toString("hex"));
}


export function newRecoveryCode() {
  const digits = randomBytes(20).toString("hex").toUpperCase();
  return { code: digits.match(/.{5}/g)!.join("-"), digest: tokenDigest("recovery-code", digits) };
}

export function recoveryCodeDigest(code: string) {
  if (code.length > 80) return null;
  const digits = code.replace(/[\s-]/g, "").toUpperCase();
  return digits.length === 40 && /^[0-9A-F]{40}$/.test(digits) ? tokenDigest("recovery-code", digits) : null;
}
