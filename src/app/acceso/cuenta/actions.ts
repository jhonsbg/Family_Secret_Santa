"use server";

import { authDatabase, mutationOrigin, sessionToken } from "@/lib/auth/web";
import { assignedWishes, openEnvelope, saveWishes } from "@/lib/participant/service";

const unavailable = { ok: false, reason: "unavailable" } as const;

export async function openMyEnvelope(version: unknown, expectedSession: unknown) {
  try {
    if (typeof expectedSession !== "string" || !await mutationOrigin()) return unavailable;
    return await openEnvelope(authDatabase(), await sessionToken(), version, expectedSession);
  } catch {
    return unavailable;
  }
}

export async function readRecipientWishes(version: unknown, expectedSession: unknown) {
  try {
    if (typeof expectedSession !== "string" || !await mutationOrigin()) return unavailable;
    return await assignedWishes(authDatabase(), await sessionToken(), version, expectedSession);
  } catch {
    return unavailable;
  }
}

export async function saveMyWishes(revision: unknown, version: unknown, form: FormData, expectedSession: unknown) {
  try {
    if (typeof expectedSession !== "string" || !(form instanceof FormData) || !await mutationOrigin()) return unavailable;
    return await saveWishes(authDatabase(), await sessionToken(), revision, version, form, expectedSession);
  } catch {
    return unavailable;
  }
}
