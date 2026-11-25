# Amigo Secreto — Arquitectura técnica

**Versión:** 1.0 · **Fecha:** 2026-11-23 · **Estado:** Stack aprobado; parámetros de seguridad y cuotas requieren comprobación antes del despliegue.

## 1. Stack aprobado

- **Next.js (App Router)** + React + TypeScript; frontend y capa de servidor en un mismo proyecto.
- **Tailwind CSS** + **shadcn/ui** para el sistema de interfaz.
- **Motion for React** para microinteracciones y revelaciones.
- **Neon PostgreSQL** como base de datos administrada.
- **Drizzle ORM** y migraciones versionadas.
- **Vercel** para despliegue inicial; **GitHub** para repositorio.
- **Codex** para desarrollo iterativo. Mantener versiones de dependencias actuales compatibles durante bootstrap; fijarlas en `package-lock.json`.

**Principio arquitectónico:** monolito modular. No microservicios, colas ni WebSockets inicialmente. La complejidad debe ser proporcional a un juego familiar.

## 2. Separación de responsabilidades

```
Navegador (participante / organizador / pantalla pública)
    ↓ HTTPS + cookies de sesión
Next.js: rutas, acciones y endpoints del servidor
    ↓ validación, permisos y dominio (sin confiar en la UI)
Servicios de dominio: partidas / participación / autenticación / sorteos / revelación
    ↓ repositorios con Drizzle
Neon PostgreSQL
```

Solo el servidor accede a la base de datos con credenciales. Evitar consultas desde el cliente con secretos de Neon; no usar claves de servicio en variables `NEXT_PUBLIC_*`.

## 3. Modelo de datos propuesto

| Tabla | Contenido y restricciones relevantes |
|---|---|
| `games` | `id`, `name`, `event_at`, `timezone`, `budget_min/max`, `state`, `admin_identity_id`, configuración, timestamps |
| `participants` | `id`, `game_id`, `display_name`, `status`, `is_admin_player`, `activated_at`, timestamps; pertenece a una partida |
| `identities` | identidad de acceso por participante o creador; identificadores opacos y credenciales, sin depender de nombre visible |
| `invites` | token **hasheado**, propósito (activar/recuperar), expiración, uso único, identidad/participante, invalidación |
| `pin_credentials` | referencia de identidad, hash Argon2id, versión, `updated_at`; nunca PIN plano |
| `sessions` | token opaco hasheado, ámbito, expiración, revocación, marca de dispositivo temporal |
| `wishlist` | `participant_id`, texto de deseos, gustos, evitar, timestamps |
| `exclusions` | `game_id`, `participant_a`, `participant_b`, bidireccional por convención de UI; sin duplicados |
| `draws` | `id`, `game_id`, `version`, `status`, `created_at`, `invalidated_at` |
| `assignments` | `draw_id`, `giver_participant_id`, `recipient_participant_id`; índices únicos por `draw_id+giver`, `draw_id+recipient`; prohibido `giver=recipient` |
| `envelope_views` | `draw_id`, `participant_id`, primera consulta (sin duplicados) |
| `reveal_sessions` | `game_id`, `draw_id`, `state`, posición actual, timestamps |
| `reveal_turns` | `reveal_session_id`, `recipient_participant_id`, `order_index`, `status`, `guess_participant_id`, `revealed_at`, `completed_at` |
| `display_access` | autorización efímera y de mínimo privilegio para vista pública de una revelación |

**Modelo lógico a refinar durante E2:** una identidad puede estar vinculada al rol de administración y opcionalmente a un participante de la misma partida. Mantener integridad referencial y evitar que la inscripción manual genere dos perfiles de la misma persona por accidente. Usar UUID/identificadores no secuenciales para recursos externos.

## 4. Autorización y visibilidad

- La autenticación ocurre en el **servidor**. Ningún estado guardado en localStorage otorga privilegios.
- Toda acción valida **identidad, partida, rol, estado de partida y pertenencia**.
- Administrador: operaciones de gestión; **sin endpoint de lectura masiva de asignaciones ocultas**.
- Participante: lectura de **su asignación** del sorteo vigente y la lista de deseos de **su destinatario**, además de sus propios deseos.
- Vista pública: datos de estado y turnos **ya revelados**, jamás una respuesta que contenga pares ocultos aunque estén escondidos por CSS.
- La lógica de selección de adivinanzas no requiere consultar la respuesta real hasta el momento de revelación.
- Las cargas útiles y estados de frontend no deben contener secretos anticipadamente.

## 5. PIN, invitaciones y sesiones

Un PIN de 6 dígitos tiene espacio de búsqueda pequeño, por lo que necesita **defensas fuertes del lado del servidor**:

- Invitaciones y credenciales generadas con fuente criptográfica segura; tokens de activación/recovery de un solo uso, expiración breve y revocación.
- Guardar hashes de tokens, no enlaces completos. Considerar intercambio seguro de token hacia sesión y evitar filtración por logs, encabezados Referer y herramientas de terceros.
- Almacenar PIN con Argon2id y parámetros adecuados; emplear secreto adicional de aplicación (pepper) como defensa en profundidad si el diseño lo permite.
- Rate limit por identidad y por origen, usando almacenamiento compartido/persistente; contador de fallos, enfriamiento y bloqueo gradual. **No** limitar solo en memoria de una instancia serverless.
- Cookies de sesión `HttpOnly`, `Secure`, `SameSite` apropiado, con expiración y rotación; protección CSRF para mutaciones, y revocación al recuperar acceso.
- Dispositivos prestados: sesión temporal sin persistencia prolongada, cierre accesible, invalidación en servidor, cabeceras `Cache-Control: no-store` en respuestas sensibles; limpiar memoria de UI en logout.
- Al creador/administrador ofrecer un código de recuperación de un solo uso almacenado como hash (propuesta). No guardar el PIN original ni exponerlo al administrador.
- Recuperación asistida de otros participantes: el organizador solicita reactivación y valida su identidad por un canal externo; el proceso **no ofrece garantía criptográfica contra un organizador que suplante al destinatario**. Documentar límite y nunca afirmar privacidad absoluta.

## 6. Motor de sorteos

- Servicio puro y testeable, separado de React.
- Validar factibilidad modelando restricciones como asignación bipartita; no confundir «no se encontró en N intentos» con «imposible».
- Usar aleatoriedad criptográficamente segura y una política explícita para evitar favorecer involuntariamente al primer orden de búsqueda. Si se requiere distribución uniforme entre todas las soluciones válidas, usar una técnica que lo garantice para el tamaño máximo admitido; documentar límite y complejidad.
- Escribir el sorteo y sus asignaciones en **una transacción** con unicidad en BD. Prevenir dos sorteos simultáneos de la misma partida con bloqueo/condición de estado.
- Prohibir autoasignación y duplicidad tanto en dominio como con restricciones de base de datos.
- «Repetir» invalida versión anterior sin alterar silenciosamente las referencias de sobres consultados.

## 7. Revelación sincronizada

- Crear orden aleatorio de **destinatarios** al iniciar la revelación; persistirlo.
- El panel del administrador emite acciones con permisos: iniciar, elegir siguiente, posponer, registrar adivinanza, confirmar revelar, completar turno, pausar, reanudar.
- El servidor es fuente de verdad; las transiciones deben ser atómicas e idempotentes frente a reintentos.
- Vista pública con token efímero de **solo lectura** y permisos limitados a esta partida/evento, mediante polling inicial (propuesta 2–5 s, ajustable).
- La respuesta pública para un turno pendiente **no incluye** el verdadero regalador, ni en campos ocultos.
- Cuando se confirma revelación, el servidor publica estado con regalador visible y la animación de la pantalla pública reacciona. Evitar adelantar nombres al cliente para «hacerla más rápida».
- Permitir reanudación tras recarga y vista en una sola pantalla si no hay TV.

## 8. Estructura de proyecto sugerida

```
src/
  app/
    (public)/
    (participant)/
    (admin)/
    display/
    api/
  components/
    ui/
    christmas/
    game/
  features/
    games/
    participants/
    access/
    wishes/
    draw/
    reveal/
  lib/
    db/
    auth/
    validation/
  styles/
  test/
drizzle/
public/
```

Mantener la lógica de dominio y controles de permisos fuera de componentes cliente. Validar payloads en el servidor con un esquema tipado (p. ej. Zod, sujeto a elección de implementación).

## 9. Desarrollo y pruebas

- E1 debe funcionar **sin cuentas Neon ni variables sensibles**: fixtures locales claramente identificados como ficticios; no usar una base falsa haciéndola pasar por real.
- En E2 configurar Neon por variables de entorno **solo servidor**, migraciones, datos de prueba no sensibles, y tests de autorización.
- Unit tests: restricciones, factibilidad, sorteo, estado de partida y estado de turnos.
- Integration tests: permisos horizontales (A no ve asignación de B), admin sin acceso global, invalidación de sorteo, revocación de sesiones, repetición de solicitudes, concurrencia.
- E2E: registro autónomo, aprobación, registro manual/activación, sobre privado, recuperación, revelación en pantalla independiente, continuidad tras recarga.
- Revisar velocidad, legibilidad y movimiento reducido en celulares reales.

## 10. Despliegue

- Vercel + Neon, entornos separados para desarrollo y producción.
- No incorporar credenciales al repositorio; proporcionar `.env.example` sin valores reales.
- HTTPS obligatorio, política de contenido y cookies seguras; controlar logs y errores.
- Copias de seguridad y plan de recuperación antes del evento; comprobar límites y políticas vigentes de los planes gratuitos antes de publicar.
- Considerar desactivación o limpieza programada de partidas antiguas y datos privados tras un período acordado; aún no se definió política de retención.

## 11. No objetivos iniciales

No app nativa, no WhatsApp API, no notificaciones push, no login obligatorio por Google/correo, no microservicios, no servicio en tiempo real permanente, no CMS ni pagos. Los enlaces de invitación se comparten manualmente.

## 12. Implementación de la demo E1

El layout conserva el estado de interfaz en memoria durante la navegación de una pestaña. Dos acciones de demostración entregan únicamente el contenido del sobre de ejemplo o la respuesta del turno confirmado en la interfaz. El guion de correspondencias está en el servidor. Las acciones de E1 permiten recorrer datos ficticios y carecen de autenticación o autorización; la pantalla pública utiliza exclusivamente el estado de turno y los resultados ya revelados.

## 13. Presentación E1.1

La preferencia de movimiento usa un valor estático compartido por el servidor y el primer render del navegador. Después de la hidratación sigue los cambios de la preferencia del sistema. Los componentes de Motion reciben esa preferencia y las animaciones del sobre comienzan una vez recibido el resultado ficticio. La navegación por etapas usa anclas y el estado de partida existente.

## 14. Persistencia E2.1

Los repositorios tipados de partidas y participantes usan Drizzle y node-postgres. Se invocan desde Node en desarrollo, sin acciones web ni dependencias desde E1.1. La URL directa de Neon se obtiene de `DATABASE_URL_DEV` y el cliente valida el certificado TLS. Las pruebas de integración usan únicamente una base dedicada en PostgreSQL local.

El organizador es una referencia obligatoria de partida. Puede estar también en participantes, y sus dos registros se crean en una transacción. Los participantes separan aprobación de activación. Los nombres visibles admiten coincidencias y la identidad se representa con UUID. Los enlaces generales pueden reutilizarse mientras estén vigentes. El modelo reserva hashes y fechas para enlaces personales, sesiones y accesos a pantalla. La emisión, la revocación operativa, el PIN y la verificación de pertenencia para sesiones se implementarán con la capa de acceso.

Las claves foráneas compuestas limitan vínculos de invitaciones, exclusiones, asignaciones y revelación al ámbito correspondiente. Las exclusiones se registran en orden canónico, cada partida tiene a lo sumo un sorteo vigente y cada sorteo tiene a lo sumo una asignación por regalador y por destinatario. La cobertura total y factibilidad quedan para el servicio de sorteo. El orden y estado de los turnos serán la base del control de revelación.

Las mutaciones de participantes bloquean la fila de la partida durante la transacción. Las siguientes etapas deben usar ese mismo bloqueo al cambiar el ciclo de la partida. El sembrado y su reinicio solo operan sobre la partida ficticia reservada.

La validación de cierre añadió una restricción de estado para que el organizador participante esté confirmado y una clave foránea que exige que use la identidad que administra la partida. La migración es aditiva y conserva el historial inicial. El comando de verificación usa una partida temporal y dos conexiones independientes de desarrollo.

## 15. Identidad y acceso E2.2

Las rutas `/acceso`, `/acceso/activar` y `/acceso/cuenta` usan Server Actions y autorización de servidor. Las invitaciones de activación expiran a las 24 horas. Al canjearse se crea o vincula la identidad en la misma transacción que consume el token, guarda la credencial y abre la primera sesión. El enlace privado de acceso contiene otro token aleatorio. Los enlaces transportan los tokens en fragmentos de URL y el navegador los envía al servidor en el formulario. Las rutas sensibles usan `no-store` y una política sin Referer.

PostgreSQL almacena hashes de tokens, PIN con Argon2id y HMAC del PIN con un secreto externo a la base, y contadores de intentos. Cada ventana de 15 minutos admite 5 intentos de PIN por identidad y 20 por origen, incluidos los intentos válidos. La activación tiene su propio límite de 20 por origen. En Vercel se toma la dirección del encabezado administrado por la plataforma. Fuera de Vercel se usa un contador compartido mientras no se configure una fuente de IP confiable. Establecer la retención de contadores y probar los límites bajo carga son tareas pendientes para el despliegue.

La cookie `HttpOnly` y `SameSite=Lax` usa `Secure` en HTTPS productivo. La sesión ordinaria dura hasta 7 días con 2 horas de inactividad. La sesión prestada dura hasta 30 minutos con 10 minutos de inactividad y cookie de sesión del navegador. Cerrar sesión revoca el registro. Cambiar el PIN requiere el PIN actual y revoca las sesiones de la identidad en la misma transacción. Las mutaciones web verifican el origen exacto. Se validan el ámbito de la sesión, la pertenencia y el rol desde datos vigentes. Una sesión se abre para una partida concreta. La consulta de pertenencias puede listar las demás partidas de la misma identidad sin otorgar acceso a ellas. Los permisos de administración y los datos privados del participante tienen verificaciones distintas.

Mantén `DATABASE_URL_DEV` directa para migraciones y `DATABASE_URL_AUTH` agrupada para las operaciones web. El cliente PostgreSQL conserva una conexión por transacción y el esquema aplica bloqueos de fila y reservas atómicas. E2.2 usa una acción de invitación autorizable para futuras pantallas y un comando local acotado a una partida ficticia para pruebas.

E2.4 deberá verificar por un canal independiente la identidad del familiar, emitir una invitación breve de un solo uso, invalidar las credenciales y sesiones anteriores y registrar la operación sin secretos. El administrador puede iniciar el proceso, pero no recibe una función para leer o escribir el PIN de otro. Quien controle la entrega y pueda canjear el enlace antes del destinatario puede suplantarlo. Restringir y verificar la entrega es necesario tanto para la activación como para la recuperación. La rotación del secreto del PIN requiere una estrategia de transición antes de utilizar cuentas reales.

## 16. Partidas e inscripciones E2.3

Crear una partida genera identidad, credencial, registro opcional del organizador como jugador y sesión en una sola transacción. La autorización se deriva de la cookie y de la pertenencia actual. Las personas pendientes y las solicitudes rechazadas ya activadas pueden consultar solo su estado personal. El panel exige el rol de organizador para la partida de la sesión. El retiro marca al participante como retirado y revoca sus sesiones de esa partida.

El enlace general se guarda como hash y autoriza consultar una proyección del evento y solicitar una inscripción. Los enlaces llevan su token en el fragmento de la URL y las acciones reciben los datos por formulario. El bloqueo de la fila de la partida ordena las altas, los cambios de estado, la gestión de personas y el reemplazo de enlaces. Los límites por origen y partida siguen en PostgreSQL. La creación admite cuatro intentos por origen en 15 minutos. La inscripción admite ocho por origen y 24 por partida en la misma ventana, y hasta 40 solicitudes simultáneamente pendientes. Los nombres se normalizan para detectar coincidencias dentro de la partida. El enlace personal solo se emite tras crear una solicitud nueva. Una coincidencia de nombre nunca recupera un acceso.

## 17. Recuperación E2.4

El código personal tiene 160 bits aleatorios. Se almacena un digest con dominio separado en la credencial vigente y el código se entrega solo durante la emisión. Dura hasta su canje o sustitución. Los enlaces asistidos de 15 minutos se almacenan como hashes y la emisión o renovación requiere sesión de organizador, pertenencia a la partida y confirmación de verificación presencial. La emisión conserva las sesiones actuales. El canje consume la credencial, reemplaza el PIN, el enlace de acceso y el código personal, revoca los enlaces asistidos y sesiones anteriores y crea la sesión nueva, todo en una transacción. Las filas de partida, credencial y participante se bloquean en ese orden para arbitrar solicitudes concurrentes. La renovación con PIN vigente conserva el enlace de acceso y las sesiones, y revoca códigos anteriores y enlaces asistidos pendientes.

Las mutaciones validan el origen exacto y las rutas sensibles conservan `no-store` y `no-referrer`. La recuperación limita por origen y por identidad con contadores compartidos en PostgreSQL. El límite es de 8 intentos por origen y 4 por identidad en 15 minutos. El evento guarda tipo, fecha y UUID de partida e identidades pertinentes, sin guardar secretos. Se pueden revisar y limpiar contadores y eventos fuera de plazo con la política que describe el README.

### Rotación planificada de AUTH_PEPPER

Antes de rotarlo, añade un identificador de versión a las credenciales de PIN, etiqueta las existentes con la versión actual y despliega una configuración que lea ambos secretos en todas las instancias. Separa primero la clave de los contadores de la clave del PIN para mantener las ventanas durante la transición. Tras confirmar que todas las instancias leen ambas versiones, usa la clave nueva para los nuevos PIN. Al verificar correctamente un PIN con la versión anterior, vuelve a calcular su hash con la clave nueva y actualízalo con una condición de versión. El canje de un código personal o asistido también genera un hash actualizado. Conserva ambas claves hasta migrar a las cuentas restantes o acordar un restablecimiento con sus titulares. En caso de compromiso, evalúa el restablecimiento de PIN de las cuentas afectadas antes de retirar la clave. Los códigos de alta entropía y los enlaces tienen digests independientes del pepper. Esta entrega conserva la configuración vigente.

## 18. Motor de sorteo E3.1

El cálculo modela un emparejamiento bipartito entre personas confirmadas como remitentes y destinatarias. La prueba de viabilidad usa caminos aumentantes. Para muestrear, una tabla por máscaras cuenta todas las maneras de completar el reparto para cada prefijo de remitentes. El motor escoge un rango uniforme con `crypto.randomBytes` y rechazo acotado y recorre los bloques de soluciones de cada candidato. Cada rango produce exactamente un reparto válido. La uniformidad se aplica a repartos completos. Una pareja concreta puede tener una probabilidad distinta por el efecto de las exclusiones. Repetir el sorteo puede producir el mismo reparto.

El límite inicial es de 20 personas confirmadas. El conteo usa tiempo O(n · 2ⁿ) y memoria O(2ⁿ). A 20 participantes, las tablas ocupan 9 MiB y el conteo de cualquier prefijo cabe en 64 bits porque está acotado por 20!. La revisión de viabilidad usa O(n³) y no necesita contar repartos.

El servicio adquiere el mismo bloqueo de fila que la gestión de inscripciones, revalida las condiciones y compara la versión vista por el organizador. Guarda la versión y todas las asignaciones en la misma transacción. Repetir invalida el reparto anterior dentro de esa transacción. Anular conserva el historial, deja las inscripciones cerradas y permite editar las exclusiones. Se usan las restricciones existentes de PostgreSQL. La revelación deberá adquirir el mismo bloqueo en E4. Un registro de revelación o un estado de revelación impiden anular y repetir.

El panel recibe nombres de elegibles, exclusiones y metadatos de versión. El lector interno de asignaciones exige una sesión activa y una versión, deriva el remitente de la cuenta y consulta solo su fila vigente. Los errores de escritura se traducen en un mensaje genérico para que los parámetros de la base no lleguen a respuestas ni a logs de la aplicación.

## 19. Sobre y deseos E3.2

La cuenta obtiene los deseos propios y metadatos del sobre. La apertura y los deseos asignados usan acciones de servidor con verificación de origen. El servicio deriva la persona y la partida desde la sesión y valida la versión vigente. El nombre solo se devuelve al solicitar abrir o consultar el sobre. La lista asignada requiere un registro de apertura en esa versión. La edición exige que los deseos estén habilitados, que siga vigente la versión que vio el usuario y que la revelación no haya comenzado.

La apertura se guarda en `envelope_views` y los deseos en `wishlist`. Las transacciones adquieren el bloqueo de partida y revalidan la sesión y la participación. La clave compuesta de apertura hace idempotentes las aperturas simultáneas y conserva el historial al anular. E4 deberá respetar el mismo bloqueo de partida al iniciar la revelación.

El navegador comprueba la versión al recibir el resultado de una acción, al volver a la pestaña y aproximadamente cada cuatro segundos mientras está visible. Esta consulta privada devuelve únicamente metadatos, incluye una referencia opaca para detectar un cambio de sesión y rechazar acciones de una pestaña abierta con otra sesión y respeta el vencimiento por inactividad sin renovarlo. Las respuestas de versiones obsoletas se descartan y la tarjeta se retira al detectar una anulación o cambio de versión. Una pestaña activa puede mostrar el resultado previo hasta observar el cambio.

## 20. Motor de revelación E4.1

El inicio usa el mismo bloqueo `FOR NO KEY UPDATE` por partida que el sorteo, la inscripción y los deseos. Bajo ese bloqueo se verifica el sorteo vigente y su cobertura. Fisher–Yates con `crypto.randomInt` genera un orden uniforme de destinatarios. La sesión, los turnos y el paso de la partida a revelación se guardan en una transacción. La migración 0005 registra una única sesión por partida, la revisión monotónica y un único turno en curso o revelado.

Los turnos avanzan de pendiente o pospuesto a en curso, revelado y completado. Un turno en curso puede volver a pospuesto. Pausar conserva el turno actual y su adivinanza. La revisión esperada y el identificador del turno impiden repetir una acción o aplicarla a un turno distinto. El servidor consulta la asignación vigente al revelar y guarda la identidad como visible mediante el estado del turno, con su acierto si hubo una adivinanza. Las consultas de presentación leen una instantánea consistente y proyectan asignaciones solo para turnos revelados o completados. La entrega del resultado ocurre después del commit.

El enlace de presentación usa 32 bytes aleatorios en el fragmento de `/presentacion`. El navegador los envía solo en el encabezado de autorización al consultar `/presentacion/estado`, sin cookies. PostgreSQL conserva el hash y su vigencia. Un enlace nuevo revoca el anterior. La presentación consulta cada tres segundos mientras está visible y al recuperar foco o conexión. El navegador conserva la revisión más reciente e indica cuándo muestra el último estado conocido. Durante una conexión normal, la pantalla se actualiza en un intervalo aproximado de cero a tres segundos más la latencia del servidor y la red.

## 21. Sincronización visual E4.2

El cliente mantiene la última revisión validada y deriva de ella la puesta en escena. La primera respuesta se dibuja estática. Una revelación autorizada se identifica por el número de orden de su resultado. Su escena mantiene el mismo nodo al recibir revisiones duplicadas o al pausar y reanudar. El cliente descarta revisiones anteriores. Los efectos y el modo de pantalla completa son preferencias de la vista y no intervienen en las transiciones del servidor.

El intervalo de consulta sigue siendo de tres segundos. Tras 15 segundos sin una respuesta vigente, la pantalla retira la escena y comprueba el estado al volver a tener conexión. Si recupera la revisión que ya tenía, la vuelve a mostrar sin repetir la animación. Una respuesta 401 descarta la escena y detiene las consultas de ese enlace. El navegador conserva el estado recibido solo en memoria.

## 22. Operación E5.1

El runtime web de Vercel selecciona la conexión agrupada por entorno y verifica el nombre esperado de base. Los scripts de mantenimiento usan un endpoint directo y comprueban que empareje con el de tráfico. El ejecutor compara hashes y fechas del registro de Drizzle antes de aplicar cambios. El pool web se registra en el ciclo de vida de Fluid Compute y el servidor conserva la autoridad sobre las revisiones, los intentos y las sesiones. [Guía de operación](docs/E5.1-operacion.md)
