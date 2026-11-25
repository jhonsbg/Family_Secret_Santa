"use client";

import { CalendarDays, Gift, Heart, Mail, Users } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { useEffect, useState, type FormEvent } from "react";
import { Card, DemoLink, EnvelopeScene, Pill } from "@/components/christmas";
import { WishlistFields } from "@/components/wishlist-fields";
import { wishFields } from "@/lib/participant/wishes";
import { Button } from "@/components/ui/button";
import { readDemoEnvelope } from "./actions";
import { eventBudget, eventDate, type Wishes } from "./fixtures";
import { useDemo } from "./state";

function WishlistForm({ wishes, readOnly, onSave }: { wishes: Wishes; readOnly: boolean; onSave: (wishes: Wishes) => void }) {
  const [saved, setSaved] = useState(false);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({ gift: String(data.get("gift")).trim(), likes: String(data.get("likes")).trim(), avoid: String(data.get("avoid")).trim() });
    setSaved(true);
  }
  return <form className="form-stack" onSubmit={save} onChange={() => setSaved(false)}>
    <WishlistFields wishes={wishes} readOnly={readOnly} />
    {readOnly ? <p>Edición cerrada durante el intercambio.</p> : <Button type="submit">Aplicar deseos en la demo</Button>}
    <span role="status">{saved && "Deseos actualizados en esta visita."}</span>
  </form>;
}

export function Participant() {
  const demo = useDemo();
  const reduced = useReducedMotion();
  const [envelope, setEnvelope] = useState<Awaited<ReturnType<typeof readDemoEnvelope>> | null>(null);
  const [activation, setActivation] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [animate, setAnimate] = useState(true);
  const [replay, setReplay] = useState(0);
  const [note, setNote] = useState("");
  const available = ["Sorteado", "En revelación", "Finalizado"].includes(demo.phase);
  const locked = demo.phase === "En revelación" || demo.phase === "Finalizado";
  const request = demo.people.find((person) => person.id === demo.requestId);

  useEffect(() => {
    if (!demo.access || !demo.envelopeOpened || envelope) return;
    let active = true;
    readDemoEnvelope().then((data) => {
      if (active) setEnvelope(data);
    }).catch(() => {
      if (active) setError("No pudimos cargar el sobre. Puedes volver a abrirlo.");
    });
    return () => { active = false; };
  }, [demo.access, demo.envelopeOpened, envelope]);

  async function open() {
    setBusy(true);
    setError("");
    try {
      setEnvelope(await readDemoEnvelope());
      demo.setEnvelopeOpened(true);
      setReplay(1);
    } catch {
      setError("No pudimos abrir el sobre de demo. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!demo.access) return <div className="access-layout">
    <section className="hero access-hero">
      <div className="hero-copy">
        <p className="hero-kicker"><Gift size={17} aria-hidden="true" /> {demo.settings.title}</p>
        <h1>Mi partida</h1>
        <p>Tu sobre, tus deseos y el encuentro familiar.</p>
      </div>
      <EnvelopeScene />
    </section>
    <Card className="access-card form-stack">
      <span className="tile-icon"><Mail size={22} aria-hidden="true" /></span>
      <h2>{activation ? "Activar invitación de demo" : "Acceso de participante"}</h2>
      {request?.status === "Pendiente" && <p className="notice">Tu solicitud está pendiente. Puedes explorar el perfil ficticio de Valentina mientras tanto.</p>}
      <p>Acceso simulado con el perfil ficticio de Valentina Reyes.</p>
      <label className="check choice"><input type="checkbox" checked={temporary} onChange={(event) => setTemporary(event.target.checked)} /> Simular dispositivo prestado</label>
      <Button onClick={() => {
        if (activation) {
          demo.setPeople(demo.people.map((person) => person.id === "ines" && person.status === "Sin activar" ? { ...person, status: "Activo" } : person));
          setNote("Activación ficticia de Inés aplicada. Estás explorando el perfil de Valentina.");
        }
        demo.setAccess(temporary ? "temporal" : "regular");
      }}>{activation ? "Simular activación de Inés y continuar" : "Entrar como Valentina"}</Button>
      <Button variant="secondary" onClick={() => setActivation(!activation)}>{activation ? "Volver al acceso de demo" : "Probar activación manual de Inés"}</Button>
    </Card>
  </div>;

  const play = replay > 0 && animate && !reduced;
  const confirmed = demo.people.filter((person) => person.status !== "Pendiente");
  return <>
    <div className="participant-header">
      <div>
        <p className="section-label">{demo.settings.title}</p>
        <h1>Hola, Valentina</h1>
      </div>
      <div className="actions">
        <Pill>{demo.access === "temporal" ? "Dispositivo prestado · Demo" : "Perfil ficticio"}</Pill>
        <Button variant="secondary" onClick={() => { demo.setAccess(null); setEnvelope(null); setReplay(0); setNote(""); }}>Salir de la demo personal</Button>
      </div>
    </div>
    {note && <p className="notice participant-note" role="status">{note}</p>}
    <section className="hero envelope-hero" aria-labelledby="envelope-title">
      <div className="hero-copy">
        <p className="hero-kicker"><Mail size={17} aria-hidden="true" /> {envelope ? "Sobre abierto" : available ? "Sobre disponible" : "A la espera del sorteo"}</p>
        <h2 id="envelope-title">Mi sobre secreto</h2>
        {envelope ? <>
          <p>Consulta tu asignación cuando la necesites.</p>
          <div className="actions">
            {demo.settings.wishes && <a className="button button-primary" href="#deseos-asignados">Ver sus deseos</a>}
            {!reduced && <Button variant="secondary" onClick={() => { setAnimate(true); setReplay(replay + 1); }}>Reproducir animación</Button>}
          </div>
        </> : available ? <>
          <p>Descubre para quién prepararás el regalo de Navidad.</p>
          <div className="actions"><Button onClick={open} disabled={busy}>{busy ? "Abriendo…" : demo.envelopeOpened ? "Consultar mi sobre" : "Abrir mi sobre"}</Button></div>
          {!reduced && <label className="check envelope-option"><input type="checkbox" checked={!animate} onChange={(event) => setAnimate(!event.target.checked)} /> Omitir animación</label>}
          {error && <p role="alert">{error}</p>}
        </> : <>
          <p>El sobre estará disponible después del sorteo de demo.</p>
          <div className="actions"><DemoLink href="/organizador" secondary>Ir al organizador</DemoLink></div>
        </>}
      </div>
      <div className="envelope-announcement" aria-live="polite">
        <EnvelopeScene key={replay} open={Boolean(envelope)} play={play}>
          {envelope && <motion.div className="envelope-result"
            initial={play ? { opacity: 0, y: 35, scale: .93 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: play ? .46 : 0, delay: play ? .4 : 0 }}>
            <p>Te tocó regalarle a</p><strong>{envelope.name}</strong>
            <span>Sobre de demo · Versión {demo.version}</span>
          </motion.div>}
        </EnvelopeScene>
      </div>
    </section>
    <div className="event-strip participant-event">
      <div><CalendarDays aria-hidden="true" /><span><strong>El encuentro</strong>{eventDate(demo.settings.date)}</span></div>
      <div><Gift aria-hidden="true" /><span><strong>Presupuesto sugerido</strong>{eventBudget(demo.settings.budget)}</span></div>
      <div><DemoLink href="/display" secondary>Ir a la pantalla pública</DemoLink></div>
    </div>
    <div className="participant-grid">
      {demo.settings.wishes && <div className="form-stack">
        {envelope && <div id="deseos-asignados" tabIndex={-1}><Card className="assigned-wishes">
          <div className="card-heading"><span className="tile-icon"><Gift size={22} aria-hidden="true" /></span><h2>Deseos de {envelope.name}</h2></div>
          <dl className="wish-list">{wishFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{envelope.wishes[key]}</dd></div>)}</dl>
        </Card></div>}
        <Card><div className="card-heading"><span className="tile-icon"><Heart size={22} aria-hidden="true" /></span><h2>Mis deseos</h2></div>
          <WishlistForm wishes={demo.wishes} onSave={demo.setWishes} readOnly={locked} />
        </Card>
      </div>}
      <Card><div className="card-heading"><span className="tile-icon"><Users size={22} aria-hidden="true" /></span><h2>Participantes confirmados</h2></div>
        <ul className="name-list">{confirmed.map((person) => <li key={person.id}><span className="avatar" aria-hidden="true">{person.name.slice(0, 1)}</span>{person.name}</li>)}</ul>
        {locked && <p>El intercambio ya comenzó.</p>}
      </Card>
    </div>
  </>;
}
