"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { PinField } from "@/components/pin-field";
import { RecoveryCode } from "../recovery-code";
import { redeemRecoveryAction, replaceRecoveryCodeAction, type RecoveryFeedback } from "../recovery-actions";

export function RecoveryForm({ assisted }: { assisted: boolean }) {
  const [state, submit, busy] = useActionState((_state: RecoveryFeedback, data: FormData) => redeemRecoveryAction(data), {});
  const invitation = useRef("");
  useEffect(() => {
    if (state.recoveryCode) window.history.replaceState(null, "", window.location.pathname);
  }, [state.recoveryCode]);

  if (state.recoveryCode) return <div className="form-stack">
    <h2>Acceso recuperado</h2>
    <p>Las sesiones anteriores se cerraron. Vuelve a entrar con tu nombre y tu PIN nuevo.</p>
    <RecoveryCode code={state.recoveryCode} />
    <a className="button button-primary" href="/acceso/cuenta" onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.location.replace("/acceso/cuenta");
    }}>Continuar a mi acceso</a>
  </div>;

  return <form className="form-stack" action={(data) => {
    if (assisted) {
      const fragment = window.location.hash.slice(1);
      if (fragment) invitation.current = fragment;
      data.set("secret", invitation.current);
      data.set("assisted", "on");
    }
    submit(data);
  }}>
    {assisted ? <p>Abre el enlace en un dispositivo sin otra sesión y elige tu PIN en privado.</p>
      : <label>Código personal de recuperación<input name="secret" required maxLength={80} autoComplete="off" spellCheck={false} /></label>}
    <PinField name="pin">PIN nuevo</PinField>
    <PinField name="confirmation">Confirma el PIN nuevo</PinField>
    <label className="check choice"><input type="checkbox" name="temporary" /> Estoy usando un dispositivo prestado</label>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Comprobando…" : "Recuperar mi acceso"}</Button>
  </form>;
}

export function ReplaceRecoveryCodeForm() {
  const [state, submit, busy] = useActionState((_state: RecoveryFeedback, data: FormData) => replaceRecoveryCodeAction(data), {});
  if (state.recoveryCode) return <RecoveryCode code={state.recoveryCode} />;
  return <form className="form-stack" action={(data) => submit(data)}>
    <p>Confirma tu PIN para generar un código personal. Al hacerlo se invalida el código anterior.</p>
    <PinField name="pin" current>PIN actual</PinField>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Guardando…" : "Generar código personal"}</Button>
  </form>;
}
