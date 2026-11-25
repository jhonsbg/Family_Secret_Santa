import { Card } from "./christmas";

export function ServiceUnavailable({ path }: { path: string }) {
  return <Card className="form-stack">
    <h1>No pudimos conectar con la partida</h1>
    <p>Espera un momento y vuelve a consultar el estado antes de repetir una acción.</p>
    <a href={path} className="button button-secondary">Volver a consultar</a>
  </Card>;
}
