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
    const cast = ["Familiar Zafiro", "Familiar Granate", "Familiar Ámbar", "Familiar Esmeralda"];
    const wishes = new Map(cast.map((name, index) => [name, `Libro de prueba ${index + 1}`]));
    const errors = [];
    function watchErrors() {
      host.on("pageerror", () => errors.push("organizador"));
      display.on("pageerror", () => errors.push("presentación"));
    }
    watchErrors();
    await display.clock.install();

    stage = "preparar partida y enlace de presentación";
    await host.goto(base.href);
    await host.getByRole("heading", { name: "Una Navidad llena de secretos" }).waitFor();
    assert.doesNotMatch(await host.locator("body").innerText(), /Datos ficticios|Ver demo|Valentina Reyes/i);
    for (const width of [320, 390, 1440]) {
      await host.setViewportSize({ width, height: 844 });
      assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await host.setViewportSize({ width: 390, height: 844 });
    await host.getByRole("link", { name: "Crear una partida", exact: true }).click();
    await host.getByLabel("Nombre de la partida").fill(event);
    await host.getByLabel("Fecha y hora en Bogotá").fill("2027-12-24T19:00");
    await host.getByLabel("Presupuesto sugerido en COP").fill("80000");
    await host.getByLabel("PIN de administración").fill(pin);
    await host.getByLabel("Confirma tu PIN").fill(pin);
    await host.getByRole("button", { name: "Crear mi partida" }).click();
    const hostLink = await host.getByLabel("Enlace privado", { exact: true }).inputValue();
    await host.getByRole("link", { name: "Abrir panel del organizador" }).click();
    stage = "editar presupuesto, inscribir y activar";
    await host.getByLabel("Presupuesto sugerido en COP").fill("90000");
    await host.getByRole("button", { name: "Guardar configuración" }).click();
    await host.getByText(/90[.\s]?000 COP/).waitFor();
    await host.reload();
    assert.equal(await host.getByLabel("Presupuesto sugerido en COP").inputValue(), "90000");
    await confirm(host, "Generar enlace general");
    const general = await host.getByLabel("Enlace general", { exact: true }).inputValue();
    const privateLinks = new Map();
    for (const [index, name] of cast.entries()) {
      stage = "inscribir y activar participante " + (index + 1);
      const row = host.locator(".person-row").filter({ hasText: name });
      const member = await browser.newPage({ reducedMotion: "reduce" });
      await member.routeWebSocket("**/_next/webpack-hmr**", () => {});
      if (index < 2) {
        await member.goto(general);
        await member.getByLabel("Tu nombre").fill(name);
        await member.getByRole("button", { name: "Solicitar inscripción" }).click();
        await member.getByRole("link", { name: "Activar mi acceso individual" }).click();
      } else {
        await host.getByLabel("Nombre para registro manual").fill(name);
        await host.getByRole("button", { name: "Agregar participante", exact: true }).click();
        await host.getByText("Gestionar a " + name, { exact: true }).click();
        await confirm(host, "Generar o renovar enlace personal");
        await member.goto(await row.getByLabel("Enlace privado", { exact: true }).inputValue());
      }
      await member.getByLabel("PIN nuevo", { exact: true }).fill(pin);
      await member.getByLabel("Confirma el PIN nuevo", { exact: true }).fill(pin);
      await member.getByRole("button", { name: "Activar mi acceso" }).click();
      const privatePath = await member.getByRole("link", { name: "Mi enlace privado", exact: true }).getAttribute("href");
      assert.ok(privatePath);
      privateLinks.set(name, new URL(privatePath, base).href);
      await member.getByRole("link", { name: "Continuar a mi acceso" }).click();
      if (index < 2) {
        await member.getByText(/Solicitud pendiente/).waitFor();
        assert.equal(await member.getByRole("heading", { name: "Mis deseos" }).count(), 0);
        stage = "aprobar participante " + (index + 1);
        await host.reload();
        await host.getByText("Gestionar a " + name, { exact: true }).click();
        await confirm(host, "Aprobar solicitud");
        await row.getByText("Confirmado · Acceso activado", { exact: true }).waitFor();
        await member.reload();
      }
      stage = "guardar deseos del participante " + (index + 1);
      await member.bringToFront();
      await member.getByLabel("Qué me gustaría recibir").fill(wishes.get(name));
      await member.getByRole("button", { name: "Guardar mis deseos" }).click();
      await member.getByText("Tus deseos quedaron guardados.").waitFor();
      await member.close();
    }
    stage = "preparar la presentación en otro navegador";
    await host.getByRole("button", { name: "Generar enlace de presentación", exact: true }).click();
    const link = await host.getByLabel("Enlace de presentación", { exact: true }).inputValue();
    const api = new URL("/presentacion/estado", base).href;
    const header = { authorization: "Bearer " + new URL(link).hash.slice(1) };
    await display.goto(link);
    await display.bringToFront();
    await display.getByText(event, { exact: true }).waitFor({ timeout: 60000 });
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
    await host.getByLabel("Primera persona").selectOption({ label: cast[0] });
    await host.getByLabel("Segunda persona").selectOption({ label: cast[1] });
    await host.getByRole("button", { name: "Agregar exclusión" }).click();
    await host.getByRole("button", { name: "Quitar exclusión" }).waitFor();
    await confirm(host, "Ejecutar sorteo");
    await host.getByRole("button", { name: "Guardar configuración" }).waitFor({ state: "detached" });
    assert.equal((await host.request.get(new URL("/acceso/cuenta/estado", base).href)).status(), 401);
    const expectedGivers = new Map();
    for (const [giver, privateLink] of privateLinks) {
      const member = await browser.newPage({ reducedMotion: "reduce" });
      await member.routeWebSocket("**/_next/webpack-hmr**", () => {});
      await member.goto(privateLink);
      await member.getByLabel("PIN personal").fill(pin);
      await member.getByRole("button", { name: "Entrar", exact: true }).click();
      await member.getByRole("heading", { name: "Mi sobre secreto" }).waitFor();
      const response = await member.reload();
      assert.ok(response?.ok());
      const html = await response.text();
      assert.ok([...wishes.values()].filter((wish) => wish !== wishes.get(giver)).every((wish) => !html.includes(wish)));
      assert.equal(await member.locator(".envelope-result").count(), 0);
      const metadata = await (await member.request.get(new URL("/acceso/cuenta/estado", base).href)).json();
      assert.deepEqual(Object.keys(metadata).sort(), ["editable", "opened", "revision", "sessionView", "version", "wishesEnabled"]);
      await member.bringToFront();
      await member.getByRole("button", { name: "Abrir mi sobre" }).click();
      const result = member.locator(".envelope-result strong");
      await result.waitFor();
      const target = (await result.textContent()).slice(0, -1);
      assert.ok(cast.includes(target) && target !== giver);
      assert.ok(!expectedGivers.has(target));
      assert.ok(!(cast.slice(0, 2).includes(giver) && cast.slice(0, 2).includes(target)));
      expectedGivers.set(target, giver);
      await member.getByRole("button", { name: "Ver sus deseos" }).click();
      await member.getByText(wishes.get(target), { exact: true }).waitFor();
      await member.close();
    }
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
    assert.equal(firstResult, expectedGivers.get(recipient));
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
    for (let index = 0; index < cast.length - 1; index++) {
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
    assert.equal(await display.locator(".result-list li").count(), cast.length);
    await host.getByRole("heading", { name: "Resumen del intercambio" }).waitFor();
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
  const detail = String(error).split("\n").slice(0, 6).join(" ").replace(/[A-Za-z0-9_-]{43}/g, "[credencial]").replace(/\b\d{6}\b/g, "[PIN]");
  console.error("Falló la prueba de navegador en la etapa:", stage, detail);
  process.exitCode = 1;
} finally {
  await stopServer();
}
