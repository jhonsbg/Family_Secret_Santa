"use client";

import { useEffect, useReducer } from "react";
import { initialPlayback, pollInterval, updatePlayback } from "./presentation-state";

export function usePresentation(previewProtected: boolean) {
  const [playback, dispatch] = useReducer(updatePlayback, initialPlayback);

  useEffect(() => {
    let controller: AbortController | null = null;
    let denied = false;
    let mounted = true;
    const check = () => dispatch({ type: "check", now: performance.now() });
    const failure = () => dispatch({ type: "failure", now: performance.now() });

    async function poll() {
      check();
      if (controller || denied || document.hidden) return;
      const token = window.location.hash.slice(1);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        denied = true;
        dispatch({ type: "denied" });
        return;
      }
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 8000);
      const isCurrent = () => mounted && controller === request && window.location.hash === "#" + token;
      try {
        const response = await fetch("/presentacion/estado", {
          headers: { authorization: "Bearer " + token },
          // Preview needs the same-origin Vercel protection cookie. The route authorizes only its bearer.
          credentials: previewProtected ? "same-origin" : "omit", cache: "no-store", signal: request.signal,
        });
        if (response.status === 401) {
          if (!isCurrent()) return;
          denied = true;
          dispatch({ type: "denied" });
          return;
        }
        if (!response.ok) throw new Error();
        const snapshot = await response.json();
        if (isCurrent()) dispatch({ type: "received", snapshot, now: performance.now() });
      } catch {
        if (isCurrent()) failure();
      } finally {
        window.clearTimeout(timeout);
        if (controller === request) controller = null;
      }
    }

    function switchLink() {
      controller?.abort();
      controller = null;
      denied = false;
      dispatch({ type: "reset" });
      void poll();
    }

    void poll();
    const timer = window.setInterval(poll, pollInterval);
    const deadline = window.setInterval(check, 1000);
    window.addEventListener("hashchange", switchLink);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    window.addEventListener("offline", failure);
    window.addEventListener("pageshow", poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      mounted = false;
      controller?.abort();
      window.clearInterval(timer);
      window.clearInterval(deadline);
      window.removeEventListener("hashchange", switchLink);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
      window.removeEventListener("offline", failure);
      window.removeEventListener("pageshow", poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [previewProtected]);

  return playback;
}
