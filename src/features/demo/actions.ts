"use server";

import { cast } from "./fixtures";

// Guion fijo de E1. Estas correspondencias nunca forman parte de los módulos cliente.
const giverByRecipient: Record<string, string> = { vale: "ines", nico: "vale", ines: "lucia", lucia: "nico" };

export async function readDemoEnvelope() {
  return {
    name: cast.find((person) => person.id === "nico")!.name,
    wishes: { gift: "Un rompecabezas o café de especialidad", likes: "Montañas, fotografía y cocina", avoid: "Ropa" },
  };
}

export async function revealDemoTurn(recipientId: string, guess: string) {
  const recipient = cast.find((person) => person.id === recipientId);
  const giver = cast.find((person) => person.id === giverByRecipient[recipientId]);
  if (!recipient || !giver) return null;
  return { recipient: recipient.name, giver: giver.name, guess };
}
