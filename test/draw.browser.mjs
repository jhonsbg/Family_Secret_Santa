import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";

const base = new URL(process.env.E2E_ORIGIN ?? "http://127.0.0.1:3105");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Usa una app local con una base desechable.");
const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
let stage = "inicio";

async function confirm(page, label, container = page) {
  await container.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar", exact: true }).click();
}

async function run() {
  for (const path of ["/partidas", "/partidas/organizar", "/acceso/activar", "/acceso/cuenta"]) {
    const response = await fetch(new URL(path, base));
    assert.ok(response.ok);
    await response.arrayBuffer();
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const host = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const member = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    stage = "crear partida y activar un familiar";
    await host.goto(new URL("/partidas", base).href);
    await host.getByLabel("Nombre de la partida").fill("[Ficticia] Sorteo " + randomBytes(4).toString("hex"));
    await host.getByLabel("Fecha y hora en Bogotá").fill("2027-12-24T19:00");
    await host.getByLabel("Presupuesto sugerido en COP").fill("80000");
    await host.getByLabel("También quiero participar").check();
    await host.getByLabel("Tu nombre", { exact: true }).fill("Organizador de prueba");
    await host.getByLabel("PIN de administración").fill(pin);
    await host.getByLabel("Confirma tu PIN").fill(pin);
    await host.getByRole("button", { name: "Crear mi partida" }).click();
    await host.getByRole("link", { name: "Abrir panel del organizador" }).click();
    for (const name of ["Familiar primero", "Familiar segundo", "Familiar tercero"]) {
      await host.getByLabel("Nombre para registro manual").fill(name);
      await host.getByRole("button", { name: "Agregar participante", exact: true }).click();
      await host.getByText("Gestionar a " + name, { exact: true }).waitFor();
    }

    const row = host.locator("li").filter({ hasText: "Familiar primero" });
    await row.getByText("Gestionar a Familiar primero", { exact: true }).click();
    await confirm(host, "Generar o renovar enlace personal", row);
    await member.goto(await row.getByLabel("Enlace privado").inputValue());
    await member.getByLabel("PIN nuevo", { exact: true }).fill(pin);
    await member.getByLabel("Confirma el PIN nuevo", { exact: true }).fill(pin);
    await member.getByRole("button", { name: "Activar mi acceso" }).click();
    await member.getByRole("link", { name: "Continuar a mi acceso" }).click();
    await member.getByText(/Participante confirmado/).waitFor();

    stage = "exclusión, cierre, viabilidad y sorteo";
    await host.getByLabel("Primera persona").selectOption({ label: "Familiar primero" });
    await host.getByLabel("Segunda persona").selectOption({ label: "Familiar segundo" });
    await host.getByRole("button", { name: "Agregar exclusión", exact: true }).click();
    await host.getByRole("button", { name: "Quitar exclusión", exact: true }).waitFor();
    await confirm(host, "Cerrar inscripciones");
    await host.getByRole("button", { name: "Comprobar viabilidad", exact: true }).click();
    await host.getByText("Hay un reparto completo que respeta las exclusiones.").waitFor();
    await confirm(host, "Ejecutar sorteo");
    await host.getByText("Sorteo vigente · versión 1", { exact: true }).waitFor();

    stage = "repetir, aviso privado y anulación";
    await confirm(host, "Repetir sorteo");
    await host.getByText("Sorteo vigente · versión 2", { exact: true }).waitFor();
    await member.reload();
    await member.getByText(/Se realizó un nuevo sorteo/).waitFor();
    assert.equal(await member.locator(".envelope-result").count(), 0);
    const status = await member.request.get(new URL("/acceso/cuenta/estado", base).href);
    assert.ok(status.ok());
    assert.deepEqual(Object.keys(await status.json()).sort(), ["editable", "opened", "revision", "sessionView", "version", "wishesEnabled"]);
    await confirm(host, "Anular para editar exclusiones");
    await host.getByRole("button", { name: "Quitar exclusión", exact: true }).waitFor();
    await host.getByRole("button", { name: "Quitar exclusión", exact: true }).click();
    await host.getByText("Aún no hay exclusiones entre participantes confirmados.").waitFor();
    await host.setViewportSize({ width: 320, height: 760 });
    assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log("Sorteo, repetición, aviso y anulación verificados en Chromium.");
  } finally {
    await browser.close();
  }
}

run().catch(() => {
  console.error("Falló la prueba de navegador en la etapa:", stage);
  process.exitCode = 1;
});
