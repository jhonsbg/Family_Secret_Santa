"use client";

import { Gift, Heart, Mail } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Card, EnvelopeScene } from "@/components/christmas";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { WishlistFields } from "@/components/wishlist-fields";
import type { ParticipantStatus } from "@/lib/participant/service";
import { wishFields, type Wishes } from "@/lib/participant/wishes";
import { openMyEnvelope, readRecipientWishes, saveMyWishes } from "./actions";

const statusPath = "/acceso/cuenta/estado";
const drawChanged = "Se realizó un nuevo sorteo. Abre tu nuevo sobre.";
const statusUnavailable = "No pudimos verificar el estado del sorteo. Intenta de nuevo.";
const accessUnavailable = "Tu acceso ya no está disponible. Vuelve a ingresar para continuar.";

function olderStatus(incoming: ParticipantStatus, known: ParticipantStatus) {
  return incoming.revision < known.revision
    || (incoming.revision === known.revision && known.version === null && incoming.version !== null);
}

export function ParticipantExperience({ initialStatus, wishes, budget }: {
  initialStatus: ParticipantStatus; wishes: Wishes; budget: string;
}) {
  const reduced = useReducedMotion();
  const [status, setStatus] = useState(initialStatus);
  const [result, setResult] = useState<{ version: number; name: string } | null>(null);
  const [recipient, setRecipient] = useState<{ version: number; wishes: Wishes } | null>(null);
  const [skip, setSkip] = useState(false);
  const [animation, setAnimation] = useState(0);
  const [envelopeBusy, setEnvelopeBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [message, setMessage] = useState(initialStatus.version && initialStatus.version > 1 && !initialStatus.opened ? drawChanged : "");
  const [access, setAccess] = useState<"checking" | "ready" | "unavailable" | "denied">("checking");
  const current = useRef(initialStatus);
  const requestSequence = useRef(0);
  const lastApplied = useRef(0);
  const generation = useRef(0);
  const accessEnded = useRef(false);
  const pendingPoll = useRef<Promise<ParticipantStatus | null> | null>(null);
  const mounted = useRef(false);
  const wishesHeading = useRef<HTMLHeadingElement>(null);

  const clearPrivate = useCallback(() => {
    generation.current += 1;
    setResult(null);
    setRecipient(null);
    setAnimation(0);
    setEnvelopeBusy(false);
  }, []);

  const checkStatus = useCallback(async () => {
    if (accessEnded.current) return null;
    const id = ++requestSequence.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(statusPath, { cache: "no-store", signal: controller.signal });
      if (response.status === 401) {
        if (mounted.current && id >= lastApplied.current) {
          lastApplied.current = id;
          accessEnded.current = true;
          clearPrivate();
          setAccess("denied");
        }
        return null;
      }
      if (!response.ok) throw new Error();
      const next: ParticipantStatus = await response.json();
      if (!mounted.current || accessEnded.current) return null;
      if (next.sessionView !== initialStatus.sessionView) {
        if (id >= lastApplied.current) {
          lastApplied.current = id;
          accessEnded.current = true;
          clearPrivate();
          setAccess("denied");
        }
        return null;
      }
      if (olderStatus(next, current.current)) return null;
      if (id < lastApplied.current && next.revision === current.current.revision
        && next.version === current.current.version) return null;
      lastApplied.current = Math.max(id, lastApplied.current);
      if (next.version !== current.current.version || next.revision !== current.current.revision) {
        clearPrivate();
        setMessage(next.version ? drawChanged : "El sorteo anterior fue anulado. Tu sobre estará disponible después del próximo sorteo.");
      } else if (current.current.opened && !next.opened) {
        return null;
      }
      if (!next.wishesEnabled) setRecipient(null);
      current.current = next;
      setAccess("ready");
      setStatus(next);
      return next;
    } catch {
      if (mounted.current && !accessEnded.current && id >= lastApplied.current) {
        lastApplied.current = id;
        clearPrivate();
        setAccess("unavailable");
      }
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }, [clearPrivate, initialStatus.sessionView]);

  useEffect(() => {
    mounted.current = true;
    const poll = () => {
      if (document.hidden || pendingPoll.current) return;
      const task = checkStatus().finally(() => {
        if (pendingPoll.current === task) pendingPoll.current = null;
      });
      pendingPoll.current = task;
    };
    const visibility = () => {
      if (document.hidden) clearPrivate();
      else poll();
    };
    poll();
    const timer = window.setInterval(poll, 4000);
    window.addEventListener("focus", poll);
    window.addEventListener("pageshow", poll);
    window.addEventListener("pagehide", clearPrivate);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
      window.removeEventListener("pageshow", poll);
      window.removeEventListener("pagehide", clearPrivate);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [checkStatus, clearPrivate]);

  useEffect(() => {
    if (recipient) wishesHeading.current?.focus();
  }, [recipient]);

  async function requestEnvelope(replay = false) {
    const version = current.current.version;
    if (!version) return;
    const request = generation.current;
    setEnvelopeBusy(true);
    setMessage("");
    try {
      const opened = await openMyEnvelope(version, initialStatus.sessionView);
      const latest = await checkStatus();
      if (request !== generation.current || current.current.version !== version || !mounted.current) return;
      if (!opened.ok || latest?.version !== opened.version) {
        setMessage("No pudimos consultar tu sobre. Intenta de nuevo.");
        return;
      }
      setResult({ version, name: opened.name });
      setAnimation((previous) => !reduced && (replay || (opened.first && !skip)) ? previous + 1 : 0);
    } catch {
      if (request === generation.current) setMessage("No pudimos consultar tu sobre. Intenta de nuevo.");
    } finally {
      if (mounted.current && request === generation.current) setEnvelopeBusy(false);
    }
  }

  async function showWishes() {
    const version = current.current.version;
    if (!version) return;
    const request = generation.current;
    setEnvelopeBusy(true);
    setMessage("");
    try {
      const found = await readRecipientWishes(version, initialStatus.sessionView);
      const latest = await checkStatus();
      if (request !== generation.current || current.current.version !== version || !mounted.current) return;
      if (!found.ok || latest?.version !== found.version || !latest.wishesEnabled) {
        setMessage("No pudimos consultar sus deseos. Intenta de nuevo.");
        return;
      }
      setRecipient({ version, wishes: found.wishes });
    } catch {
      if (request === generation.current) setMessage("No pudimos consultar sus deseos. Intenta de nuevo.");
    } finally {
      if (mounted.current && request === generation.current) setEnvelopeBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { revision, version } = current.current;
    setSaving(true);
    setFormMessage("");
    try {
      const saved = await saveMyWishes(revision, version, form, initialStatus.sessionView);
      if (saved.ok) setFormMessage("Tus deseos quedaron guardados.");
      else {
        setFormMessage(saved.reason === "stale" ? "El sorteo cambió. Revisa el estado y vuelve a guardar."
          : saved.reason === "invalid" ? "Revisa los campos. Cada uno admite hasta 250 caracteres de texto."
          : "No pudimos guardar tus deseos. Revisa si la edición sigue disponible.");
        await checkStatus();
      }
    } catch {
      setFormMessage("No pudimos guardar tus deseos. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const name = access === "ready" && result?.version === status.version ? result.name : null;
  const recipientWishes = name && status.wishesEnabled && recipient?.version === status.version ? recipient.wishes : null;
  const play = Boolean(name) && animation > 0 && !reduced;
  return <>
    <section className="hero envelope-hero" aria-labelledby="real-envelope-title">
      <div className="hero-copy">
        <p className="hero-kicker"><Mail size={17} aria-hidden="true" /> {name ? "Sobre abierto" : status.version ? "Sobre disponible" : "A la espera del sorteo"}</p>
        <h2 id="real-envelope-title">Mi sobre secreto</h2>
        <p>Presupuesto sugerido · {budget}</p>
        {access === "denied" ? <>
          <p role="status">{accessUnavailable}</p>
          <a className="button button-secondary" href="/acceso">Volver a ingresar</a>
        </> : access === "unavailable" ? <>
          <p role="status">{statusUnavailable}</p>
          <Button variant="secondary" onClick={() => { void checkStatus(); }}>Volver a comprobar</Button>
        </> : name ? <>
          <p>Tu asignación está disponible en tu cuenta.</p>
          <div className="actions">
            {status.wishesEnabled && <Button onClick={showWishes} disabled={envelopeBusy}>Ver sus deseos</Button>}
            {!reduced && <Button variant="secondary" onClick={() => requestEnvelope(true)} disabled={envelopeBusy}>Reproducir animación</Button>}
          </div>
        </> : status.version ? <>
          <p>Descubre para quién prepararás el regalo de Navidad.</p>
          <div className="actions"><Button onClick={() => requestEnvelope()} disabled={envelopeBusy || access !== "ready"}>
            {envelopeBusy ? "Consultando…" : status.opened ? "Consultar mi sobre" : "Abrir mi sobre"}
          </Button></div>
          {!status.opened && !reduced && <label className="check envelope-option">
            <input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} /> Omitir animación
          </label>}
        </> : <p>Tu sobre estará aquí después de que el organizador haga el sorteo.</p>}
        <p role="status" hidden={!message}>{message}</p>
      </div>
      <div className="envelope-announcement" aria-live="polite">
        <EnvelopeScene key={animation} open={Boolean(name)} play={play}>
          {name && <motion.div className="envelope-result"
            initial={play ? { opacity: 0, y: 35, scale: .93 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: play ? .46 : 0, delay: play ? .4 : 0 }}>
            <p>¡Te tocó regalarle a</p><strong>{name}!</strong>
          </motion.div>}
        </EnvelopeScene>
      </div>
    </section>
    {recipientWishes && <Card className="assigned-wishes">
      <div className="card-heading"><span className="tile-icon"><Gift size={22} aria-hidden="true" /></span>
        <h2 tabIndex={-1} ref={wishesHeading}>Deseos de {name}</h2>
      </div>
      {Object.values(recipientWishes).some(Boolean) ? <dl className="wish-list">
        {wishFields.filter(([key]) => recipientWishes[key]).map(([key, label]) =>
          <div key={key}><dt>{label}</dt><dd>{recipientWishes[key]}</dd></div>)}
      </dl> : <p>Todavía no ha agregado deseos. Puedes volver a consultarlos más adelante.</p>}
    </Card>}
    {status.wishesEnabled && access !== "denied" && <Card>
      <div className="card-heading"><span className="tile-icon"><Heart size={22} aria-hidden="true" /></span><h2>Mis deseos</h2></div>
      <p>Todos los campos son opcionales. Puedes escribir hasta 250 caracteres en cada uno.</p>
      <form className="form-stack" method="post" onSubmit={save} onChange={() => setFormMessage("")}>
        <WishlistFields wishes={wishes} readOnly={!status.editable || saving || access !== "ready"} />
        {!status.editable ? <p>La edición de deseos está cerrada durante el intercambio.</p>
          : <Button type="submit" disabled={saving || access !== "ready"}>{saving ? "Guardando…" : "Guardar mis deseos"}</Button>}
        <span role="status">{formMessage}</span>
      </form>
    </Card>}
  </>;
}
