import { Card } from "@/components/christmas";
import { AccessForm } from "./access-form";

export const metadata = { title: "Acceso privado · Amigo Secreto", robots: { index: false, follow: false } };

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ pin?: string }> }) {
  const { pin } = await searchParams;
  return <Card className="access-card">
    <h1>Acceso privado</h1>
    {pin === "actualizado" && <p role="status">PIN actualizado. Abre tu enlace privado para volver a entrar.</p>}
    <AccessForm />
    <a className="button button-secondary" href="/acceso/recuperar">Olvidé mi PIN o perdí mi enlace</a>
  </Card>;
}
