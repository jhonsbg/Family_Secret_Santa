import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";

const base = new URL(process.env.E2E_ORIGIN ?? "http://127.0.0.1:3106");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Usa una app local con una base desechable.");
const accountPath = "/acceso/cuenta";
const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
let stage = "inicio";

async function confirm(page, label, container = page) {
  await container.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar", exact: true }).click();
}

async function run() {
  for (const path of ["/partidas", "/partidas/organizar", "/acceso/activar", accountPath, accountPath + "/estado"]) {
    const response = await fetch(new URL(path, base));
    assert.equal(path.endsWith("/estado") ? response.status : response.ok, path.endsWith("/estado") ? 401 : true);
    await response.arrayBuffer();
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const host = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const member = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const secondDevice = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    member.on("pageerror", () => errors.push("participante"));
    secondDevice.on("pageerror", () => errors.push("segunda sesión"));
    stage = "preparar partida y activar acceso";
    await host.goto(new URL("/partidas", base).href);
    await host.getByLabel("Nombre de la partida").fill("[Ficticia] Sobre " + randomBytes(4).toString("hex"));
    await host.getByLabel("Fecha y hora en Bogotá").fill("2027-12-24T19:00");
    await host.getByLabel("Presupuesto sugerido en COP").fill("80000");
    await host.getByLabel("PIN de administración").fill(pin);
    await host.getByLabel("Confirma tu PIN").fill(pin);
    await host.getByRole("button", { name: "Crear mi partida" }).click();
    await host.getByRole("link", { name: "Abrir panel del organizador" }).click();
    const candidates = ["Familiar nácar", "Familiar rubí", "Familiar jade"];
    for (const name of candidates) {
      await host.getByLabel("Nombre para registro manual").fill(name);
      await host.getByRole("button", { name: "Agregar participante", exact: true }).click();
      await host.getByText("Gestionar a " + name, { exact: true }).waitFor();
    }
    const row = host.locator("li").filter({ hasText: candidates[0] });
    await row.getByText("Gestionar a " + candidates[0], { exact: true }).click();
    await confirm(host, "Generar o renovar enlace personal", row);
    await member.goto(await row.getByLabel("Enlace privado").inputValue());
    await member.getByLabel("PIN nuevo", { exact: true }).fill(pin);
    await member.getByLabel("Confirma el PIN nuevo", { exact: true }).fill(pin);
    await member.getByRole("button", { name: "Activar mi acceso" }).click();
    const accessLink = new URL(await member.getByRole("link", { name: "Mi enlace privado" }).getAttribute("href"), base).href;
    await member.getByRole("link", { name: "Continuar a mi acceso" }).click();
    await member.getByText("A la espera del sorteo", { exact: true }).waitFor();
    await member.getByLabel("Qué me gustaría recibir").fill("Libro ilustrado");
    await member.getByRole("button", { name: "Guardar mis deseos" }).click();
    await member.getByText("Tus deseos quedaron guardados.").waitFor();
    assert.equal(new URL(member.url()).search, "");

    stage = "sorteo y privacidad antes de abrir";
    await confirm(host, "Cerrar inscripciones");
    await confirm(host, "Ejecutar sorteo");
    await member.bringToFront();
    await member.getByRole("button", { name: "Abrir mi sobre", exact: true }).waitFor();
    const account = await member.request.get(new URL(accountPath, base).href);
    assert.match(account.headers()["cache-control"], /no-store/);
    const html = await account.text();
    const metadata = await member.request.get(new URL(accountPath + "/estado", base).href);
    assert.match(metadata.headers()["cache-control"], /no-store/);
    const status = await metadata.json();
    assert.equal(status.version, 1);
    assert.equal(status.opened, false);
    assert.doesNotMatch(html, /¡Te tocó regalarle a/);
    assert.equal(await member.locator(".envelope-result").count(), 0);
    assert.deepEqual(Object.keys(status).sort(), ["editable", "opened", "revision", "sessionView", "version", "wishesEnabled"]);
    const roster = member.locator("section").filter({ has: member.getByRole("heading", { name: "Participantes confirmados" }) });
    assert.deepEqual((await roster.getByRole("listitem").allTextContents()).sort(), [...candidates].sort());

    stage = "apertura, omisión, repetición y deseos";
    await member.getByLabel("Omitir animación").check();
    await member.getByRole("button", { name: "Abrir mi sobre", exact: true }).click();
    const result = member.locator(".envelope-result");
    const recipient = result.locator("strong");
    const firstName = await recipient.textContent();
    assert.ok(candidates.slice(1).some((name) => firstName === name + "!"));
    assert.equal(await result.evaluate((node) => getComputedStyle(node).opacity), "1");
    await member.getByRole("button", { name: "Reproducir animación" }).click();
    await member.getByRole("button", { name: "Ver sus deseos" }).click();
    await member.getByText(/Todavía no ha agregado deseos/).waitFor();
    assert.equal(await recipient.textContent(), firstName);
    assert.equal(await member.evaluate(() => document.activeElement?.tagName), "H2");
    for (const width of [320, 390, 1440, 1920]) {
      await member.setViewportSize({ width, height: 900 });
      await member.evaluate(() => document.fonts.ready);
      assert.ok(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }

    stage = "sesión independiente y movimiento reducido";
    await secondDevice.goto(accessLink);
    await secondDevice.getByLabel("PIN personal").fill(pin);
    await secondDevice.getByRole("button", { name: "Entrar", exact: true }).click();
    await secondDevice.getByRole("button", { name: "Consultar mi sobre" }).waitFor();
    assert.equal(await secondDevice.getByLabel("Qué me gustaría recibir").inputValue(), "Libro ilustrado");
    assert.equal(await secondDevice.locator(".envelope-result").count(), 0);
    await secondDevice.getByRole("button", { name: "Consultar mi sobre" }).click();
    assert.equal(await secondDevice.locator(".envelope-result strong").textContent(), firstName);
    assert.equal(await secondDevice.getByRole("button", { name: "Reproducir animación" }).count(), 0);

    stage = "respuesta antigua retenida durante un nuevo sorteo";
    await member.bringToFront();
    await member.reload();
    let captured;
    const started = new Promise((resolve) => { captured = resolve; });
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await member.route("**/acceso/cuenta", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      captured(response.status());
      await held;
      await route.fulfill({ response });
    });
    await member.getByRole("button", { name: "Consultar mi sobre" }).click();
    assert.equal(await Promise.race([started, member.waitForTimeout(12000).then(() => -1)]), 200);
    const obsolete = member.waitForResponse((response) => response.url() === new URL(accountPath, base).href && response.request().method() === "POST");
    try {
      await confirm(host, "Repetir sorteo");
      await member.bringToFront();
      await member.getByText(/Se realizó un nuevo sorteo/).waitFor();
    } finally {
      release();
    }
    assert.equal((await obsolete).status(), 200);
    await member.getByRole("button", { name: "Abrir mi sobre", exact: true }).waitFor();
    assert.equal(await member.locator(".envelope-result").count(), 0);
    await member.unroute("**/acceso/cuenta");
    await member.getByRole("button", { name: "Abrir mi sobre", exact: true }).click();
    await member.locator(".envelope-result strong").waitFor();
    stage = "anulación abierta en otra pestaña";
    await confirm(host, "Anular para editar exclusiones");
    await member.bringToFront();
    await member.getByText("A la espera del sorteo", { exact: true }).waitFor();
    assert.equal(await member.locator(".envelope-result").count(), 0);
    assert.deepEqual(errors, []);
    console.log("Sobre, deseos, sesión independiente, respuesta antigua, movimiento reducido y cuatro anchos verificados.");
  } finally {
    await browser.close();
  }
}

run().catch(() => {
  console.error("Falló la prueba de navegador en la etapa:", stage);
  process.exitCode = 1;
});
