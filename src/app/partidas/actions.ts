"use server";

import { revalidatePath } from "next/cache";
import { issueAssistedRecovery } from "@/lib/auth/recovery";
import { configureExclusion, organizerDrawStatus, runDraw } from "@/lib/draw/service";
import { authPepper } from "@/lib/auth/crypto";
import { authDatabase, currentGame, mutationOrigin, sessionToken, writeSession } from "@/lib/auth/web";
import { createManagedGame, manageRegistration, publicInvitation, requestRegistration, type OrganizerOperation } from "@/lib/registration/service";

export type Feedback = { error?: string; link?: string; recoveryCode?: string; saved?: boolean; notice?: string };
const field = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function createGameAction(data: FormData): Promise<Feedback> {
  try {
    const origin = await mutationOrigin();
    if (!origin || await currentGame()) return { error: "Cierra tu sesión actual antes de crear otra partida." };
    const date = field(data, "date");
    const budget = field(data, "budget");
    const eventAt = new Date(date + ":00-05:00");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date) || !Number.isFinite(+eventAt)
      || new Date(+eventAt - 5 * 60 * 60_000).toISOString().slice(0, 16) !== date
      || !/^\d{1,10}$/.test(budget) || Number(budget) > 2_147_483_647) {
      return { error: "Revisa la fecha, la hora y el presupuesto en pesos." };
    }
    const result = await createManagedGame(authDatabase(), authPepper(), {
      name: field(data, "name"), eventAt, budgetMin: Number(budget), budgetMax: Number(budget),
      organizerDisplayName: data.get("plays") === "on" ? field(data, "organizer") : undefined,
      wishesEnabled: data.get("wishes") === "on", guessingEnabled: data.get("guessing") === "on",
      pin: field(data, "pin"), confirmation: field(data, "confirmation"),
      temporary: data.get("temporary") === "on", origin,
    });
    if (!result) return { error: "Confirma un PIN de seis dígitos. Si hiciste varios intentos, espera unos minutos." };
    await writeSession(result);
    return { link: `/acceso?enlace=1#${result.loginToken}`, recoveryCode: result.recoveryCode };
  } catch {
    return { error: "No pudimos crear la partida. Revisa los campos e inténtalo de nuevo." };
  }
}

export async function readInvitationAction(data: FormData) {
  try {
    return await publicInvitation(authDatabase(), field(data, "token"));
  } catch {
    return null;
  }
}

export async function requestRegistrationAction(data: FormData): Promise<Feedback> {
  try {
    const origin = await mutationOrigin();
    if (!origin || await currentGame()) return { error: "Para inscribirte, abre el enlace desde un dispositivo o navegador sin sesión." };
    const token = await requestRegistration(authDatabase(), authPepper(), field(data, "token"), field(data, "name"), origin);
    if (token) return { link: `/acceso/activar#${token}` };
  } catch {
    // Keep the response identical for duplicates and other rejected submissions.
  }
  return { error: "No pudimos registrar la solicitud. Revisa si las inscripciones siguen abiertas o consulta al organizador." };
}

function parseOperation(data: FormData): OrganizerOperation | null {
  const kind = field(data, "operation");
  if (kind === "add") return { kind, name: field(data, "name") };
  if (kind === "general" || kind === "close" || kind === "reopen") return { kind };
  const personId = field(data, "personId");
  if (!uuid.test(personId)) return null;
  if (kind === "rename") return { kind, personId, name: field(data, "name") };
  if (kind === "approve" || kind === "reject" || kind === "withdraw" || kind === "invite") return { kind, personId };
  return null;
}

export async function manageAction(data: FormData): Promise<Feedback> {
  const denied = { error: "No pudimos aplicar el cambio. Revisa el nombre, el estado de las inscripciones y tus permisos." };
  try {
    const origin = await mutationOrigin();
    const gameId = field(data, "gameId");
    const kind = field(data, "operation");
    if (kind.startsWith("draw-")) {
      if (!origin || !uuid.test(gameId)) return denied;
      const db = authDatabase();
      const token = await sessionToken();
      if (kind === "draw-check") {
        const status = await organizerDrawStatus(db, token, gameId);
        return status ? (status.reason ? { error: status.reason } : { notice: "Hay un reparto completo que respeta las exclusiones." }) : denied;
      }
      if (kind === "draw-exclude" || kind === "draw-allow") {
        const a = field(data, "first");
        const b = field(data, "second");
        if (!uuid.test(a) || !uuid.test(b)) return { error: "Elige dos participantes de esta partida." };
        const outcome = await configureExclusion(db, token, gameId, a, b, kind === "draw-exclude");
        if (!outcome.ok) return { error: outcome.message };
        revalidatePath("/partidas/organizar");
        return { saved: true };
      }
      const command = kind === "draw-run" ? "draw" : kind === "draw-repeat" ? "repeat" : kind === "draw-void" ? "void" : null;
      const version = field(data, "version");
      if (!command || !/^\d{1,10}$/.test(version)) return denied;
      const outcome = await runDraw(db, token, gameId, command, Number(version), data.get("confirmed") === "on");
      if (!outcome.ok) return { error: outcome.message };
      revalidatePath("/partidas/organizar");
      revalidatePath("/acceso/cuenta");
      return { notice: command === "void" ? "Sorteo anulado." : `Sorteo guardado · versión ${outcome.version}.` };
    }
    if (field(data, "operation") === "recovery") {
      const participantId = field(data, "personId");
      if (!origin || !uuid.test(gameId) || !uuid.test(participantId)) return denied;
      const recovery = await issueAssistedRecovery(authDatabase(), authPepper(), await sessionToken(), {
        gameId, participantId, origin, verified: data.get("verified") === "on",
      });
      return recovery ? { link: `/acceso/recuperar?asistida=1#${recovery}` } : denied;
    }
    const operation = parseOperation(data);
    if (!origin || !uuid.test(gameId) || !operation) return denied;
    const result = await manageRegistration(authDatabase(), await sessionToken(), gameId, operation);
    if (!result) return denied;
    revalidatePath("/partidas/organizar");
    if (result.shareToken) return { link: `/invitacion#${result.shareToken}` };
    if (result.personalToken) return { link: `/acceso/activar#${result.personalToken}` };
    return { saved: true };
  } catch {
    return denied;
  }
}
