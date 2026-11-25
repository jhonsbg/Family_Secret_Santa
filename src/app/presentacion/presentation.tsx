"use client";

import { Gift, Maximize, Minimize, Sparkles, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useHydrated } from "@/components/use-hydrated";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { PresentationNotice, PresentationScene } from "./stage";
import { usePresentation } from "./use-presentation";
import "./presentation.css";

export function LivePresentation({ previewProtected }: { previewProtected: boolean }) {
  const { snapshot, connection, animate } = usePresentation(previewProtected);
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const [skip, setSkip] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const state = connection === "stale" ? null : snapshot;

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError("Este navegador no pudo abrir la pantalla completa.");
    }
  }

  return <div className="show">
    <header className="show-header">
      <div className="show-brand"><Gift aria-hidden="true" /> {state && state.state !== "waiting" ? state.name : "Amigo Secreto"}</div>
      {state && state.total > 0 && <p className="show-progress">{state.completed} de {state.total} entregas</p>}
    </header>
    <div className="show-status" role="status">
      {state && connection === "retrying" && <span><WifiOff aria-hidden="true" /> Reconectando… Última actualización recibida.</span>}
    </div>
    <div aria-live="polite" aria-atomic="true" className="show-program">
      {state ? <PresentationScene state={state} play={animate && !skip && !reduced} />
        : <PresentationNotice connection={connection === "ready" ? "connecting" : connection} />}
    </div>
    <footer className="show-tools" aria-label="Opciones de presentación">
      {!reduced && <Button variant="secondary" aria-pressed={skip} onClick={() => setSkip(!skip)}>
        <Sparkles aria-hidden="true" size={18} /> Omitir efectos
      </Button>}
      {hydrated && document.fullscreenEnabled && <Button variant="secondary" onClick={toggleFullscreen}>
        {fullscreen ? <Minimize aria-hidden="true" size={18} /> : <Maximize aria-hidden="true" size={18} />}
        {fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      </Button>}
      {fullscreenError && <p role="status">{fullscreenError}</p>}
    </footer>
  </div>;
}
