export type Person = { id: string; name: string; status: "Activo" | "Sin activar" | "Pendiente" };
export type Wishes = { gift: string; likes: string; avoid: string };
export type Result = { recipient: string; giver: string; guess: string };
export type Phase = "Abiertas" | "Cerradas" | "Sorteado" | "En revelación" | "Finalizado";

export const cast: Person[] = [
  { id: "vale", name: "Valentina Reyes", status: "Activo" },
  { id: "nico", name: "Nicolás Reyes", status: "Activo" },
  { id: "ines", name: "Inés Mora", status: "Sin activar" },
  { id: "lucia", name: "Lucía Mora", status: "Activo" },
];

export const initialSettings = {
  title: "Navidad de los Reyes",
  date: "2026-12-24T19:00",
  budget: 80000,
  organizerPlays: false,
  wishes: true,
  guessing: true,
};

export const initialWishes: Wishes = { gift: "Una novela o una libreta bonita", likes: "Café, lectura y plantas", avoid: "" };

export function eventDate(date: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(date + "-05:00"));
}

export function eventBudget(budget: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(budget) + " COP";
}
