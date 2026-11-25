import { randomBytes } from "node:crypto";

export function randomRank(limit: bigint) {
  if (limit < BigInt(1)) throw new RangeError("Límite aleatorio inválido.");
  if (limit === BigInt(1)) return BigInt(0);
  const bits = (limit - BigInt(1)).toString(2).length;
  const mask = (BigInt(1) << BigInt(bits)) - BigInt(1);
  for (let attempt = 0; attempt < 128; attempt++) {
    const candidate = BigInt("0x" + randomBytes(Math.ceil(bits / 8)).toString("hex")) & mask;
    if (candidate < limit) return candidate;
  }
  throw new Error("No se pudo completar la selección aleatoria.");
}
