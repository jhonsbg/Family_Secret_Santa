import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const base = new URL(process.env.E2E_ORIGIN ?? "http://127.0.0.1:3108");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Usa un servidor local con una base desechable.");
const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
const web = process.env.E41_WEB_DIR;
let server;
let stage = "inicio";

async function startServer() {
  const database = new URL(process.env.DATABASE_URL_DEV ?? "");
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.pathname, "/Family_Secret_Santa");
  assert.equal(base.protocol, "http:");
  assert.ok(base.port);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", base.hostname, "--port", base.port], {
    cwd: web, stdio: "ignore", env: { ...process.env, DATABASE_URL_AUTH: "", AUTH_ORIGIN: base.origin, NEXT_TELEMETRY_DISABLED: "1" },
  });
  for (let attempt = 0; attempt < 60 && server.exitCode === null; attempt++) {
    try {
      const ready = await fetch(new URL("/presentacion", base), { signal: AbortSignal.timeout(3000) });
      if (ready.ok) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("El servidor local no arrancó.");
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  await exited;
}

async function confirm(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar", exact: true }).click();
}

async function run() {
  if (web) await startServer();
  const config = { executablePath: process.env.CHROMIUM_EXECUTABLE };
  const browser = await chromium.launch(config);
  let screenBrowser;
  try {
    screenBrowser = await chromium.launch(config);
    const organizer = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const television = await screenBrowser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "no-preference" });
    for (const context of [organizer, television]) {
      await context.routeWebSocket("**/_next/webpack-hmr**", () => {});
    }
    let host = await organizer.newPage();
    let display = await television.newPage();
    const event = "[Ficticia] Intercambio " + randomBytes(4).toString("hex");
    const cast = ["Familiar Zafiro", "Familiar Granate", "Familiar Ámbar"];
    const errors = [];
    function watchErrors() {
      host.on("pageerror", () => errors.push("organizador"));
      display.on("pageerror", () => errors.push("presentación"));
    }
    watchErrors();
    await display.clock.install();

    stage = "preparar partida y enlace de presentación";
    await host.goto(new URL("/partidas", base).href);
    await host.getByLabel("Nombre de la partida").fill(event);
    await host.getByLabel("Fecha y hora en Bogotá").fill("2027-12-24T19:00");
    await host.getByLabel("Presupuesto sugerido en COP").fill("80000");
    await host.getByLabel("PIN de administración").fill(pin);
    await host.getByLabel("Confirma tu PIN").fill(pin);
    await host.getByRole("button", { name: "Crear mi partida" }).click();
    const hostLink = await host.getByLabel("Enlace privado", { exact: true }).inputValue();
    await host.getByRole("link", { name: "Abrir panel del organizador" }).click();
    for (const name of cast) {
      await host.getByLabel("Nombre para registro manual").fill(name);
      await host.getByRole("button", { name: "Agregar participante", exact: true }).click();
      await host.getByText("Gestionar a " + name, { exact: true }).waitFor();
    }
    await host.getByRole("button", { name: "Generar enlace de presentación", exact: true }).click();
    const link = await host.getByLabel("Enlace de presentación", { exact: true }).inputValue();
    const api = new URL("/presentacion/estado", base).href;
    const header = { authorization: "Bearer " + new URL(link).hash.slice(1) };
    await display.goto(link);
    await display.getByText(event, { exact: true }).waitFor();
    await display.getByText(/Esperando que el organizador/).waitFor();
    const showFull = display.getByRole("button", { name: "Pantalla completa", exact: true });
    await showFull.focus();
    assert.ok(await showFull.evaluate((element) => element.matches(":focus-visible")));
    await display.keyboard.press("Enter");
    await display.getByRole("button", { name: "Salir de pantalla completa" }).click();
    if (process.env.E42_AXE) {
      await display.addScriptTag({ path: process.env.E42_AXE });
      const violations = await display.evaluate(async () => (await window.axe.run()).violations.map(({ id }) => id));
      assert.deepEqual(violations, []);
    }
    assert.deepEqual(await television.cookies(), []);
    assert.equal((await display.request.get(api)).status(), 401);
    const before = await display.request.get(api, { headers: header });
    assert.match(before.headers()["cache-control"], /no-store/);
    assert.equal((await before.json()).revision, 0);

    stage = "sorteo, apertura y privacidad de turno";
    await confirm(host, "Cerrar inscripciones");
    await confirm(host, "Ejecutar sorteo");
    await confirm(host, "Iniciar intercambio");
    await display.getByRole("heading", { name: "Que empiece el intercambio" }).waitFor();
    await host.getByRole("button", { name: "Iniciar siguiente turno" }).click();
    await display.getByRole("heading", { name: /^Familiar / }).waitFor();
    const recipient = await display.getByRole("heading", { name: /^Familiar / }).textContent();
    const hidden = await (await display.request.get(api, { headers: header })).json();
    assert.deepEqual(hidden.current, { recipient, guessingRecorded: false, result: null });
    assert.deepEqual(hidden.history, []);
    assert.ok(cast.filter((name) => name !== recipient).every((name) => !JSON.stringify(hidden).includes(name)));
    assert.equal(await host.getByRole("button", { name: "Revelar identidad" }).isDisabled(), true);
    assert.equal(await host.getByRole("button", { name: "Repetir sorteo" }).count(), 0);

    stage = "aviso con el televisor desconectado";
    await television.setOffline(true);
    await host.getByRole("button", { name: "Pausar intercambio" }).click();
    await display.bringToFront();
    await display.getByText(/Reconectando/).waitFor();
    await display.clock.fastForward(16000);
    await display.getByRole("heading", { name: "Presentación en espera" }).waitFor();
    assert.equal(await display.getByRole("heading", { name: recipient, exact: true }).count(), 0);
    stage = "sincronizar la pausa al reconectar";
    await television.setOffline(false);
    await display.getByText("Intercambio en pausa", { exact: true }).waitFor();
    stage = "abrir ambas vistas sin estado de la página anterior";
    await Promise.all([host.close(), display.close()]);
    host = await organizer.newPage();
    display = await television.newPage();
    watchErrors();
    await host.goto(new URL("/partidas/organizar", base).href);
    await display.goto(link);
    await display.getByText("Intercambio en pausa", { exact: true }).waitFor();
    if (web) {
      stage = "reiniciar el servidor local";
      await Promise.all([host.close(), display.close()]);
      await stopServer();
      await startServer();
      host = await organizer.newPage();
      display = await television.newPage();
      watchErrors();
      stage = "volver a conectar al servidor reiniciado";
      await host.goto(new URL("/partidas/organizar", base).href);
      await display.goto(link);
    }
    await display.bringToFront();
    stage = "leer el turno recuperado";
    await display.getByText("Intercambio en pausa", { exact: true }).waitFor();
    assert.equal(await display.getByRole("heading", { name: /^Familiar / }).textContent(), recipient);
    stage = "restaurar el panel en otro contexto autenticado";
    const nextOrganizer = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await nextOrganizer.routeWebSocket("**/_next/webpack-hmr**", () => {});
    const signIn = await nextOrganizer.newPage();
    await signIn.bringToFront();
    await signIn.goto(hostLink);
    await signIn.getByLabel("PIN personal").fill(pin);
    await signIn.getByRole("button", { name: "Entrar", exact: true }).click();
    await signIn.getByRole("link", { name: "Gestionar mi partida" }).waitFor();
    const otherHost = await nextOrganizer.newPage();
    stage = "obtener el panel pausado con la sesión nueva";
    const restored = await otherHost.goto(new URL("/partidas/organizar", base).href);
    assert.ok(restored?.ok());
    const rendered = await restored.text();
    assert.ok(rendered.includes("Reanudar intercambio") && rendered.includes(recipient));
    await Promise.all([organizer.close(), signIn.close()]);
    host = otherHost;
    await host.bringToFront();
    stage = "reanudar desde la nueva sesión del organizador";
    await host.getByRole("button", { name: "Reanudar intercambio" }).click();
    stage = "posponer el turno actual";
    await host.getByRole("button", { name: "Posponer turno" }).click();
    stage = "retomar el turno pospuesto";
    await host.getByRole("button", { name: "Retomar a " + recipient }).click();
    await display.bringToFront();
    await display.getByRole("heading", { name: recipient }).waitFor();

    stage = "revelación confirmada y lectura antigua";
    await host.getByRole("button", { name: "Continuar sin adivinanza" }).click();
    await display.getByText(/Tu regalo está listo. Esperando la revelación/).waitFor();
    assert.equal(await display.locator(".reveal-result").count(), 0);
    await confirm(host, "Revelar identidad");
    await display.bringToFront();
    await display.locator(".reveal-result strong").waitFor();
    const firstResult = await display.locator(".reveal-result strong").textContent();
    assert.ok(cast.includes(firstResult) && firstResult !== recipient);
    const animatedScene = display.locator('[data-scene="revealed"] [data-entry="animated"]');
    assert.equal(await animatedScene.count(), 1);
    await animatedScene.evaluate((element) => { element.dataset.testMoment = "original"; });
    const liveResult = await (await display.request.get(api, { headers: header })).json();
    const reloaded = await television.newPage();
    await reloaded.goto(link);
    await reloaded.locator('[data-scene="revealed"] [data-entry="static"] .reveal-result strong').waitFor();
    assert.equal(await reloaded.locator(".show-particles").count(), 0);
    await reloaded.close();
    await display.bringToFront();
    await display.route("**/presentacion/estado", (route) => route.fulfill({ json: liveResult }));
    await display.waitForResponse((response) => response.url() === api);
    assert.equal(await animatedScene.getAttribute("data-test-moment"), "original");
    await display.unroute("**/presentacion/estado");
    await display.route("**/presentacion/estado", (route) => route.fulfill({ json: hidden }));
    const old = await display.waitForResponse((response) => response.url() === api);
    assert.equal((await old.json()).revision, hidden.revision);
    assert.equal(await display.locator(".reveal-result strong").textContent(), firstResult);
    assert.equal(await animatedScene.getAttribute("data-test-moment"), "original");
    await display.unroute("**/presentacion/estado");
    const effects = display.getByRole("button", { name: "Omitir efectos" });
    await effects.click();
    assert.equal(await display.locator(".show-particles").count(), 0);
    await effects.click();
    assert.equal(await display.locator(".show-particles").count(), 0);
    await host.getByRole("button", { name: "Marcar entrega completada" }).click();
    await display.getByText("Última entrega · " + firstResult + " le regaló a " + recipient, { exact: true }).waitFor();

    stage = "resumen, tamaño y revocación";
    const thirdPerson = cast.find((name) => name !== recipient && name !== firstResult);
    const expectedGivers = new Map([[firstResult, thirdPerson], [thirdPerson, recipient]]);
    for (let index = 0; index < 2; index++) {
      if (index === 1) await display.emulateMedia({ reducedMotion: "reduce" });
      await host.getByRole("button", { name: "Iniciar siguiente turno" }).click();
      await host.getByRole("heading", { name: /^Recibe / }).waitFor();
      const next = await (await display.request.get(api, { headers: header })).json();
      assert.ok(next.current && next.current.result === null);
      await display.getByRole("heading", { name: next.current.recipient, exact: true }).waitFor();
      const choice = index === 0 ? expectedGivers.get(next.current.recipient)
        : cast.find((name) => name !== next.current.recipient && name !== expectedGivers.get(next.current.recipient));
      await host.getByLabel("¿Quién crees que preparó el regalo?").selectOption({ label: choice });
      await host.getByRole("button", { name: "Registrar adivinanza" }).click();
      await confirm(host, "Revelar identidad");
      await display.getByText(index === 0 ? "¡Adivinaste!" : "¡Qué sorpresa! Esta vez la respuesta fue otra.", { exact: true }).waitFor();
      if (index === 1) assert.equal(await display.locator(".show-particles").count(), 0);
      await host.getByRole("button", { name: "Marcar entrega completada" }).click();
    }
    await display.emulateMedia({ reducedMotion: "no-preference" });
    await confirm(host, "Finalizar intercambio");
    await display.bringToFront();
    await display.getByRole("heading", { name: "¡Feliz Navidad!" }).waitFor();
    assert.equal(await display.locator(".result-list li").count(), 3);
    assert.equal(await host.getByRole("button", { name: "Revelar identidad" }).count(), 0);
    for (const width of [320, 390, 1440, 1920, 3840]) {
      await display.setViewportSize({ width, height: width >= 1440 ? width * 9 / 16 : 844 });
      assert.ok(await display.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await display.evaluate(() => { document.documentElement.style.zoom = "2"; });
    assert.ok(await display.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await display.evaluate(() => { document.documentElement.style.zoom = ""; });
    assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await confirm(host, "Revocar enlace de presentación");
    await display.bringToFront();
    await display.getByText(/El enlace ya no está disponible/).waitFor();
    assert.equal(await display.locator(".result-list li").count(), 0);
    assert.deepEqual(errors, []);
    console.log("Chromium verificó el intercambio completo con contextos independientes, reconexión, recarga estática, efectos únicos, revocación y cinco anchos.");
    if (web) console.log("El intercambio en curso sobrevivió a un reinicio real de Next.js.");
  } finally {
    await Promise.all([browser.close(), screenBrowser?.close()]);
  }
}

try {
  await run();
} catch (error) {
  const detail = String(error).split("\n")[0].replace(/[A-Za-z0-9_-]{43}/g, "[credencial]").replace(/\b\d{6}\b/g, "[PIN]");
  console.error("Falló la prueba de navegador en la etapa:", stage, detail);
  process.exitCode = 1;
} finally {
  await stopServer();
}
