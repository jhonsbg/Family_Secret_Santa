"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { RecoveryCode } from "./recovery-code";
import { activateAccess, changeAccessPin, loginAccess, signOut } from "./actions";

export function PinField({ name, children, current = false }: { name: string; children: string; current?: boolean }) {
  return <label>{children}
    <input name={name} type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
      autoComplete={current ? "current-password" : "new-password"} />
  </label>;
}

export function PrivateAccessLink({ path, label = "Mi enlace privado" }: { path: string; label?: string }) {
  const [message, setMessage] = useState("");
  return <div className="form-stack">
    <a className="button button-secondary" href={path}>{label}</a>
    <Button onClick={async () => {
      try {
        await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
        setMessage("Enlace copiado.");
      } catch {
        setMessage("Mantén pulsado el enlace o usa el menú del navegador para copiarlo.");
      }
    }}>Copiar enlace privado</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}

function subscribeToLink(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const hasPrivateLink = () => /^#[A-Za-z0-9_-]{43}$/.test(window.location.hash);
const unknownLink = () => null;

export function AccessForm({ activation = false }: { activation?: boolean }) {
  const [state, submit, busy] = useActionState(activation ? activateAccess : loginAccess, {});
  const hasLink = useSyncExternalStore(subscribeToLink, hasPrivateLink, unknownLink);
  useEffect(() => {
    if (state.loginPath) window.history.replaceState(null, "", window.location.pathname);
  }, [state.loginPath]);

  if (state.loginPath) {
    const link = state.loginPath;
    return <div className="form-stack">
      <h2>Acceso activado</h2>
      {state.recoveryCode && <RecoveryCode code={state.recoveryCode} />}
      <p>Guarda este enlace en tu propio dispositivo. Para volver a entrar, ábrelo y escribe tu PIN.</p>
      <PrivateAccessLink path={link} />
      <a href="/acceso/cuenta" className="button button-secondary" onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.location.replace("/acceso/cuenta");
      }}>Continuar a mi acceso</a>
    </div>;
  }

  if (hasLink === null) return <p role="status">Comprobando el enlace…</p>;
  if (!hasLink) return activation
    ? <p>Abre el enlace de activación que te dio el organizador.</p>
    : <p>Para entrar, abre el enlace privado que guardaste al crear o activar tu acceso. Si aún no tienes acceso, usa la invitación que te compartió el organizador.</p>;

  return <form className="form-stack" action={(data) => {
    data.set("token", window.location.hash.slice(1));
    submit(data);
  }}>
    <p>{activation ? "Elige un PIN personal de seis dígitos y vuelve a escribirlo para confirmarlo." : "Abre tu enlace privado y escribe tu PIN de seis dígitos."}</p>
    <PinField name="pin" current={!activation}>{activation ? "PIN nuevo" : "PIN personal"}</PinField>
    {activation && <PinField name="confirmation">Confirma el PIN nuevo</PinField>}
    <label className="check choice"><input type="checkbox" name="temporary" /> Estoy usando un dispositivo prestado</label>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Comprobando…" : activation ? "Activar mi acceso" : "Entrar"}</Button>
  </form>;
}

export function ChangePinForm() {
  const [state, submit, busy] = useActionState(changeAccessPin, {});
  return <form className="form-stack" action={(data) => submit(data)}>
    <p>Al cambiar el PIN se cerrarán todas tus sesiones. Ten a mano tu enlace privado.</p>
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
