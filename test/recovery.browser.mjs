import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";

const base = new URL(process.env.E2E_ORIGIN ?? "http://127.0.0.1:3104");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("Usa un servidor local con una base desechable.");
}

const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
const nextPin = pin === "000000" ? "000001" : "000000";
const date = "2027-12-24T19:00";
let stage = "inicio";

async function confirm(page, button, container = page) {
  await container.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
}

async function fillPin(page, value) {
  await page.getByLabel("PIN nuevo", { exact: true }).fill(value);
  await page.getByLabel("Confirma el PIN nuevo", { exact: true }).fill(value);
}

async function run() {
  for (const path of ["/partidas", "/partidas/organizar", "/acceso", "/acceso/activar", "/acceso/recuperar", "/acceso/cuenta"]) {
    const response = await fetch(new URL(path, base));
    assert.ok(response.ok);
    await response.arrayBuffer();
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const organizer = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const restored = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const family = await browser.newPage({ viewport: { width: 320, height: 760 } });
    const assisted = await browser.newPage();
    for (const page of [organizer, restored, family, assisted]) await page.routeWebSocket("**/_next/webpack-hmr**", () => {});
    stage = "crear el acceso del único organizador";
    await organizer.goto(new URL("/partidas", base).href);
    await organizer.getByLabel("Nombre de la partida").fill("[Ficticia] Recuperación " + randomBytes(4).toString("hex"));
    await organizer.getByLabel("Fecha y hora en Bogotá").fill(date);
    await organizer.getByLabel("Presupuesto sugerido en COP").fill("40000");
    await organizer.getByLabel("Tu nombre", { exact: true }).fill("Organizador de prueba");
    await organizer.getByLabel("PIN de administración").fill(pin);
    await organizer.getByLabel("Confirma tu PIN").fill(pin);
    await organizer.getByRole("button", { name: "Crear mi partida" }).click();
    const code = await organizer.getByLabel("Código personal de recuperación").inputValue();
    assert.equal(code.length, 47);
    await organizer.getByRole("link", { name: "Abrir panel del organizador" }).click();

    stage = "recuperación personal en dispositivo prestado";
    await restored.goto(new URL("/acceso", base).href);
    await restored.getByRole("link", { name: "Olvidé mi PIN" }).click();
    await restored.getByLabel("Código personal de recuperación").fill(code);
    await fillPin(restored, nextPin);
    await restored.getByLabel("Estoy usando un dispositivo prestado").check();
    await restored.getByRole("button", { name: "Recuperar mi acceso" }).click();
    await restored.getByRole("heading", { name: "Acceso recuperado" }).waitFor();
    const cookies = await restored.context().cookies();
    const borrowed = cookies.find(({ name }) => name.endsWith("amigo-session"));
    assert.ok(borrowed?.httpOnly && borrowed.expires === -1);
    await restored.getByRole("link", { name: "Continuar a mi acceso" }).click();
    await restored.getByText("Dispositivo prestado.", { exact: false }).waitFor();
    await organizer.reload();
    await organizer.getByRole("heading", { name: "Acceso privado" }).waitFor();

    stage = "emitir invitación asistida tras verificar identidad";
    await restored.getByRole("link", { name: "Gestionar mi partida" }).click();
    await restored.getByLabel("Nombre para registro manual").fill("Familiar de prueba");
    await restored.getByRole("button", { name: "Agregar participante" }).click();
    const row = restored.locator("li").filter({ hasText: "Familiar de prueba" });
    await row.getByText("Gestionar a Familiar de prueba", { exact: true }).click();
    await confirm(restored, "Generar o renovar enlace personal", row);
    const activation = await row.getByLabel("Enlace privado").inputValue();
    await family.goto(activation);
    await fillPin(family, pin);
    await family.getByRole("button", { name: "Activar mi acceso" }).click();
    await family.getByRole("heading", { name: "Acceso activado" }).waitFor();
    assert.equal((await family.getByLabel("Código personal de recuperación").inputValue()).length, 47);
    await family.getByRole("link", { name: "Continuar a mi acceso" }).click();
    await family.getByText(/Participante confirmado/).waitFor();
    await restored.reload();
    await row.getByText("Gestionar a Familiar de prueba", { exact: true }).click();
    await row.getByLabel("Verifiqué en persona la identidad de este familiar").check();
    await confirm(restored, "Generar enlace de recuperación", row);
    const link = await row.getByLabel("Enlace privado").inputValue();

    stage = "canje asistido y revocación de la sesión previa";
    await assisted.goto(link);
    await fillPin(assisted, nextPin);
    await assisted.getByRole("button", { name: "Recuperar mi acceso" }).click();
    await assisted.getByRole("heading", { name: "Acceso recuperado" }).waitFor();
    await family.reload();
    await family.getByRole("heading", { name: "Acceso privado" }).waitFor();
    await assisted.getByRole("link", { name: "Continuar a mi acceso" }).click();
    await assisted.getByText(/Participante confirmado/).waitFor();

    stage = "renovar código con PIN actual";
    const renew = assisted.locator("section").filter({ has: assisted.getByRole("heading", { name: "Código de recuperación" }) });
    await renew.getByLabel("PIN actual", { exact: true }).fill(nextPin);
    await renew.getByRole("button", { name: "Generar código personal" }).click();
    assert.equal((await renew.getByLabel("Código personal de recuperación").inputValue()).length, 47);
    for (const page of [organizer, restored, family]) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    console.log("Recuperación personal, asistida y renovación verificadas en Chromium.");
  } finally {
    await browser.close();
  }
}

run().catch(() => {
  console.error("Falló la prueba de navegador en la etapa:", stage);
  process.exitCode = 1;
});
