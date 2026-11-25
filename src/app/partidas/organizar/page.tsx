import { configuredOrigin } from "@/lib/auth/origin";
import { redirect } from "next/navigation";
import { Settings2, Users } from "lucide-react";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { Card, Pill } from "@/components/christmas";
import { authDatabase, currentGame, sessionToken } from "@/lib/auth/web";
import { organizerPanel } from "@/lib/registration/service";
import { formatBudget, formatEvent } from "@/lib/registration/display";
import { organizerReveal } from "@/lib/reveal/snapshot";
import { RevealPanel } from "./reveal-panel";
import { DrawPanel } from "./draw-panel";
import { organizerDrawStatus } from "@/lib/draw/service";
import { OperationForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizar partida · Amigo Secreto", robots: { index: false, follow: false } };

const labels = { pending: "Pendiente", confirmed: "Confirmado", rejected: "Rechazado", withdrawn: "Retirado" };

async function loadOrganizer() {
  try {
    const access = await currentGame();
    if (!access) return { kind: "signed-out" } as const;
    if (!access.organizer) return { kind: "participant" } as const;
    const origin = configuredOrigin();
    if (!origin) return { kind: "unavailable" } as const;
    const db = authDatabase();
    const token = await sessionToken();
    const panel = await organizerPanel(db, token, access.gameId);
    const drawStatus = await organizerDrawStatus(db, token, access.gameId);
    const reveal = await organizerReveal(db, token, access.gameId);
    return panel && drawStatus && reveal ? { kind: "ready", panel, drawStatus, reveal, origin } as const
      : { kind: "signed-out" } as const;
  } catch {
    console.warn("organizer_state_unavailable");
    return { kind: "unavailable" } as const;
  }
}

export default async function OrganizerPage() {
  const loaded = await loadOrganizer();
  if (loaded.kind === "signed-out") redirect("/acceso");
  if (loaded.kind === "participant") redirect("/acceso/cuenta");
  if (loaded.kind === "unavailable") return <ServiceUnavailable path="/partidas/organizar" />;
  const { panel, drawStatus, origin, reveal } = loaded;
  const { game, people, general } = panel;
  const open = game.state === "registrations_open";
  const editable = open || game.state === "registrations_closed";
  const confirmed = people.filter((person) => person.status === "confirmed");
  const pending = people.filter((person) => person.status === "pending");
  const archived = people.filter((person) => person.status === "rejected" || person.status === "withdrawn");
  const props = { gameId: game.id, origin };

  function section(title: string, list: typeof people) {
    return <section className="form-stack">
      <h3>{title} · {list.length}</h3>
      {!list.length && <p>Aún no hay personas en esta lista.</p>}
      <ul className="person-list">{list.map((person) => {
        const label = people.filter(({ displayName }) => displayName === person.displayName).length > 1
          ? `${person.displayName} · ref. ${person.id.slice(-8)}` : person.displayName;
        const personProps = { ...props, personId: person.id };
        const active = person.status === "confirmed" || person.status === "pending";
        return <li className="person-row" key={person.id}>
          <div className="person-name">
            <span className="avatar" aria-hidden="true">{person.displayName.slice(0, 1)}</span>
            <div><strong>{label}</strong><p className="person-status">{labels[person.status]} · {person.activatedAt ? "Acceso activado" : "Sin activar"}</p></div>
          </div>
          {active && (editable || person.activatedAt) && <details className="registration-details">
            <summary>Gestionar a {label}</summary>
            <div className="form-stack">
              {editable && <><OperationForm {...personProps} operation="rename" label="Guardar nombre">
                <label>Nombre de {person.displayName}<input name="name" defaultValue={person.displayName} required maxLength={60} /></label>
              </OperationForm>
              {person.status === "pending" ? <>
                <OperationForm {...personProps} operation="approve" label="Aprobar solicitud" confirmation="La persona quedará confirmada para la partida." />
                <OperationForm {...personProps} operation="reject" label="Rechazar solicitud" confirmation="La persona podrá consultar la decisión. Su acceso a la partida seguirá restringido." />
              </> : person.source !== "organizer" && <OperationForm {...personProps} operation="withdraw" label="Retirar participante" confirmation="La persona dejará de participar y su acceso se revocará." />}
              {person.status === "confirmed" && !person.activatedAt && person.source !== "organizer" &&
                <OperationForm {...personProps} operation="invite" label="Generar o renovar enlace personal" confirmation="El enlace anterior dejará de funcionar. Entrega el nuevo enlace solo a esta persona." />}
              </>}
              {person.activatedAt && person.source !== "organizer" &&
                <OperationForm {...personProps} operation="recovery" label="Generar enlace de recuperación"
                  confirmation="Entrégalo en privado. Quien obtenga el enlace puede restablecer ese acceso durante 15 minutos.">
                  <label className="check"><input name="verified" type="checkbox" required /> Verifiqué en persona la identidad de este familiar</label>
                </OperationForm>}
            </div>
          </details>}
        </li>;
      })}</ul>
    </section>;
  }

  return <div className="form-stack">
    <section className="organizer-hero festive-header">
      <div className="organizer-heading">
        <p className="hero-kicker"><Settings2 aria-hidden="true" size={17} /> Organizador</p>
        <h1>{game.name}</h1>
        <p>{formatEvent(game.eventAt, game.timezone)} · {formatBudget(game.budgetMin, game.budgetMax)}</p>
        <Pill>{open ? "Inscripciones abiertas" : "Inscripciones cerradas"}</Pill>
      </div>
      <a href="/acceso/cuenta" className="button button-secondary">Mi acceso</a>
    </section>
    <RevealPanel {...props} timezone={game.timezone} state={reveal} drawVersion={drawStatus.currentVersion} />
    <DrawPanel {...props} status={drawStatus} />
    <div className="admin-grid">
      <Card className="organizer-station form-stack">
        <div className="card-heading"><span className="tile-icon"><Users aria-hidden="true" size={21} /></span><h2>Participantes · {confirmed.length + pending.length}</h2></div>
        {section("Confirmados", confirmed)}
        {section("Solicitudes pendientes", pending)}
        {!!archived.length && section("Historial", archived)}
      </Card>
      <div className="form-stack">
        <Card className="organizer-station form-stack">
          <h2>Invitación general</h2>
          <p>Comparte el evento con tu familia. Generar un enlace nuevo desactiva el anterior.</p>
          {general && <Pill>Vigente hasta el {formatEvent(general.expiresAt, game.timezone)}</Pill>}
          {editable && <OperationForm {...props} operation="general" label="Generar enlace general" confirmation="Si ya compartiste un enlace general, tendrás que compartir el nuevo." />}
        </Card>
        <Card className="organizer-station form-stack">
          <h2>Inscripciones</h2>
          {open && <OperationForm {...props} operation="add" label="Agregar participante">
            <label>Nombre para registro manual<input name="name" required maxLength={60} /></label>
            <p>El participante quedará confirmado aunque aún no active su acceso.</p>
          </OperationForm>}
          {editable && <OperationForm key={game.state} {...props} operation={open ? "close" : "reopen"}
            label={open ? "Cerrar inscripciones" : "Reabrir inscripciones"} confirmation={open
              ? "Se detendrán las nuevas inscripciones. Las solicitudes pendientes se podrán resolver."
              : "El enlace general vigente volverá a aceptar solicitudes."} />}
        </Card>
      </div>
    </div>
  </div>;
}
