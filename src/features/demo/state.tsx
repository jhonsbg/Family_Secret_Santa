"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cast, initialSettings, initialWishes, type Person, type Phase, type Result } from "./fixtures";

function useDemoState() {
  const [settings, setSettings] = useState(initialSettings);
  const [people, setPeople] = useState<Person[]>([...cast, { id: "eva", name: "Eva Reyes", status: "Pendiente" }]);
  const [phase, setPhase] = useState<Phase>("Abiertas");
  const [requestId, setRequestId] = useState("");
  const [access, setAccess] = useState<"regular" | "temporal" | null>(null);
  const [wishes, setWishes] = useState(initialWishes);
  const [envelopeOpened, setEnvelopeOpened] = useState(false);
  const [version, setVersion] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const [animateReveal, setAnimateReveal] = useState(true);
  const [paused, setPaused] = useState(false);
  const [guess, setGuess] = useState("");
  const [current, setCurrent] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return {
    settings, setSettings, people, setPeople, phase, setPhase, requestId, setRequestId, access, setAccess,
    wishes, setWishes, envelopeOpened, setEnvelopeOpened, version, setVersion, queue, setQueue, animateReveal, setAnimateReveal, paused, setPaused,
    guess, setGuess, current, setCurrent, history, setHistory, busy, setBusy, error, setError,
  };
}

const DemoContext = createContext<ReturnType<typeof useDemoState> | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const demo = useDemoState();
  return <DemoContext.Provider value={demo}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoProvider es obligatorio");
  return value;
}
