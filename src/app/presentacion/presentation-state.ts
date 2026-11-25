import type { Presentation } from "@/lib/reveal/snapshot";

export const pollInterval = 3000;
export const staleAfter = 15000;

export type Scene = {
  kind: "waiting" | "opening" | "turn" | "guess" | "sealed" | "revealed" | "between" | "finished";
  key: string;
};

export function sceneFor(state: Presentation): Scene {
  if (state.state === "waiting") return { kind: "waiting", key: "waiting" };
  if (state.state === "finished") return { kind: "finished", key: "finished" };
  const current = state.current;
  if (current?.result) return { kind: "revealed", key: `revealed-${current.result.order}` };
  if (current) {
    const kind = state.guessing ? current.guessingRecorded ? "sealed" : "guess" : "turn";
    return { kind, key: `${kind}-${state.completed}-${current.recipient}` };
  }
  return state.completed
    ? { kind: "between", key: `between-${state.completed}` }
    : { kind: "opening", key: "opening" };
}

type Playback = {
  snapshot: Presentation | null;
  connection: "connecting" | "ready" | "retrying" | "stale" | "denied";
  lastVerifiedAt: number;
  animate: boolean;
};

type Event =
  | { type: "reset" | "denied" }
  | { type: "received"; snapshot: Presentation; now: number }
  | { type: "failure" | "check"; now: number };

export const initialPlayback: Playback = { snapshot: null, connection: "connecting", lastVerifiedAt: 0, animate: false };

export function updatePlayback(previous: Playback, event: Event): Playback {
  switch (event.type) {
    case "reset":
      return initialPlayback;
    case "denied":
      return { ...initialPlayback, connection: "denied" };
    case "received": {
      const next = event.snapshot;
      if (previous.connection === "denied" || (previous.snapshot && next.revision < previous.snapshot.revision)) return previous;
      const sameRevision = previous.snapshot?.revision === next.revision;
      const expired = previous.connection === "stale"
        || (previous.snapshot && event.now - previous.lastVerifiedAt >= staleAfter);
      return {
        snapshot: sameRevision ? previous.snapshot : next,
        connection: "ready",
        lastVerifiedAt: event.now,
        animate: !expired && Boolean(previous.snapshot && ((!sameRevision && sceneFor(previous.snapshot).key !== sceneFor(next).key) || previous.animate)),
      };
    }
    case "check":
    case "failure": {
      if (previous.connection === "denied") return previous;
      if (previous.snapshot && event.now - previous.lastVerifiedAt >= staleAfter) {
        return previous.connection === "stale" ? previous : { ...previous, connection: "stale", animate: false };
      }
      return event.type === "failure" && previous.connection !== "retrying"
        ? { ...previous, connection: "retrying" } : previous;
    }
  }
}
