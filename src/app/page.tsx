import { CalendarDays, Gift, Sparkles } from "lucide-react";
import Link from "next/link";
import { EnvelopeScene } from "@/components/christmas";

export default function HomePage() {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="hero-kicker"><Sparkles size={17} aria-hidden="true" /> Amigo Secreto</p>
        <h1>Una Navidad llena de <em>secretos</em></h1>
        <p>Reúne a tu familia, prepara el sorteo y descubran juntos quién eligió cada regalo.</p>
        <div className="actions">
          <Link className="button button-primary" href="/partidas">Crear una partida</Link>
          <Link className="button button-secondary" href="/acceso/cuenta">Entrar a mi partida</Link>
        </div>
      </div>
      <EnvelopeScene />
    </section>
    <section className="event-strip" aria-label="Cómo funciona">
      <div><CalendarDays aria-hidden="true" /><span><strong>Organiza el encuentro</strong>Define la fecha y el presupuesto. Comparte la invitación por WhatsApp.</span></div>
      <div><Gift aria-hidden="true" /><span><strong>Abre tu sobre</strong>Después del sorteo, verás en privado a quién le regalas.</span></div>
      <div><Sparkles aria-hidden="true" /><span><strong>Revela los regalos</strong>Guía el intercambio desde tu celular y comparte la presentación en el televisor.</span></div>
    </section>
    <p>Si ya te invitaron, abre el enlace que te enviaron. Si olvidaste tu PIN, puedes <Link className="text-link" href="/acceso/recuperar">recuperar tu acceso</Link>.</p>
  </>;
}
