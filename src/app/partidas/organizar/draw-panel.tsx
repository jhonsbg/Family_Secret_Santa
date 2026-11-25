import { Gift } from "lucide-react";
import { Card, Pill } from "@/components/christmas";
import type { organizerDrawStatus } from "@/lib/draw/service";
import { OperationForm } from "../forms";

type Status = NonNullable<Awaited<ReturnType<typeof organizerDrawStatus>>>;

export function DrawPanel({ status, gameId, origin }: { status: Status; gameId: string; origin: string }) {
  const props = { gameId, origin };
  const names = new Map(status.eligible.map(({ id, name }) => [
    id, status.eligible.filter((person) => person.name === name).length > 1 ? `${name} · ref. ${id.slice(-8)}` : name,
  ]));
  const versionInput = <input type="hidden" name="version" value={status.lastVersion} />;
  function choices(name: string, label: string) {
    return <label>{label}
      <select name={name} required defaultValue="">
        <option value="" disabled>Elige una persona</option>
        {status.eligible.map((person) => <option key={person.id} value={person.id}>{names.get(person.id)}</option>)}
      </select>
    </label>;
  }

  return <Card className="organizer-station form-stack">
    <div className="card-heading"><span className="tile-icon"><Gift size={21} aria-hidden="true" /></span><h2>Sorteo</h2></div>
    <p>{status.eligible.length} participantes elegibles. Las personas confirmadas cuentan aunque todavía no hayan activado su acceso.</p>
    {status.currentVersion !== null && <Pill>Sorteo vigente · versión {status.currentVersion}</Pill>}
    {status.reason && <p className="notice">{status.reason}</p>}
    <h3>Exclusiones bidireccionales</h3>
    {!status.pairs.length && <p>Aún no hay exclusiones entre participantes confirmados.</p>}
    <ul className="person-list">{status.pairs.map(([a, b]) => <li className="person-row" key={a + b}>
      <span>{names.get(a)} y {names.get(b)}</span>
      {status.editable && <OperationForm {...props} operation="draw-allow" label="Quitar exclusión">
        <input type="hidden" name="first" value={a} /><input type="hidden" name="second" value={b} />
      </OperationForm>}
    </li>)}</ul>
    {status.editable && status.eligible.length >= 2 && <OperationForm {...props} operation="draw-exclude" label="Agregar exclusión">
      {choices("first", "Primera persona")}{choices("second", "Segunda persona")}
    </OperationForm>}
    {!status.blocked && <OperationForm {...props} operation="draw-check" label="Comprobar viabilidad" />}
    {status.editable && !status.reason && <OperationForm {...props} operation="draw-run" label="Ejecutar sorteo"
      confirmation="Se guardará el reparto y las exclusiones quedarán bloqueadas mientras el sorteo esté vigente.">{versionInput}</OperationForm>}
    {!status.blocked && status.currentVersion !== null && <>
      {!status.reason && <OperationForm {...props} operation="draw-repeat" label="Repetir sorteo"
        confirmation="Se invalidarán todas las asignaciones anteriores y las personas deberán revisar su nuevo sobre.">{versionInput}</OperationForm>}
      <OperationForm {...props} operation="draw-void" label="Anular para editar exclusiones"
        confirmation="Todas las asignaciones vigentes quedarán invalidadas. Después podrás ajustar las exclusiones y sortear otra vez.">{versionInput}</OperationForm>
    </>}
  </Card>;
}
