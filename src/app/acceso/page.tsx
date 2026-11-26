import { redirect } from "next/navigation";
import { Card } from "@/components/christmas";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { currentGame } from "@/lib/auth/web";
import { LoginForm } from "./access-form";

export const metadata = { title: "Acceso privado · Amigo Secreto", robots: { index: false, follow: false } };

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ pin?: string; partida?: string }> }) {
  const current = await currentGame().catch(() => undefined);
  if (current === undefined) return <ServiceUnavailable path="/acceso" />;
  if (current) redirect("/acceso/cuenta");
  const { pin, partida } = await searchParams;
  const gameId = typeof partida === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(partida) ? partida : undefined;
  return <Card className="access-card">
    <h1>Acceso privado</h1>
    {pin === "actualizado" && <p role="status">PIN actualizado. Entra con tu nombre y el PIN nuevo.</p>}
    <LoginForm gameId={gameId} />
    {gameId && <a className="button button-secondary" href="/acceso">Entrar a otra partida</a>}
    <a className="button button-secondary" href="/acceso/recuperar">Olvidé mi PIN</a>
    <p>Si todavía tienes un PIN de 4 dígitos, actualízalo desde una sesión abierta o recupéralo para elegir uno de 6.</p>
  </Card>;
}
