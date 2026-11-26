"use client";

import { startTransition, useActionState, useRef, useState, type ReactNode } from "react";
import { PinField } from "@/components/pin-field";
import { Button } from "@/components/ui/button";
import { RecoveryCode } from "../acceso/recovery-code";
import { useHydrated } from "@/components/use-hydrated";
import { Confirm } from "@/components/christmas";
import { createGameAction, manageAction, type Feedback } from "./actions";

export function ShareLink({ path, general = false, origin, label = general ? "Enlace general" : "Enlace privado" }: { path: string; general?: boolean; origin: string; label?: string }) {
  const [status, setStatus] = useState("");
  const url = new URL(path, origin).href;
  return <div className="form-stack">
    <label>{label}<input readOnly value={url} onFocus={(event) => event.target.select()} /></label>
    <div className="actions">
      <Button variant="secondary" onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setStatus("Enlace copiado.");
        } catch {
          setStatus("Selecciona el texto del enlace para copiarlo.");
        }
      }}>Copiar enlace</Button>
      {general && <a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">Compartir por WhatsApp</a>}
    </div>
    {status && <p role="status">{status}</p>}
  </div>;
}

type GameSettingsFieldsProps = {
  name: string; eventAt: Date; budgetMin: number; budgetMax: number; wishesEnabled: boolean; guessingEnabled: boolean;
};

export function GameSettingsFields({ game }: { game?: GameSettingsFieldsProps }) {
  const localDate = game ? new Date(game.eventAt.getTime() - 5 * 60 * 60_000).toISOString().slice(0, 16) : undefined;
  return <>
    <label>Nombre de la partida<input name="name" required maxLength={100} defaultValue={game?.name} /></label>
    <label>Fecha y hora en Bogotá<input name="date" type="datetime-local" required defaultValue={localDate} /></label>
    <div className="two-grid">
      <label>Presupuesto sugerido en COP<input name="budget" type="number" inputMode="numeric" min="0" max="2147483647" required defaultValue={game?.budgetMin} /></label>
      <label>Tope del rango en COP (opcional)<input name="budgetMax" type="number" inputMode="numeric" min="0" max="2147483647"
        defaultValue={game && game.budgetMax !== game.budgetMin ? game.budgetMax : undefined} /></label>
    </div>
    <label className="check"><input type="checkbox" name="wishes" defaultChecked={game?.wishesEnabled ?? true} /> Habilitar listas de deseos</label>
    <label className="check"><input type="checkbox" name="guessing" defaultChecked={game?.guessingEnabled ?? true} /> Habilitar adivinanzas</label>
  </>;
}

export function CreateGameForm({ sessionDestination }: { sessionDestination?: string }) {
  const [state, submit, busy] = useActionState((_state: Feedback, data: FormData) => createGameAction(data), {});
  if (state.recoveryCode) return <div className="form-stack">
    <h2>Partida creada</h2>
    <p>Para volver a entrar, usa el nombre de la partida, tu nombre y tu PIN.</p>
    <RecoveryCode code={state.recoveryCode} />
    <a className="button button-primary" href="/partidas/organizar" onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.location.replace("/partidas/organizar");
    }}>Abrir panel del organizador</a>
  </div>;
  if (sessionDestination) return <div className="form-stack">
    <h2>Ya tienes una sesión abierta</h2>
    <p>Para crear otra partida, cierra tu sesión desde tu cuenta.</p>
    <a className="button button-primary" href={sessionDestination}>Volver a mi partida</a>
  </div>;
  return <form className="form-stack" action={(data) => submit(data)}>
    <GameSettingsFields />
    <label>Tu nombre<input name="organizer" required maxLength={60} autoComplete="name" /></label>
    <label className="check"><input type="checkbox" name="plays" /> También quiero participar</label>
    <div className="two-grid">
      <PinField name="pin">PIN de administración</PinField>
      <PinField name="confirmation">Confirma tu PIN</PinField>
    </div>
    <label className="check"><input type="checkbox" name="temporary" /> Estoy usando un dispositivo prestado</label>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Creando…" : "Crear mi partida"}</Button>
  </form>;
}

export function OperationForm({ gameId, personId, operation, label, origin, confirmation, children }: {
  gameId: string; personId?: string; operation: string; label: string; origin: string; confirmation?: string; children?: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();
  const [state, submit, busy] = useActionState((_state: Feedback, data: FormData) => manageAction(data), {});
  return <form ref={form} className="form-stack" action={(data) => submit(data)}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="operation" value={operation} />
    {personId && <input type="hidden" name="personId" value={personId} />}
    {children}
    {confirmation && !busy
      ? <Confirm disabled={!hydrated} label={label} title={label} onConfirm={() => {
        if (!form.current?.reportValidity()) return;
        const data = new FormData(form.current);
        data.set("confirmed", "on");
        startTransition(() => submit(data));
      }} secondary>{confirmation}</Confirm>
      : <Button type="submit" variant="secondary" disabled={!hydrated || busy}>{busy ? "Guardando…" : label}</Button>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
    {state.saved && <p role="status">Cambio guardado.</p>}
    {state.link && <ShareLink key={state.link} path={state.link} general={operation === "general"} origin={origin} />}
  </form>;
}
