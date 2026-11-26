# Instrucciones para Codex — Proyecto Amigo Secreto

> Leer primero `PRODUCT.md`, `DESIGN.md` y `ARCHITECTURE.md`. Estos documentos son la fuente de verdad del proyecto. Ante ambigüedad, implementar el camino más sencillo que respete las decisiones registradas y reportar la suposición.

## 1. Contexto y propósito

Aplicación web navideña familiar para gestionar un sorteo privado de amigo secreto y conducir una revelación presencial. Debe ser fácil para todas las edades, elegante, moderna, festiva e interactiva. Construir por etapas verificables, no una solución enorme de una vez.

## 2. Tecnologías elegidas

**Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Motion, Neon PostgreSQL, Drizzle ORM, Vercel.** No sustituir stack ni agregar frameworks, servicios pagos, autenticadores externos o infraestructura compleja sin justificar y solicitar autorización. Para E1 no conectarse aún a Neon.

## 3. Orden de implementación

1. **E1:** estructura, sistema de diseño, prototipo responsive con datos ficticios, componentes y animaciones.
2. **E2:** partidas, inscripciones (individual y manual), aprobaciones, PIN, invitaciones, sesiones, recuperación y permisos.
3. **E3:** deseos, exclusiones, validación de factibilidad, sorteo y sobre privado.
4. **E4:** control presencial, vista pública, adivinanza opcional, sincronización y cierre.
5. **E5:** pruebas de seguridad, accesibilidad, rendimiento y despliegue.

**No avanzar de etapa por cuenta propia**. Al finalizar cada tarea mostrar resumen de cambios, archivos modificados, pruebas ejecutadas, riesgos y siguiente paso propuesto.

## 4. Reglas inviolables del producto

- Solo **un** administrador por partida, que opcionalmente puede participar.
- Inscripción híbrida: solicitud con aprobación o agregado manual confirmado automáticamente.
- Acceso por nombre dentro de una partida y PIN de seis dígitos; los enlaces individuales solo activan o recuperan accesos; sesión temporal para celular prestado.
- Una persona confirmada participa aunque todavía no haya activado acceso.
- Cada jugador regala a exactamente una persona distinta y recibe exactamente un regalo; restricciones respetadas.
- Asignaciones secretas para todos, **incluido el administrador**; solo el servidor puede resolver autorizaciones.
- No mostrar en pantalla pública identidades no reveladas, ni siquiera en JSON que el navegador reciba.
- Cambios de participantes y restricciones solo antes del sorteo; re-sorteo únicamente antes de iniciar revelación y con confirmación clara.
- Revelación **presencial guiada por el administrador**, orden aleatorio de destinatarios, adivinanza opcional, pausa, posposición, reanudación y resultados finales.
- Mensajes anónimos y pistas son dinámicas opcionales posteriores, no bloquear MVP por ellas.

## 5. UX/UI obligatoria

- Navideña **elegante, cálida, moderna**, no infantil ni recargada; tokens de `DESIGN.md`.
- Mobile-first, diseño fluido también para televisor.
- Acciones principales obvias, lenguaje comprensible, buenas áreas táctiles, estados y errores claros.
- Microinteracciones y efectos principales con Motion, respetando `prefers-reduced-motion`.
- Componentes reutilizables. No generar pantallas administrativas sin identidad navideña.
- Las animaciones son presentacionales: jamás deben determinar si una identidad es autorizada a mostrarse.

## 6. Calidad de código

- TypeScript estricto. Evitar `any` salvo razón documentada.
- Lógica de dominio en servicios puros, fuera de componentes React.
- No duplicar datos de estado cuando la fuente de verdad está en el servidor.
- Validar entrada y permisos en cada operación de servidor; no fiarse de botones ocultos.
- Mantener módulos pequeños y nombres explícitos.
- Evitar dependencia innecesaria, sobreingeniería, servicios externos y estado global complejo.
- Crear pruebas para lógica de negocio e introducir tests E2E cuando haya flujos reales.
- No borrar o reescribir funcionalidades existentes para resolver una tarea pequeña.

## 7. Seguridad y privacidad

- Nunca guardar ni imprimir PIN en plano, tokens completos, cookies, conexiones Neon o asignaciones secretas en logs.
- Nunca enviar la lista de asignaciones al navegador del administrador ni al cliente público.
- Protección contra fuerza bruta y sesiones revocables al implementar auth; no declarar listo el acceso privado sin pruebas de seguridad.
- Recuperación asistida tiene límites de confianza: no prometer que el administrador es incapaz de suplantar a alguien si controla su reactivación.
- Para prototipos usar únicamente fixtures marcados como **ficticios**, sin autenticación falsa presentándose como real.

## 8. Protocolo de trabajo con el usuario

Antes de implementar:
1. Leer documentos aplicables.
2. Explicar brevemente objetivo, archivos previstos y criterios de aceptación.
3. Mantenerse **dentro de la etapa solicitada**.

Después de implementar:
1. Ejecutar lint y typecheck si están configurados; ejecutar pruebas aplicables.
2. Informar qué se construyó y qué sigue simulado o pendiente.
3. Evitar frases como «seguro» o «listo para producción» sin pruebas que lo respalden.
4. Registrar decisiones nuevas para que `PRODUCT.md`, `DESIGN.md` y `ARCHITECTURE.md` sigan sincronizados.

## 9. Primera tarea prevista

Construir únicamente **E1: prototipo visual navegable con datos ficticios**, acorde con `PROMPT_01_Codex.md`. No crear cuentas, migraciones ni endpoints de sorteo real en esta entrega.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
