"use client";

import { CalendarDays, Gift, Heart, Sparkles, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, DemoLink, EnvelopeScene, Pill } from "@/components/christmas";
import { Button } from "@/components/ui/button";
import { eventBudget, eventDate } from "./fixtures";
import { useDemo } from "./state";

export function Invitation() {
  const demo = useDemo();
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const request = demo.people.find((person) => person.id === demo.requestId);

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (!name || demo.people.some((person) => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError("Escribe un nombre distinto a los que ya están inscritos.");
      return;
    }
    const id = crypto.randomUUID();
    demo.setPeople([...demo.people, { id, name, status: "Pendiente" }]);
    demo.setRequestId(id);
    setError("");
    setRegister(false);
  }

  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="hero-kicker"><Sparkles size={17} aria-hidden="true" /> {demo.settings.title}</p>
        <h1>Una Navidad<br />llena de <em>secretos.</em></h1>
        <p>Un regalo elegido con cariño, un nombre por descubrir y una noche para celebrar en familia.</p>
        <div className="actions">
          {demo.phase === "Abiertas" && !request && <Button onClick={() => setRegister(!register)} aria-expanded={register}>{register ? "Cerrar inscripción" : "Quiero participar"}</Button>}
          <DemoLink href="/participante" secondary>Explorar mi partida</DemoLink>
        </div>
      </div>
      <EnvelopeScene />
    </section>
    <div className="event-strip">
      <div><CalendarDays aria-hidden="true" /><span><strong>El encuentro</strong>{eventDate(demo.settings.date)}</span></div>
      <div><Gift aria-hidden="true" /><span><strong>Presupuesto sugerido</strong>{eventBudget(demo.settings.budget)}</span></div>
      <div><Users aria-hidden="true" /><span><strong>Inscripciones</strong>{demo.phase}</span></div>
    </div>
    {register && demo.phase === "Abiertas" && !request && <Card>
      <h2>Solicita unirte</h2>
      <form className="form-stack" onSubmit={join}>
        <label>Tu nombre ficticio<input name="name" required maxLength={60} autoComplete="off" aria-describedby={error ? "join-error" : undefined} /></label>
        {error && <p id="join-error" role="alert">{error}</p>}
        <Button type="submit">Enviar solicitud de demo</Button>
      </form>
    </Card>}
    {request && <Card>
      <Pill>{request.status === "Pendiente" ? "En espera de aprobación" : "Solicitud aprobada"}</Pill>
      <h2>{request.name}</h2>
      {request.status === "Pendiente" ? <><p>Prueba la aprobación desde el panel del organizador.</p><DemoLink href="/organizador" secondary>Ir al organizador</DemoLink></> : <DemoLink href="/participante">Continuar al acceso de demo</DemoLink>}
    </Card>}
    {demo.requestId && !request && <p role="status">La solicitud ficticia fue retirada. Puedes iniciar otra mientras las inscripciones estén abiertas.</p>}
    <section className="how">
      <h2>Así jugamos</h2>
      <div className="three-grid">
        <Card><span className="tile-icon"><Users size={21} /></span><h3>Únete a la partida</h3><p>Solicita un lugar y espera la confirmación del organizador.</p></Card>
        <Card><span className="tile-icon"><Heart size={21} /></span><h3>Prepara tu regalo</h3><p>Abre tu sobre para descubrir a quién le regalarás.</p></Card>
        <Card><span className="tile-icon"><Sparkles size={21} /></span><h3>Descubran el secreto</h3><p>Reúnanse en familia para revelar quién preparó cada regalo.</p></Card>
      </div>
    </section>
  </>;
}
