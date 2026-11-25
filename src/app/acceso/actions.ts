"use server";

import { redirect, RedirectType } from "next/navigation";
import { activate } from "@/lib/auth/invitations";
import { changePin, login } from "@/lib/auth/credentials";
import { authPepper } from "@/lib/auth/crypto";
import { revokeSession } from "@/lib/auth/sessions";
import { authDatabase, clearSessionCookie, currentGame, mutationOrigin, sessionToken, writeSession } from "@/lib/auth/web";

export type AccessFeedback = { error?: string; loginPath?: string; recoveryCode?: string };
const denied = { error: "No pudimos completar el acceso. Revisa tu enlace y PIN o inténtalo más tarde." };
const textField = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

export async function activateAccess(_: AccessFeedback, data: FormData): Promise<AccessFeedback> {
  try {
    const origin = await mutationOrigin();
    if (!origin || await currentGame()) return denied;
    const result = await activate(authDatabase(), authPepper(), {
      invite: textField(data, "token"), pin: textField(data, "pin"),
      confirmation: textField(data, "confirmation"), temporary: data.get("temporary") === "on", origin,
    });
    if (!result) return denied;
    await writeSession(result);
    return { loginPath: `/acceso?enlace=1#${result.loginToken}`, recoveryCode: result.recoveryCode };
  } catch {
    return denied;
  }
}

export async function loginAccess(_: AccessFeedback, data: FormData): Promise<AccessFeedback> {
  try {
    const origin = await mutationOrigin();
    if (!origin) return denied;
    const result = await login(authDatabase(), authPepper(), {
      link: textField(data, "token"), pin: textField(data, "pin"), temporary: data.get("temporary") === "on", origin,
    });
    if (!result) return denied;
    await writeSession(result);
  } catch {
    return denied;
  }
  redirect("/acceso/cuenta", RedirectType.replace);
}

export async function changeAccessPin(_: AccessFeedback, data: FormData): Promise<AccessFeedback> {
  try {
    const origin = await mutationOrigin();
    const token = await sessionToken();
    if (!origin || !token) return denied;
    const changed = await changePin(authDatabase(), authPepper(), token, {
      current: textField(data, "current"), pin: textField(data, "pin"),
      confirmation: textField(data, "confirmation"), origin,
    });
    if (!changed) return { error: "Revisa el PIN actual y confirma un PIN nuevo distinto. Si hiciste varios intentos, espera antes de volver a probar." };
    await clearSessionCookie();
  } catch {
    return denied;
  }
  redirect("/acceso?pin=actualizado", RedirectType.replace);
}

export async function signOut() {
  if (!await mutationOrigin()) return;
  const token = await sessionToken();
  if (token) {
    try {
      await revokeSession(authDatabase(), token);
    } catch {
      redirect("/acceso/cuenta?salida=pendiente");
    }
  }
  await clearSessionCookie();
  redirect("/acceso", RedirectType.replace);
}
