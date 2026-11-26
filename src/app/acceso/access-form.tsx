"use client";

import { useActionState, useEffect, useSyncExternalStore } from "react";
import { PinField } from "@/components/pin-field";
import { Button } from "@/components/ui/button";
import { RecoveryCode } from "./recovery-code";
import { activateAccess, changeAccessPin, loginAccess, saveLoginName, signOut } from "./actions";

export function LoginForm({ gameId }: { gameId?: string }) {
  const [state, submit, busy] = useActionState(loginAccess, {});
  return <form className="form-stack" action={submit}>
    {gameId
      ? <input type="hidden" name="gameId" value={gameId} />
      : <label>Nombre de la partida<input name="game" required maxLength={100} /></label>}
    <label>Tu nombre<input name="name" required maxLength={60} autoComplete="username" /></label>
    <PinField name="pin" current allowPrevious={false}>Tu PIN</PinField>
    <label className="check choice"><input type="checkbox" name="temporary" /> Estoy usando un dispositivo prestado</label>
    {state.error && <p role="alert">{state.error} Si dos partidas se llaman igual, usa el enlace de tu grupo.</p>}
    <Button type="submit" disabled={busy}>{busy ? "Comprobando…" : "Entrar a mi partida"}</Button>
  </form>;
}

export function SetLoginNameForm() {
  const [state, submit, busy] = useActionState(saveLoginName, {});
  return <form className="form-stack" action={submit}>
    <label>Tu nombre<input name="name" autoComplete="name" maxLength={60} required /></label>
    <p>Escribe el nombre que usarás para entrar a esta partida. Añade tus apellidos si alguien tiene el mismo nombre.</p>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" disabled={busy}>Guardar nombre de acceso</Button>
  </form>;
}

function subscribeToLink(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const hasPrivateLink = () => /^#[A-Za-z0-9_-]{43}$/.test(window.location.hash);
const unknownLink = () => null;

export function ActivationForm() {
  const [state, submit, busy] = useActionState(activateAccess, {});
  const hasLink = useSyncExternalStore(subscribeToLink, hasPrivateLink, unknownLink);
  useEffect(() => {
    if (state.recoveryCode) window.history.replaceState(null, "", window.location.pathname);
  }, [state.recoveryCode]);

  if (state.recoveryCode) {
    return <div className="form-stack">
      <h2>Acceso activado</h2>
      <RecoveryCode code={state.recoveryCode} />
      <p>Para volver a entrar, usa el nombre con el que te inscribiste y tu PIN.</p>
      <a href="/acceso/cuenta" className="button button-secondary" onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.location.replace("/acceso/cuenta");
      }}>Continuar a mi acceso</a>
    </div>;
  }

  if (hasLink === null) return <p role="status">Comprobando el enlace…</p>;
  if (!hasLink) return <p>Abre el enlace de activación que te dio el organizador.</p>;

  return <form className="form-stack" action={(data) => {
    data.set("token", window.location.hash.slice(1));
    submit(data);
  }}>
    <p>Elige un PIN personal y vuelve a escribirlo para confirmarlo.</p>
    <PinField name="pin">PIN nuevo</PinField>
    <PinField name="confirmation">Confirma el PIN nuevo</PinField>
    <label className="check choice"><input type="checkbox" name="temporary" /> Estoy usando un dispositivo prestado</label>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Comprobando…" : "Activar mi acceso"}</Button>
  </form>;
}

export function ChangePinForm() {
  const [state, submit, busy] = useActionState(changeAccessPin, {});
  return <form className="form-stack" action={(data) => submit(data)}>
    <p>Al cambiar el PIN se cerrarán todas tus sesiones. Vuelve a entrar con tu nombre y tu PIN nuevo.</p>
    <PinField name="current" current>PIN actual</PinField>
    <PinField name="pin">PIN nuevo</PinField>
    <PinField name="confirmation">Confirma el PIN nuevo</PinField>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Guardando…" : "Cambiar mi PIN"}</Button>
  </form>;
}


export function SignOutForm() {
  return <form action={async () => { await signOut(); }}>
    <Button type="submit">Cerrar sesión</Button>
  </form>;
}
