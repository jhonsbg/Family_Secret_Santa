export const maxDrawParticipants = 20;
export type Pair = readonly [string, string];

function graph(ids: readonly string[], exclusions: readonly Pair[]) {
  const n = ids.length;
  if (n < 3 || n > maxDrawParticipants || new Set(ids).size !== n) throw new RangeError("Participantes fuera del rango del sorteo.");
  const full = (1 << n) - 1;
  const index = new Map(ids.map((id, position) => [id, position]));
  const allowed = ids.map((_, position) => full ^ (1 << position));
  for (const [a, b] of exclusions) {
    const left = index.get(a);
    const right = index.get(b);
    if (left === undefined || right === undefined || left === right) throw new Error("Exclusión incompatible con el grupo.");
    allowed[left] &= ~(1 << right);
    allowed[right] &= ~(1 << left);
  }
  return { full, allowed };
}

export function isFeasible(ids: readonly string[], exclusions: readonly Pair[]) {
  const { allowed } = graph(ids, exclusions);
  const matched = new Int8Array(ids.length).fill(-1);
  let seen = 0;
  function augment(giver: number): boolean {
    let candidates = allowed[giver] & ~seen;
    while (candidates) {
      const bit = candidates & -candidates;
      candidates ^= bit;
      if (seen & bit) continue;
      seen |= bit;
      const recipient = 31 - Math.clz32(bit);
      if (matched[recipient] === -1 || augment(matched[recipient])) {
        matched[recipient] = giver;
        return true;
      }
    }
    return false;
  }
  return allowed.every((_, giver) => {
    seen = 0;
    return augment(giver);
  });
}

// Each mask represents recipients already used by the corresponding prefix of givers.
export function sampleDraw(ids: readonly string[], exclusions: readonly Pair[], chooseRank: (count: bigint) => bigint) {
  const { full, allowed } = graph(ids, exclusions);
  const popcount = new Uint8Array(full + 1);
  const completions = new BigUint64Array(full + 1);
  for (let mask = 1; mask <= full; mask++) popcount[mask] = popcount[mask >>> 1] + (mask & 1);

  completions[full] = BigInt(1);
  for (let mask = full - 1; mask >= 0; mask--) {
    let candidates = allowed[popcount[mask]] & ~mask;
    let count = BigInt(0);
    while (candidates) {
      const bit = candidates & -candidates;
      candidates ^= bit;
      count += completions[mask | bit];
    }
    completions[mask] = count;
  }
  if (completions[0] === BigInt(0)) return null;
  let rank = chooseRank(completions[0]);
  if (rank < BigInt(0) || rank >= completions[0]) throw new RangeError("Rango aleatorio inválido.");

  let used = 0;
  const pairs: Pair[] = [];
  for (let giver = 0; giver < ids.length; giver++) {
    let candidates = allowed[giver] & ~used;
    while (candidates) {
      const bit = candidates & -candidates;
      candidates ^= bit;
      const count = completions[used | bit];
      if (rank >= count) {
        rank -= count;
        continue;
      }
      pairs.push([ids[giver], ids[31 - Math.clz32(bit)]]);
      used |= bit;
      break;
    }
  }
  if (used !== full) throw new Error("No se obtuvo un reparto completo.");
  return pairs;
}
