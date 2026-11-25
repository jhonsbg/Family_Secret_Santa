"use server";

import { authPepper } from "@/lib/auth/crypto";
import { recoverAccess, replaceRecoveryCode } from "@/lib/auth/recovery";
import { authDatabase, currentGame, mutationOrigin, sessionToken, writeSession } from "@/lib/auth/web";

export type RecoveryFeedback = { loginPath?: string; recoveryCode?: string; error?: string };

function field(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

const denied = { error: "El código o enlace puede ser inválido, estar vencido o haberse usado. Revisa los datos y, si hiciste varios intentos, espera unos minutos." };

export async function redeemRecoveryAction(data: FormData): Promise<RecoveryFeedback> {
  try {
    const origin = await mutationOrigin();
    if (!origin) return denied;
    const result = await recoverAccess(authDatabase(), authPepper(), {
      secret: field(data, "secret"), assisted: data.get("assisted") === "on",
      pin: field(data, "pin"), confirmation: field(data, "confirmation"),
      temporary: data.get("temporary") === "on", origin, signedInIdentityId: (await currentGame())?.session.identityId,
    });
    if (!result) return denied;
    await writeSession(result);
    return { recoveryCode: result.recoveryCode, loginPath: `/acceso?enlace=1#${result.loginToken}` };
  } catch {
    return denied;
  }
}

export async function replaceRecoveryCodeAction(data: FormData): Promise<RecoveryFeedback> {
  try {
    const origin = await mutationOrigin();
    const token = await sessionToken();
    if (origin && token) {
      const code = await replaceRecoveryCode(authDatabase(), authPepper(), token, field(data, "pin"), origin);
      if (code) return { recoveryCode: code };
    }
  } catch {
    // Credential failures share a single response.
  }
  return { error: "No pudimos generar el código. Revisa tu PIN o inténtalo más tarde." };
}
