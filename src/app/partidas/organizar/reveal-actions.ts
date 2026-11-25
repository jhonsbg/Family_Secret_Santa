"use server";

import { revalidatePath } from "next/cache";
import { authDatabase, mutationOrigin, sessionToken } from "@/lib/auth/web";
import { changeDisplayLink, runReveal } from "@/lib/reveal/service";
import { commands, type CommandInput } from "@/lib/reveal/types";

const unavailable = { ok: false, message: "No se pudo verificar o guardar esta operación." } as const;
const panel = "/partidas/organizar";
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;

function command(value: unknown): value is CommandInput {
  if (!value || typeof value !== "object") return false;
  const { kind, revision, drawVersion, turnId, guessId, confirmed } = value as Partial<CommandInput>;
  return kind !== undefined && commands.includes(kind) && number(revision)
    && (drawVersion === null || number(drawVersion)) && (turnId === null || uuid(turnId))
    && (guessId === null || uuid(guessId)) && typeof confirmed === "boolean";
}

export async function submitReveal(gameId: unknown, input: unknown) {
  try {
    if (!uuid(gameId) || !command(input) || !await mutationOrigin()) return unavailable;
    const result = await runReveal(authDatabase(), await sessionToken(), gameId, input);
    revalidatePath(panel);
    return result;
  } catch {
    return unavailable;
  }
}

export async function submitDisplayLink(gameId: unknown, expected: unknown, issue: unknown) {
  try {
    if (!uuid(gameId) || (expected !== null && !uuid(expected)) || typeof issue !== "boolean" || !await mutationOrigin()) return unavailable;
    const result = await changeDisplayLink(authDatabase(), await sessionToken(), gameId, expected, issue);
    revalidatePath(panel);
    return result;
  } catch {
    return unavailable;
  }
}
