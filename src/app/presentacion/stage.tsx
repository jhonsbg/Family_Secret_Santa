"use client";

import { Check, Hourglass, LockKeyhole, Pause, Sparkles, Star, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { Presentation } from "@/lib/reveal/snapshot";
import { sceneFor } from "./presentation-state";

const ease = [0.22, 1, 0.36, 1] as const;
const sparks = [
  [-86, -32, -38], [-66, -72, 32], [-32, -102, -30], [5, -91, 24], [41, -94, -18], [82, -58, 47],
  [94, -15, -27], [80, 36, 34], [42, 66, -31], [-26, 68, 25], [-68, 52, 31], [-94, 14, -28],
];

function FestiveGift({ open = false, play = false }: { open?: boolean; play?: boolean }) {
  return <div className="show-gift" data-open={open} aria-hidden="true">
    <span className="show-gift-halo" />
    <Sparkles className="show-gift-star show-gift-star-left" />
    <Star className="show-gift-star show-gift-star-right" />
    <span className="show-gift-base" />
    <motion.span className="show-gift-lid"
      initial={play ? { y: 0, rotate: 0 } : false}
      animate={open ? { y: "-48%", rotate: -13 } : { y: 0, rotate: 0 }}
      transition={{ duration: play ? .65 : 0, ease }}><span className="show-gift-bow" /></motion.span>
  </div>;
}

function Celebration({ large = false }: { large?: boolean }) {
  return <div className={large ? "show-particles show-particles-large" : "show-particles"} aria-hidden="true">
    {sparks.map(([x, y, rotate], index) => <motion.i key={index} initial={{ opacity: 0, x: 0, y: 0, scale: .3 }}
      animate={{ opacity: [0, .85, 0], x: x * (large ? 2 : 1), y: y * (large ? 2 : 1), rotate, scale: [0.3, 1, .55] }}
      transition={{ duration: 1.02, delay: .1 + (index % 4) * .04, ease }} />)}
  </div>;
}

function Summary({ state, play }: { state: Presentation; play: boolean }) {
  const hits = state.history.filter(({ correct }) => correct === true).length;
  const misses = state.history.filter(({ correct }) => correct === false).length;
  return <>
    <div className="show-finale-mark" aria-hidden="true"><Sparkles />{play && <Celebration large />}</div>
    <h1>¡Feliz Navidad!</h1>
    <p className="show-caption">Todos los regalos fueron entregados.</p>
    <dl className="show-totals">
      <div><dt>Participantes</dt><dd>{state.total}</dd></div>
      {state.guessing && <><div><dt>Aciertos</dt><dd>{hits}</dd></div><div><dt>Errores</dt><dd>{misses}</dd></div></>}
    </dl>
    <ul className="result-list show-history" aria-label="Regalos entregados">{state.history.map(({ order, giver, recipient }) =>
      <li key={order}><strong>{giver}</strong> <span>le regaló a</span> <strong>{recipient}</strong></li>)}</ul>
  </>;
}

export function PresentationScene({ state, play }: { state: Presentation; play: boolean }) {
  const { kind, key } = sceneFor(state);
  return <SceneMoment key={key} state={state} kind={kind} allowMotion={play} />;
}

function SceneMoment({ state, kind, allowMotion }: {
  state: Presentation; kind: ReturnType<typeof sceneFor>["kind"]; allowMotion: boolean;
}) {
  const [motionEnabled, setMotionEnabled] = useState(allowMotion);
  if (motionEnabled && !allowMotion) setMotionEnabled(false);
  const play = motionEnabled && allowMotion;
  const current = state.current;
  const result = current?.result;
  const last = state.history.at(-1);
  const paused = state.state === "paused";
  return <section className="show-stage" data-scene={kind} aria-label="Intercambio presencial">
    {paused && <div className="show-paused" role="status"><Pause aria-hidden="true" /> Intercambio en pausa</div>}
    <motion.div className="show-scene" data-entry={play ? "animated" : "static"}
      initial={play ? { opacity: .72, y: 12 } : false} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: play ? .42 : 0, ease }}>
      {kind === "waiting" ? <>
        <FestiveGift />
        <h1>{state.name}</h1>
        <p className="show-caption">Esperando que el organizador dé inicio a la revelación.</p>
      </> : kind === "finished" ? <Summary state={state} play={play} /> : current ? <>
        <p className="show-eyebrow">Entrega {state.completed + 1} de {state.total}</p>
        <h1>{current.recipient}</h1>
        <FestiveGift open={Boolean(result)} play={Boolean(result) && play} />
        {result ? <motion.div className="reveal-result show-result" initial={play ? { opacity: .65, y: 14, scale: .98 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: play ? .58 : 0, delay: play ? .18 : 0, ease }}>
          {play && <Celebration />}
          <p>Quien preparó tu regalo fue</p><strong>{result.giver}</strong>
          {result.correct !== null && <p className="show-guess-result">
            {result.correct ? <><Check aria-hidden="true" /> ¡Adivinaste!</> : "¡Qué sorpresa! Esta vez la respuesta fue otra."}
          </p>}
        </motion.div> : <p className="show-caption">{kind === "guess" ? "¿Quién preparó tu regalo?"
          : "Tu regalo está listo. Esperando la revelación…"}</p>}
      </> : kind === "between" ? <>
        <span className="show-finale-mark" aria-hidden="true"><Check /></span>
        <h1>{state.completed === state.total ? "Todos los regalos entregados" : "Entrega registrada"}</h1>
        <p className="show-caption">{state.completed === state.total ? "Esperamos el cierre del intercambio." : "Enseguida continuamos."}</p>
        {last && <p className="show-last">Última entrega · {last.giver} le regaló a {last.recipient}</p>}
      </> : <>
        <FestiveGift />
        <h1>Que empiece el intercambio</h1>
        <p className="show-caption">El primer turno está por comenzar.</p>
      </>}
    </motion.div>
  </section>;
}

export function PresentationNotice({ connection }: { connection: "connecting" | "retrying" | "stale" | "denied" }) {
  const Icon = connection === "denied" ? LockKeyhole : connection === "connecting" ? Hourglass : WifiOff;
  const title = connection === "denied" ? "Acceso finalizado" : connection === "stale" ? "Presentación en espera" : "El intercambio";
  const message = connection === "denied" ? "El enlace ya no está disponible. Pide un enlace vigente al organizador."
    : connection === "stale" ? "Perdimos la conexión. Retomaremos la presentación al recuperar el estado actual."
    : connection === "retrying" ? "Estamos intentando conectar con el intercambio." : "Conectando con el intercambio…";
  return <section className="show-stage" data-scene={connection}><div className="show-scene">
    <span className="show-finale-mark" aria-hidden="true"><Icon /></span>
    <h1>{title}</h1>
    <p className="show-caption">{message}</p>
  </div></section>;
}
