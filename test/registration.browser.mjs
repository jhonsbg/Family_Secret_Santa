import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";

const base = new URL(process.env.E2E_ORIGIN ?? "http://127.0.0.1:3102");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("La prueba de navegador solo acepta un servidor local con una base desechable.");
}
const suffix = randomBytes(4).toString("hex");
const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
const eventName = "[Ficticia] Prueba E2.3 " + suffix;
let stage = "inicio";

async function confirm(page, label, container = page) {
  await container.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar", exact: true }).click();
}

async function openActivation(page, url) {
  await page.goto(url);
  await page.getByLabel("PIN nuevo", { exact: true }).fill(pin);
  await page.getByLabel("Confirma el PIN nuevo", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "Activar mi acceso" }).click();
  await page.getByRole("heading", { name: "Acceso activado" }).waitFor();
  await page.getByRole("link", { name: "Continuar a mi acceso" }).click();
}

async function request(page, url, name) {
  await page.goto(url);
  await page.getByRole("heading", { name: eventName }).waitFor();
  await page.getByLabel("Tu nombre").fill(name);
  await page.getByRole("button", { name: "Solicitar inscripción" }).click();
}

async function run() {
  // Compile the routes before opening a browser session to avoid dev HMR during activation.
  for (const path of ["/partidas", "/partidas/organizar", "/invitacion", "/acceso/activar", "/acceso/cuenta"]) {
    const response = await fetch(new URL(path, base));
    assert.ok(response.ok);
    await response.arrayBuffer();
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const host = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const manual = await browser.newPage({ viewport: { width: 320, height: 760 } });
    const secondGuest = await browser.newPage();
    stage = "creación del organizador";
    await host.goto(new URL("/partidas", base).href);
    await host.getByLabel("Nombre de la partida").fill(eventName);
    await host.getByLabel("Fecha y hora en Bogotá").fill("2027-12-24T19:00");
    await host.getByLabel("Presupuesto sugerido en COP").fill("60000");
    await host.getByLabel("PIN de administración").fill(pin);
    await host.getByLabel("Confirma tu PIN").fill(pin);
    await host.getByRole("button", { name: "Crear mi partida" }).click();
    await host.getByRole("link", { name: "Abrir panel del organizador" }).click();

    stage = "enlace general y solicitud móvil";
    await confirm(host, "Generar enlace general");
    const general = await host.getByLabel("Enlace general").inputValue();
    assert.ok((await host.getByRole("link", { name: "Compartir por WhatsApp" }).getAttribute("href"))?.startsWith("https://wa.me/"));
    stage = "solicitud móvil";
    await request(guest, general, "Familia móvil");
    const personalLink = await guest.getByRole("link", { name: "Activar mi acceso individual" }).getAttribute("href");
    assert.ok(personalLink);
    stage = "activación de solicitud";
    await openActivation(guest, new URL(personalLink, base).href);
    await guest.getByText(/Solicitud pendiente/).waitFor();
    stage = "acceso al panel desde una solicitud pendiente";
    await guest.goto(new URL("/partidas/organizar", base).href);
    await guest.getByText(/Solicitud pendiente/).waitFor();
    assert.equal(new URL(guest.url()).pathname, "/acceso/cuenta");

    stage = "duplicados, aprobación, rechazo y recarga";
    await request(secondGuest, general, "  FAMILIA MÓVIL  ");
    await secondGuest.getByRole("alert").filter({ hasText: "No pudimos registrar" }).waitFor();
    await request(secondGuest, general, "Solicitud por rechazar");
    await secondGuest.getByRole("heading", { name: "Solicitud recibida" }).waitFor();
    await host.reload();
    await host.getByText("Gestionar a Familia móvil", { exact: true }).click();
    await confirm(host, "Aprobar solicitud", host.locator("li").filter({ hasText: "Familia móvil" }));
    await host.locator("li").filter({ hasText: "Familia móvil" }).getByText(/Confirmado · Acceso activado/).waitFor();
    await guest.reload();
    await guest.getByText(/Participante confirmado/).waitFor();
    await host.getByText("Gestionar a Solicitud por rechazar", { exact: true }).click();
    await confirm(host, "Rechazar solicitud", host.locator("li").filter({ hasText: "Solicitud por rechazar" }));
    await host.getByText(/Rechazado ·/).waitFor();

    stage = "alta manual y reemplazo de enlace";
    await host.getByLabel("Nombre para registro manual").fill("Persona manual");
    await host.getByRole("button", { name: "Agregar participante" }).click();
    const row = host.locator("li").filter({ hasText: "Persona manual" });
    await row.getByText(/Confirmado · Sin activar/).waitFor();
    await row.getByText("Gestionar a Persona manual", { exact: true }).click();
    await confirm(host, "Generar o renovar enlace personal", row);
    const first = await row.getByLabel("Enlace privado").inputValue();
    await confirm(host, "Generar o renovar enlace personal", row);
    await host.waitForFunction((previous) => [...document.querySelectorAll("input[readonly]")].some((input) =>
      input.value.includes("/acceso/activar#") && input.value !== previous), first);
    const second = await row.getByLabel("Enlace privado").inputValue();
    assert.ok(first !== second);
    await openActivation(manual, second);
    await manual.getByText(/Participante confirmado/).waitFor();

    stage = "cierre y tamaños";
    await confirm(host, "Cerrar inscripciones");
    await host.getByText("Inscripciones cerradas", { exact: true }).waitFor();
    await secondGuest.goto(general);
    await secondGuest.reload();
    await secondGuest.getByText("Por ahora no se reciben nuevas solicitudes.").waitFor();
    for (const page of [host, guest, manual]) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }
    await host.setViewportSize({ width: 390, height: 844 });
    assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    console.log("E2.3 verificada en Chromium con tres tamaños y sesiones separadas.");
  } finally {
    await browser.close();
  }
}

run().catch(() => {
  console.error("Falló la prueba de navegador en la etapa:", stage);
  process.exitCode = 1;
});
