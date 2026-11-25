"use client";

import { Gift, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { Card, Confirm, DemoLink, Pill, RevealStage } from "@/components/christmas";
import { Button } from "@/components/ui/button";
import { revealDemoTurn } from "./actions";
import { cast } from "./fixtures";
import { useDemo } from "./state";

export function RevealController() {
  const demo = useDemo();
  const [recipient, ...remaining] = demo.queue;
  const name = cast.find((person) => person.id === recipient)?.name;

  async function reveal() {
    demo.setBusy(true);
    demo.setError("");
    try {
      const result = await revealDemoTurn(recipient, demo.guess);
      if (!result) throw new Error("Turno de demo inexistente");
      demo.setCurrent(result);
    } catch {
      demo.setError("No se pudo revelar el turno. Intenta de nuevo.");
    } finally {
      demo.setBusy(false);
    }
  }

  function complete() {
    if (!demo.current) return;
    demo.setHistory([...demo.history, demo.current]);
    demo.setCurrent(null);
    demo.setGuess("");
    demo.setQueue(remaining);
    if (!remaining.length) demo.setPhase("Finalizado");
  }

  return <Card className="organizer-station">
    <div className="card-heading"><span className="tile-icon"><Sparkles size={21} aria-hidden="true" /></span><h2>Control del intercambio</h2></div>
    <p>La pantalla pública refleja el turno al navegar en esta misma pestaña.</p>
    <div className="actions"><DemoLink href="/display" secondary>Ver pantalla pública</DemoLink></div>
    {demo.phase === "Sorteado" && <Button onClick={() => {
      demo.setQueue(["lucia", "vale", "ines", "nico"]);
      demo.setPhase("En revelación");
    }}>Iniciar intercambio de demo</Button>}
    {(demo.phase === "Abiertas" || demo.phase === "Cerradas") && <p>Confirma el sorteo de demo para iniciar el intercambio.</p>}
    {demo.phase === "Finalizado" && <Pill>Intercambio finalizado · {demo.history.length} regalos entregados</Pill>}
    {demo.phase === "En revelación" && <div className="form-stack">
      <Pill>{demo.paused ? "Pausado" : `Turno ${demo.history.length + 1} de ${cast.length}`}</Pill>
      <h3>Recibe {name}</h3>
      <Button variant="secondary" disabled={demo.busy} onClick={() => demo.setPaused(!demo.paused)}>{demo.paused ? "Reanudar" : "Pausar"}</Button>
      {!demo.paused && (demo.current ? <>
        <p>Regaló {demo.current.giver}. Entreguen el regalo antes de continuar.</p>
        <Button onClick={complete}>{remaining.length ? "Completar y pasar al siguiente turno" : "Completar intercambio"}</Button>
      </> : <>
        {demo.settings.guessing && <label>Adivina quién regaló<select value={demo.guess} disabled={demo.busy} onChange={(event) => demo.setGuess(event.target.value)}>
          <option value="">Sin adivinanza</option>{cast.filter((person) => person.id !== recipient).map((person) => <option key={person.id}>{person.name}</option>)}
        </select></label>}
        <div className="actions">
          {demo.busy ? <Button disabled>Revelando…</Button> : <Confirm label="Revelar" title={`¿Revelar quién le regala a ${name}?`} onConfirm={reveal}>La identidad quedará visible en la pantalla pública de esta demo.</Confirm>}
          {remaining.length > 0 && <Button disabled={demo.busy} variant="secondary" onClick={() => { demo.setQueue([...remaining, recipient]); demo.setGuess(""); }}>Posponer turno</Button>}
        </div>
        {demo.error && <p role="alert">{demo.error}</p>}
      </>)}
    </div>}
  </Card>;
}

export function Display() {
  const { settings, phase, queue, current, history, paused, animateReveal, setAnimateReveal } = useDemo();
  const reduced = useReducedMotion();
  const recipient = cast.find((person) => person.id === queue[0]);

  return <>
    <RevealStage title={settings.title + " · Revelación ficticia"}>
      {phase === "Finalizado" ? <>
        <h1>¡Feliz Navidad!</h1>
        <p>Todos los regalos fueron entregados.</p>
        <ul className="result-list">{history.map((result) => <li key={result.recipient}>{result.giver} le regaló a {result.recipient}</li>)}</ul>
      </> : phase === "En revelación" && recipient ? <>
        <p>{paused ? "Intercambio en pausa" : `Regalo ${history.length + 1} de ${cast.length}`}</p>
        <h1>{recipient.name}</h1>
        {current ? <motion.div key={current.recipient} className="reveal-result" initial={animateReveal && !reduced ? { opacity: 0, y: 20 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: animateReveal && !reduced ? 1 : 0 }}>
          <Gift aria-hidden="true" /><p>Quien preparó tu regalo fue</p><strong>{current.giver}</strong>
          {current.guess && <p>{current.guess === current.giver ? "¡Adivinaste!" : `Tu apuesta fue ${current.guess}.`}</p>}
        </motion.div> : <p>{paused ? "El turno continuará cuando el organizador reanude." : settings.guessing ? "¿Quién preparó tu regalo?" : "Esperando la revelación…"}</p>}
      </> : <><h1>El intercambio</h1><p>Esperando que el organizador dé inicio a la revelación.</p></>}
    </RevealStage>
    <div className="display-tools">
      <DemoLink href="/organizador" secondary>Volver al control</DemoLink>
      {!reduced && <label className="check"><input type="checkbox" checked={!animateReveal} onChange={(event) => setAnimateReveal(!event.target.checked)} /> Omitir animación</label>}
    </div>
  </>;
}
