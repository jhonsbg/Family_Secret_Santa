import { Card } from "@/components/christmas";
import { RecoveryForm } from "./recovery-form";

export const metadata = { title: "Recuperar acceso · Amigo Secreto", robots: { index: false, follow: false } };

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ asistida?: string }> }) {
  const assisted = (await searchParams).asistida === "1";
  return <Card className="form-stack">
    <h1>{assisted ? "Recuperación asistida" : "Recupera tu acceso"}</h1>
    {!assisted && <p>Usa el código que guardaste al activar tu acceso. Si eres participante y también lo perdiste, verifica tu identidad con quien organiza la partida y pídele un enlace temporal.</p>}
    <RecoveryForm assisted={assisted} />
    <a className="button button-secondary" href="/acceso">Volver al acceso</a>
  </Card>;
}
