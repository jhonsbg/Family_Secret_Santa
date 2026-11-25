import { configuredOrigin } from "@/lib/auth/origin";
import Link from "next/link";
import { Card, EnvelopeScene } from "@/components/christmas";
import { CreateGameForm } from "./forms";

export const metadata = { title: "Crear partida · Amigo Secreto" };
export const dynamic = "force-dynamic";

export default function CreateGamePage() {
  const origin = configuredOrigin();
  return <div className="access-layout">
    <section className="hero access-hero">
      <div className="hero-copy"><h1>Prepara el intercambio</h1><p>Elige la fecha y reúne a tu familia para el amigo secreto.</p></div>
      <EnvelopeScene />
    </section>
    <Card className="access-card">
      {origin ? <CreateGameForm origin={origin} /> : <p>La creación de partidas todavía no está configurada en este entorno.</p>}
      <Link href="/acceso/cuenta">Ya tengo acceso a mi partida</Link>
    </Card>
  </div>;
}
