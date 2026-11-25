"use client";

import { Check, Gift, Pause, Radio, Sparkles, WifiOff } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Confirm, Pill } from "@/components/christmas";
import { useHydrated } from "@/components/use-hydrated";
import { Button } from "@/components/ui/button";
import { formatEvent } from "@/lib/registration/display";
import type { OrganizerReveal } from "@/lib/reveal/snapshot";
import type { RevealCommand } from "@/lib/reveal/types";
import { ShareLink } from "../forms";
import { submitDisplayLink, submitReveal } from "./reveal-actions";
import "./reveal-panel.css";

const labels = { waiting: "Por iniciar", running: "Activo", paused: "En pausa", finished: "Finalizado" };

function watchConnection(change: () => void) {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
}

export function RevealPanel({ gameId, origin, timezone, state, drawVersion }: {
  gameId: string; origin: string; timezone: string; state: OrganizerReveal; drawVersion: number | null;
}) {
  const router = useRouter();
  const [busy, transition] = useTransition();
  const hydrated = useHydrated();
  const online = useSyncExternalStore(watchConnection, () => navigator.onLine, () => true);
  const disabled = busy || !hydrated || !online;
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ id: string; path: string } | null>(null);
  const { current, revision } = state;
  const [selection, setSelection] = useState<{ revision: number; id: string }>({ revision, id: current?.guessId ?? "" });
  const guess = selection.revision === revision ? selection.id : current?.guessId ?? "";
  const recorded = Boolean(current?.guessId || current?.guessSkipped);
  const guessPending = state.guessing && (!recorded || guess !== (current?.guessId ?? ""));

  function change(kind: RevealCommand, turnId = current?.id ?? null, guessId: string | null = null, confirmed = false) {
    setError("");
    transition(async () => {
      try {
        const result = await submitReveal(gameId, { kind, turnId, guessId, confirmed, revision, drawVersion });
        if (!result.ok) setError(result.message);
      } catch {
        setError("Se perdió la conexión. Revisa el estado antes de reintentar.");
      }
    });
  }

  function link(issue: boolean) {
    setError("");
    transition(async () => {
      try {
        const result = await submitDisplayLink(gameId, state.link?.id ?? null, issue);
        if (!result.ok) setError(result.message);
        else setIssued(result.issued ? { id: result.linkId, path: result.path } : null);
      } catch {
        setError("Se perdió la conexión. Revisa el estado antes de reintentar.");
      }
    });
  }

  return <Card className="organizer-station reveal-control form-stack">
    <div className="reveal-control-heading">
      <div className="card-heading"><span className="tile-icon"><Sparkles size={21} aria-hidden="true" /></span><h2>Control del intercambio</h2></div>
      <Pill>{labels[state.state]}</Pill>
    </div>
    {state.total > 0 && <div className="reveal-control-progress">
      <p id="reveal-progress-label"><strong>{state.completed} de {state.total}</strong> entregas completadas</p>
      <progress value={state.completed} max={state.total} aria-labelledby="reveal-progress-label" />
    </div>}
    <section className="reveal-control-turn form-stack">
      {current && <>
        <p className="reveal-control-kicker"><Gift size={17} aria-hidden="true" /> Entrega {state.completed + 1} de {state.total}</p>
        <h3>Recibe {current.recipient}</h3>
        {current.result && <p>Regala <strong>{current.result.giver}</strong>
          {current.result.correct !== null && (current.result.correct ? " · Adivinanza correcta" : " · Hubo sorpresa")}</p>}
      </>}
      {state.state === "waiting" && (drawVersion === null ? <p>Ejecuta el sorteo antes de iniciar el intercambio.</p>
        : <Confirm disabled={disabled} label="Iniciar intercambio" title="¿Iniciar el intercambio?" onConfirm={() => change("start", null, null, true)}>
          Desde este momento quedarán bloqueados el sorteo, los participantes, las exclusiones y la edición de deseos.
        </Confirm>)}
      {state.state === "paused" && <Button disabled={disabled} onClick={() => change("resume")}>Reanudar intercambio</Button>}
      {state.state === "finished" && <>
        <h3 className="reveal-control-complete"><Check size={19} aria-hidden="true" /> Resumen del intercambio</h3>
        <ul className="name-list">{state.history.map(({ order, giver, recipient, correct }) => <li key={order}>
          <strong>{giver}</strong> le regaló a <strong>{recipient}</strong>
          {correct !== null && (correct ? " · Adivinanza correcta" : " · Hubo sorpresa")}
        </li>)}</ul>
      </>}
      {state.state === "running" && <>
        {!current && state.canNext && <Button disabled={disabled} onClick={() => change("next")}>Iniciar siguiente turno</Button>}
        {!current && state.postponed.length > 0 && <div className="reveal-control-postponed">
          <h3>Turnos pospuestos</h3>
          {state.postponed.map(({ id, recipient }) => <Button key={id} variant={state.canNext ? "secondary" : "default"} disabled={disabled} onClick={() => change("resume-turn", id)}>
            Retomar a {recipient}
          </Button>)}
        </div>}
        {!current && state.completed === state.total && <Confirm disabled={disabled} label="Finalizar intercambio" title="¿Finalizar el intercambio?"
          onConfirm={() => change("finish", null, null, true)}>El resumen quedará disponible en la pantalla de presentación.</Confirm>}
        {current && (current.revealed ? <Button disabled={disabled} onClick={() => change("complete")}>Marcar entrega completada</Button> : <>
          {state.guessing && <>
            <label>¿Quién crees que preparó el regalo?
              <select value={guess} disabled={disabled} onChange={(event) => setSelection({ revision, id: event.target.value })}>
                <option value="">Sin adivinanza</option>
                {state.candidates.map(({ id, name }) => <option key={id} value={id}>
                  {state.candidates.filter((person) => person.name === name).length > 1 ? `${name} · ref. ${id.slice(-8)}` : name}
                </option>)}
              </select>
            </label>
            {recorded && <p role="status">{current.guessSkipped ? "Se registró continuar sin adivinanza." : "Adivinanza registrada."}</p>}
          </>}
          <div className="reveal-control-actions">
            {state.guessing && guessPending && <Button disabled={disabled} onClick={() => change("guess", current.id, guess || null)}>
              {guess ? "Registrar adivinanza" : "Continuar sin adivinanza"}
            </Button>}
            <Confirm disabled={disabled || guessPending} secondary={guessPending}
              label="Revelar identidad" title={`¿Revelar quién le regala a ${current.recipient}?`}
              onConfirm={() => change("reveal", current.id, null, true)}>El nombre aparecerá en la pantalla de presentación.</Confirm>
          </div>
        </>)}
        <div className="reveal-control-secondary">
          <Button variant="secondary" disabled={disabled} onClick={() => change("pause")}>
            <Pause size={17} aria-hidden="true" /> Pausar intercambio
          </Button>
          {current && !current.revealed && <Button variant="secondary" disabled={disabled} onClick={() => change("postpone")}>Posponer turno</Button>}
        </div>
      </>}
      <p className="reveal-control-sync" role="status">
        {online ? <Radio size={17} aria-hidden="true" /> : <WifiOff size={17} aria-hidden="true" />}
        {!online ? "Sin conexión. Las acciones se habilitarán al volver." : busy ? "Guardando el cambio…" : "La pantalla consulta los cambios cada 3 segundos."}
      </p>
      {error && <div className="form-stack">
        <p role="alert">{error}</p>
        <Button variant="secondary" disabled={disabled} onClick={() => { setError(""); transition(() => router.refresh()); }}>Actualizar estado</Button>
      </div>}
    </section>
    <section className="reveal-control-display form-stack">
      <h3>Pantalla de presentación</h3>
      <p>Abre el enlace en el computador o televisor. El acceso dura 12 horas.</p>
      {state.link && <p>Última vigencia hasta el {formatEvent(new Date(state.link.expiresAt), timezone)}.</p>}
      <div className="actions">
        {state.link ? <>
          <Confirm disabled={disabled} secondary label="Renovar enlace de presentación" title="¿Renovar el enlace?"
            onConfirm={() => link(true)}>El enlace anterior dejará de funcionar.</Confirm>
          <Confirm disabled={disabled} secondary label="Revocar enlace de presentación" title="¿Revocar el enlace?"
            onConfirm={() => link(false)}>Los dispositivos conectados perderán acceso a esta presentación.</Confirm>
        </> : <Button disabled={disabled} variant="secondary" onClick={() => link(true)}>Generar enlace de presentación</Button>}
      </div>
      {issued && issued.id === state.link?.id && <>
        <ShareLink path={issued.path} origin={origin} label="Enlace de presentación" />
        <a className="button button-secondary" href={issued.path} target="_blank" rel="noreferrer">Abrir presentación</a>
      </>}
    </section>
  </Card>;
}
