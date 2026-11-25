import assert from "node:assert/strict";
import { test } from "node:test";
import { initialPlayback, sceneFor, staleAfter, updatePlayback } from "../src/app/presentacion/presentation-state";
import type { Presentation } from "../src/lib/reveal/snapshot";

const waiting: Presentation = { name: "Partida ficticia", guessing: true, revision: 0, state: "waiting", total: 0, completed: 0, current: null, history: [] };
const opening: Presentation = { ...waiting, revision: 1, state: "running", total: 3 };
const turn: Presentation = { ...opening, revision: 2, current: { recipient: "Nombre ficticio", guessingRecorded: false, result: null } };
const sealed: Presentation = { ...turn, revision: 3, current: { recipient: "Nombre ficticio", guessingRecorded: true, result: null } };
const revealed: Presentation = { ...sealed, revision: 4,
  current: { recipient: "Nombre ficticio", guessingRecorded: true, result: { order: 0, recipient: "Nombre ficticio", giver: "Otra persona ficticia", correct: true } } };
const receive = (previous: typeof initialPlayback, snapshot: Presentation, now: number) => updatePlayback(previous, { type: "received", snapshot, now });

test("distingue las escenas a partir de la revisión y la fase confirmadas", () => {
  const finished: Presentation = { ...opening, state: "finished", revision: 9, completed: 3 };
  assert.deepEqual([waiting, opening, turn, sealed, revealed, { ...opening, completed: 1 }, finished].map((state) => sceneFor(state).kind),
    ["waiting", "opening", "guess", "sealed", "revealed", "between", "finished"]);
  assert.equal(sceneFor({ ...turn, guessing: false }).kind, "turn");
  const paused = { ...revealed, state: "paused" as const, revision: 5 };
  assert.equal(sceneFor(paused).key, sceneFor(revealed).key);
});

test("la primera lectura es estática y los duplicados o retrocesos conservan la escena", () => {
  const reload = receive(initialPlayback, revealed, 100);
  assert.equal(reload.animate, false);
  const started = receive(initialPlayback, sealed, 100);
  const live = receive(started, revealed, 3000);
  assert.equal(live.animate, true);
  assert.equal(receive(live, turn, 4000), live);
  assert.equal(receive(live, { ...turn, revision: live.snapshot!.revision }, 4000).snapshot, live.snapshot);
  assert.equal(receive(reload, { ...revealed, state: "paused", revision: 5 }, 5000).animate, false);
});

test("una conexión prolongada retira la escena y solo la restaura con una comprobación vigente", () => {
  const live = receive(receive(initialPlayback, sealed, 100), revealed, 3000);
  const reconnecting = updatePlayback(live, { type: "failure", now: 4000 });
  assert.equal(reconnecting.connection, "retrying");
  const expired = updatePlayback(reconnecting, { type: "check", now: 3000 + staleAfter });
  assert.equal(expired.connection, "stale");
  assert.equal(receive(expired, turn, 21000).connection, "stale");
  const restored = receive(expired, revealed, 22000);
  assert.equal(restored.connection, "ready");
  assert.equal(restored.animate, false);
  const denied = updatePlayback(restored, { type: "denied" });
  assert.equal(denied.snapshot, null);
  assert.equal(receive(denied, revealed, 24000), denied);
  assert.equal(updatePlayback(denied, { type: "reset" }), initialPlayback);
});
