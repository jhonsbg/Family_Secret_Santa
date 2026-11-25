export const wishLimit = 250;
export const wishFields = [
  ["gift", "Qué me gustaría recibir"],
  ["likes", "Cosas que me gustan"],
  ["avoid", "Qué preferiría no recibir"],
] as const;

export type Wishes = Record<(typeof wishFields)[number][0], string>;
export const emptyWishes: Wishes = { gift: "", likes: "", avoid: "" };
