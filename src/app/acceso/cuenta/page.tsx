import { redirect } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { Card } from "@/components/christmas";
import { formatBudget, formatEvent } from "@/lib/registration/display";
import { participantHome } from "@/lib/participant/service";
import { ParticipantExperience } from "./participant-experience";
import { authDatabase, currentGame, sessionToken } from "@/lib/auth/web";
import { ReplaceRecoveryCodeForm } from "../recuperar/recovery-form";
import { ChangePinForm, SignOutForm } from "../access-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi acceso · Amigo Secreto", robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ salida?: string }> }) {
  const access = await currentGame().catch(() => {
    console.warn("account_state_unavailable");
    return undefined;
  });
  if (access === undefined) return <ServiceUnavailable path="/acceso/cuenta" />;
  if (!access) redirect("/acceso");
  const home = access.participantId && access.status === "confirmed"
    ? await participantHome(authDatabase(), await sessionToken()).catch(() => null)
    : null;
  const budget = formatBudget(access.budgetMin, access.budgetMax);
  const { salida } = await searchParams;
  return <div className="form-stack">
    <Card>
      <h1>{access.participantName ? `Hola, ${access.participantName}` : "Mi acceso"}</h1>
      <p>{access.gameName} · {access.organizer ? "Organizador" : access.status === "pending" ? "Solicitud pendiente" : access.status === "rejected" ? "Solicitud rechazada" : "Participante confirmado"}</p>
      {(access.organizer || access.status === "confirmed") && <p>{formatEvent(access.eventAt, access.timezone)} · {budget}</p>}
      {access.status === "pending" && <p>El organizador aún debe aprobar tu solicitud. Vuelve a esta página para consultar el estado.</p>}
      {access.status === "rejected" && <p>La solicitud no fue aprobada. Puedes consultar al organizador si necesitas más información.</p>}
      {access.organizer && <a className="button button-secondary" href="/partidas/organizar">Gestionar mi partida</a>}
      {access.session.temporary && <p>Dispositivo prestado. Cierra tu sesión cuando termines.</p>}
      {salida === "pendiente" && <p role="alert">No pudimos cerrar la sesión. Intenta de nuevo antes de devolver el dispositivo.</p>}
      <SignOutForm />
    </Card>
    {home?.ok && <ParticipantExperience key={home.status.sessionView} initialStatus={home.status} wishes={home.wishes} budget={budget} />}
    {!home?.ok && access.status === "confirmed" && <p role="status">No pudimos cargar tu sobre y tus deseos. Intenta actualizar la página.</p>}
    {(access.organizer || access.status === "confirmed") && <Card><h2>Cambiar mi PIN</h2><ChangePinForm /></Card>}
    <Card><h2>Código de recuperación</h2><ReplaceRecoveryCodeForm /></Card>
  </div>;
}
