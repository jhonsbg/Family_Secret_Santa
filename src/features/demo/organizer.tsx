"use client";

import { CalendarDays, ClipboardCheck, Gift, Settings2, Sparkles, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Confirm, DemoLink, Pill } from "@/components/christmas";
import { Button } from "@/components/ui/button";
import { cast, eventBudget, eventDate, type Person } from "./fixtures";
import { RevealController } from "./reveal";
import { useDemo } from "./state";

function ParticipantRow({ person, editable, onChange, onRemove }: { person: Person; editable: boolean; onChange: (person: Person) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (name) { onChange({ ...person, name }); setEditing(false); }
  }
  return <li className="person-row">
    <div className="person-name"><span className="avatar" aria-hidden="true">{person.name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span><div><strong>{person.name}</strong><div className="person-status">{person.status}</div></div></div>
    {editable && (editing ? <form className="actions" onSubmit={rename}>
      <label>Nuevo nombre<input name="name" required maxLength={60} defaultValue={person.name} /></label>
      <Button type="submit">Aplicar</Button><Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
    </form> : <div className="actions">
      {person.status === "Pendiente" && <Button onClick={() => onChange({ ...person, status: "Sin activar" })} aria-label={`Aprobar a ${person.name}`}>Aprobar</Button>}
      {!cast.some(({ id }) => id === person.id) && <>
        <Button variant="secondary" onClick={() => setEditing(true)} aria-label={`Editar a ${person.name}`}>Editar</Button>
        <Button variant="secondary" onClick={onRemove} aria-label={`${person.status === "Pendiente" ? "Rechazar" : "Retirar"} a ${person.name}`}>{person.status === "Pendiente" ? "Rechazar" : "Retirar"}</Button>
      </>}
    </div>)}
  </li>;
}

export function Organizer() {
  const demo = useDemo();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [validation, setValidation] = useState(false);
  const [invalidScenario, setInvalidScenario] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const editable = demo.phase === "Abiertas" || demo.phase === "Cerradas";
  const pending = demo.people.filter((person) => person.status === "Pendiente").length;
  const inactive = demo.people.filter((person) => person.status === "Sin activar").length;
  const valid = !pending && !invalidScenario;
  const activeStage = demo.phase === "Abiertas" ? 1 : demo.phase === "Cerradas" || demo.phase === "Sorteado" ? 2 : 3;
  const stages = [
    { id: "preparacion", name: "Preparación", detail: "Datos del encuentro", Icon: Settings2 },
    { id: "inscripciones", name: "Inscripciones", detail: pending ? `${pending} por revisar` : "Sin solicitudes pendientes", Icon: Users },
    { id: "sorteo", name: "Sorteo", detail: demo.version ? `Versión ${demo.version}` : "Validación del escenario", Icon: Gift },
    { id: "intercambio", name: "Revelación", detail: demo.phase === "Finalizado" ? "Intercambio finalizado" : "Control y pantalla pública", Icon: Sparkles },
  ];

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title")).trim();
    if (!title) { setNote("Escribe un nombre para la partida."); return; }
    demo.setSettings({ title, date: String(form.get("date")), budget: Number(form.get("budget")), organizerPlays: form.has("plays"), wishes: form.has("wishes"), guessing: form.has("guessing") });
    if (creating) {
      demo.setPeople(cast);
      demo.setRequestId("");
      demo.setPhase("Abiertas");
    }
    setNote(creating ? "Partida ficticia creada con el elenco de ejemplo." : "Configuración aplicada en esta visita.");
    setSettingsOpen(false);
  }

  function updatePerson(person: Person) {
    if (demo.people.some((item) => item.id !== person.id && item.name.toLocaleLowerCase() === person.name.toLocaleLowerCase())) {
      setError("Ya existe una persona con ese nombre.");
      return;
    }
    demo.setPeople(demo.people.map((item) => item.id === person.id ? person : item));
    setValidation(false);
    setError("");
  }

  function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (!name || demo.people.some((person) => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError("Escribe un nombre distinto a los que ya están inscritos.");
      return;
    }
    demo.setPeople([...demo.people, { id: crypto.randomUUID(), name, status: "Sin activar" }]);
    setError("");
    setValidation(false);
    event.currentTarget.reset();
  }

  function draw() {
    const repeated = demo.version > 0;
    demo.setVersion(demo.version + 1);
    demo.setEnvelopeOpened(false);
    demo.setPhase("Sorteado");
    setNote(repeated ? "Versión anterior invalidada en la interfaz. El guion ficticio se conserva." : "Sorteo de demo confirmado. El sobre de ejemplo está disponible.");
  }

  return <>
    <section id="preparacion" tabIndex={-1} className="organizer-hero festive-header">
      <div className="organizer-heading">
        <p className="hero-kicker"><Settings2 size={17} aria-hidden="true" /> Organizador</p>
        <h1>{demo.settings.title}</h1>
        <p><CalendarDays size={17} aria-hidden="true" /> {eventDate(demo.settings.date)} · {eventBudget(demo.settings.budget)}</p>
        <Pill>{demo.phase === "Abiertas" ? "Inscripciones abiertas" : demo.phase === "Cerradas" ? "Inscripciones cerradas" : demo.phase}</Pill>
      </div>
      <div className="actions">
        <DemoLink href="/" secondary>Ver invitación</DemoLink>
        {editable && <><Button variant="secondary" aria-expanded={settingsOpen && !creating} onClick={() => { setCreating(false); setSettingsOpen(!settingsOpen || creating); }}><Settings2 size={17} /> Configuración</Button>
          <Button variant="secondary" aria-expanded={settingsOpen && creating} onClick={() => { setCreating(true); setSettingsOpen(!settingsOpen || !creating); }}>Crear partida de demo</Button></>}
      </div>
    </section>
    <nav className="stage-nav" aria-label="Etapas del organizador">
      <ol>{stages.map(({ id, name, detail, Icon }, index) => <li key={id}>
        <a href={`#${id}`} aria-current={index === activeStage ? "step" : undefined}>
          <span className="stage-icon"><Icon size={19} aria-hidden="true" /></span>
          <span><strong>{name}</strong><small>{detail}</small></span>
        </a>
      </li>)}</ol>
    </nav>
    <p role="status" className="feedback">{note}</p>
    {editable && settingsOpen && <Card key={String(creating)}><h2>{creating ? "Nueva partida ficticia" : "Configuración de la partida"}</h2>
      <form className="form-stack" onSubmit={saveSettings}>
        <label>Nombre<input name="title" required maxLength={60} defaultValue={creating ? "" : demo.settings.title} /></label>
        <div className="two-grid">
          <label>Fecha y hora en Bogotá<input name="date" type="datetime-local" required defaultValue={demo.settings.date} /></label>
          <label>Presupuesto sugerido en COP<input name="budget" type="number" required min="0" max="100000000" defaultValue={demo.settings.budget} /></label>
        </div>
        <label className="check"><input name="plays" type="checkbox" defaultChecked={demo.settings.organizerPlays} /> El organizador también participa</label>
        <label className="check"><input name="wishes" type="checkbox" defaultChecked={demo.settings.wishes} /> Habilitar deseos</label>
        <label className="check"><input name="guessing" type="checkbox" defaultChecked={demo.settings.guessing} /> Habilitar adivinanzas</label>
        {creating && <p>Esta acción reemplaza la partida ficticia y vuelve al elenco de ejemplo.</p>}
        <Button type="submit">{creating ? "Crear en la demo" : "Aplicar configuración"}</Button>
      </form>
    </Card>}
    <div className="admin-grid">
      <div id="inscripciones" tabIndex={-1}><Card className="organizer-station">
        <div className="card-heading"><span className="tile-icon"><Users size={21} aria-hidden="true" /></span><h2>Inscripciones</h2></div>
        <p>{demo.people.length - pending} confirmadas · {pending} pendientes · {inactive} sin activar</p>
        {inactive > 0 && <p className="notice">Las personas sin activar están confirmadas. En la partida real necesitarán activar su acceso para consultar el sobre.</p>}
        <ul className="person-list">{demo.people.map((person) => <ParticipantRow key={person.id} person={person} editable={editable} onChange={updatePerson} onRemove={() => {
          demo.setPeople(demo.people.filter((item) => item.id !== person.id)); setValidation(false); setError("");
        }} />)}</ul>
        {demo.phase === "Abiertas" && <form className="form-stack" onSubmit={addPerson}>
          <label>Nombre ficticio para registro manual<input name="name" required maxLength={60} autoComplete="off" aria-describedby={error ? "people-error" : undefined} /></label>
          <Button type="submit" variant="secondary">Agregar y confirmar</Button>
        </form>}
        {error && <p id="people-error" role="alert">{error}</p>}
        {demo.phase === "Abiertas" && <div className="station-actions"><Button onClick={() => { demo.setPhase("Cerradas"); setValidation(false); }}>Cerrar inscripciones</Button></div>}
      </Card></div>
      <div className="form-stack">
        <div id="sorteo" tabIndex={-1}><Card className="organizer-station"><div className="card-heading"><span className="tile-icon"><ClipboardCheck size={21} aria-hidden="true" /></span><h2>Sorteo de demo</h2></div>
          <p>El sobre y la revelación usan los cuatro personajes del guion, aunque agregues personas o cambies la participación del organizador.</p>
          {demo.phase === "Abiertas" && <p className="notice">Cierra las inscripciones para validar el escenario.</p>}
          {demo.phase === "Cerradas" && <div className="form-stack">
            <label className="check"><input type="checkbox" checked={invalidScenario} onChange={(event) => { setInvalidScenario(event.target.checked); setValidation(false); }} /> Simular restricciones incompatibles</label>
            <div className="actions">
              <Button onClick={() => setValidation(true)}>Validar escenario</Button>
              <Button variant="secondary" onClick={() => { demo.setPhase("Abiertas"); setValidation(false); }}>Reabrir</Button>
            </div>
            {validation && <p role="status" className="notice">{pending ? "Aprueba o rechaza las solicitudes pendientes." : invalidScenario ? "Escenario bloqueado. Desmarca las restricciones incompatibles para continuar." : "Guion disponible para confirmar."}</p>}
            {validation && valid && <Confirm label="Confirmar sorteo de demo" title="¿Confirmar el escenario de sorteo?" onConfirm={draw}>El sobre se habilitará con el resultado ficticio del guion.</Confirm>}
          </div>}
          {!editable && <p><Gift size={18} /> Sorteo de demo · versión {demo.version} · {demo.envelopeOpened ? "1 sobre consultado" : "0 sobres consultados"}</p>}
          {demo.phase === "Sorteado" && <Confirm secondary label="Repetir sorteo de demo" title="¿Invalidar la versión anterior?" onConfirm={draw}>Se cerrará el sobre consultado y se creará una versión nueva del mismo guion ficticio.</Confirm>}
        </Card></div>
        <div id="intercambio" tabIndex={-1}><RevealController /></div>
      </div>
    </div>
  </>;
}
