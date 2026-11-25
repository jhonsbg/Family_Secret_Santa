import assert from "node:assert/strict";
import { test } from "node:test";
import { isFeasible, sampleDraw, type Pair } from "../src/lib/draw/engine";
import { randomRank } from "../src/lib/draw/random";

const group = (size: number) => Array.from({ length: size }, (_, index) => "p" + index);
const potential = (ids: string[]): Pair[] => ids.flatMap((id, i) => ids.slice(i + 1).map((other): Pair => [id, other]));
const canonical = (a: string, b: string) => [a, b].sort().join(":");
const key = (pairs: readonly Pair[]) => pairs.map(([, recipient]) => recipient).join(",");

function check(ids: string[], rules: Pair[], sample: Pair[] | null) {
  assert.ok(sample);
  assert.equal(sample.length, ids.length);
  assert.equal(new Set(sample.map(([giver]) => giver)).size, ids.length);
  assert.equal(new Set(sample.map(([, recipient]) => recipient)).size, ids.length);
  const denied = new Set(rules.map(([a, b]) => canonical(a, b)));
  assert.ok(sample.every(([a, b]) => a !== b && ids.includes(a) && ids.includes(b) && !denied.has(canonical(a, b))));
}

function brute(ids: string[], rules: Pair[]) {
  const denies = new Set(rules.map(([a, b]) => canonical(a, b)));
  const valid = new Set<string>();
  function visit(prefix: string[], available: string[]) {
    if (prefix.length === ids.length) {
      valid.add(prefix.join(","));
      return;
    }
    const giver = ids[prefix.length];
    for (const next of available) {
      if (giver !== next && !denies.has(canonical(giver, next))) {
        visit([...prefix, next], available.filter((id) => id !== next));
      }
    }
  }
  visit([], ids);
  return valid;
}

test("factibilidad exhaustiva en 3, 4 y 5; cada rango corresponde a exactamente un reparto", () => {
  for (const size of [3, 4, 5]) {
    const ids = group(size);
    const pairs = potential(ids);
    for (let mask = 0; mask < 1 << pairs.length; mask++) {
      const rules = pairs.filter((_, i) => mask & (1 << i));
      const expected = brute(ids, rules);
      assert.equal(isFeasible(ids, rules), expected.size > 0);
      if (!expected.size) {
        assert.equal(sampleDraw(ids, rules, () => { throw new Error("No debía elegir rango."); }), null);
        continue;
      }
      const actual = new Set<string>();
      for (let rank = 0; rank < expected.size; rank++) {
        const result = sampleDraw(ids, rules, (count) => {
          assert.equal(count, BigInt(expected.size));
          return BigInt(rank);
        });
        assert.ok(result);
        actual.add(key(result));
      }
      assert.deepEqual(actual, expected);
    }
  }
});

test("tamaños previstos y restricciones densas sin destinatarios duplicados", (t) => {
  for (const size of [3, 4, 5, 10, 20]) {
    const ids = group(size);
    const started = performance.now();
    check(ids, [], sampleDraw(ids, [], randomRank));
    if (size === 20) t.diagnostic(`20 personas sin restricciones: ${Math.round(performance.now() - started)} ms`);
  }
  const ids = group(20);
  const neighbors = new Set(ids.map((id, i) => canonical(id, ids[(i + 1) % ids.length])));
  const rules = potential(ids).filter(([a, b]) => !neighbors.has(canonical(a, b)));
  const started = performance.now();
  assert.equal(rules.length, 170);
  check(ids, rules, sampleDraw(ids, rules, randomRank));
  t.diagnostic(`20 personas con 170 exclusiones: ${Math.round(performance.now() - started)} ms`);
});

test("muestreo criptográfico sin desviación significativa en un caso de nueve repartos", () => {
  const bins = new Array<number>(9).fill(0);
  for (let i = 0; i < 9000; i++) {
    sampleDraw(group(4), [], (count) => {
      assert.equal(count, BigInt(9));
      const rank = randomRank(count);
      bins[Number(rank)]++;
      return rank;
    });
  }
  const chiSquared = bins.reduce((sum, observed) => sum + (observed - 1000) ** 2 / 1000, 0);
  assert.ok(chiSquared < 45);
});

test("entradas inválidas y límites del motor", () => {
  assert.throws(() => isFeasible(["a", "a", "b"], []));
  assert.throws(() => isFeasible(group(21), []));
  assert.throws(() => isFeasible(group(3), [["p0", "ajeno"]]));
  assert.throws(() => sampleDraw(group(3), [], (count) => count));
});
