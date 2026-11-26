"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarDays, Gift } from "lucide-react";
import { Card, EnvelopeScene, Pill } from "@/components/christmas";
import { Button } from "@/components/ui/button";
import { formatBudget, formatEvent } from "@/lib/registration/display";
import { readInvitationAction, requestRegistrationAction, type Feedback } from "../partidas/actions";

type Invitation = Awaited<ReturnType<typeof readInvitationAction>>;

export function Registration() {
  const [event, setEvent] = useState<Invitation | undefined>(undefined);
  const [token, setToken] = useState("");
  useEffect(() => {
    let generation = 0;
    function load() {
      const request = ++generation;
      const fragment = window.location.hash.slice(1);
      const data = new FormData();
      data.set("token", fragment);
      readInvitationAction(data).then((result) => {
        if (request !== generation) return;
        setEvent(result);
        setToken(fragment);
      }).catch(() => { if (request === generation) setEvent(null); });
    }
    load();
    window.addEventListener("hashchange", load);
    return () => {
      generation++;
      window.removeEventListener("hashchange", load);
    };
  }, []);
  if (event === undefined) return <p role="status">Cargando invitación…</p>;
  if (!event) return <Card><h1>Invitación no disponible</h1><p>Pide al organizador el enlace vigente.</p></Card>;
  return <div className="access-layout">
    <section className="hero access-hero">
      <div className="hero-copy"><h1>{event.name}</h1><Pill>{event.open ? "Inscripciones abiertas" : "Inscripciones cerradas"}</Pill></div>
      <EnvelopeScene />
    </section>
    <Card className="access-card form-stack">
      <h2>El intercambio</h2>
      <p><CalendarDays aria-hidden="true" size={18} /> {formatEvent(event.date, event.timezone)}</p>
      <p><Gift aria-hidden="true" size={18} /> {formatBudget(event.budgetMin, event.budgetMax)}</p>
      <a className="button button-secondary" href={`/acceso?partida=${event.id}`}>Entrar a mi partida</a>
      {event.open ? <RegistrationForm key={token} token={token} /> : <p>Por ahora no se reciben nuevas solicitudes.</p>}
    </Card>
  </div>;
}

function RegistrationForm({ token }: { token: string }) {
  const [state, submit, busy] = useActionState((_state: Feedback, data: FormData) => requestRegistrationAction(data), {});
  if (state.link) return <div className="form-stack">
    <h3>Solicitud recibida</h3>
    <p>Activa tu acceso para configurar el PIN y consultar si el organizador aprobó tu solicitud.</p>
    <a className="button button-primary" href={state.link}>Activar mi acceso individual</a>
  </div>;
  return <form className="form-stack" action={(data) => {
    data.set("token", token);
    submit(data);
  }}>
    <p>Usa tu nombre y apellidos si otra persona tiene el mismo nombre.</p>
    <label>Tu nombre<input name="name" required maxLength={60} autoComplete="name" /></label>
    {state.error && <p role="alert">{state.error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Enviando…" : "Solicitar inscripción"}</Button>
  </form>;
}
