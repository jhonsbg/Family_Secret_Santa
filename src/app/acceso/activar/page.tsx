import { Card } from "@/components/christmas";
import { ActivationForm } from "../access-form";

export const metadata = { title: "Activar acceso · Amigo Secreto", robots: { index: false, follow: false } };

export default function ActivationPage() {
  return <Card className="access-card">
    <h1>Activa tu acceso</h1>
    <ActivationForm />
  </Card>;
}
