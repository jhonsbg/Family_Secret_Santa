# Amigo Secreto · Demo E1.1

Necesitas Node.js 20.9 o superior y npm.

```sh
npm ci
npm run dev
```

Abre http://localhost:3000. Usa nombres ficticios en los formularios. La demo conserva cambios durante la navegación en una misma pestaña y vuelve al estado inicial al recargar.

1. En **Invitación**, solicita unirte y cambia a **Organizador** para aprobar la solicitud o probar el registro manual.
2. En **Organizador**, resuelve las solicitudes pendientes, cierra inscripciones, valida el escenario y confirma el sorteo de demo.
3. En **Mi partida**, entra como Valentina para editar sus deseos y abrir el sobre del guion.
4. En **Organizador**, inicia el intercambio. Alterna entre el control y la pantalla pública en la misma pestaña. Prueba adivinar, pausar, posponer y revelar.

El reparto usa un elenco fijo de cuatro personas. Las altas manuales y la participación del organizador permiten recorrer sus controles sin modificar el reparto de ejemplo. El modo temporal y la activación son interacciones visuales. Los resultados ficticios se sirven bajo demanda, sin permisos ni persistencia.

```sh
npm run lint
npm run typecheck
npm run build
```

## E2.1 · Base de datos de desarrollo

La demo anterior arranca sin configurar PostgreSQL. Las operaciones de persistencia se ejecutan desde Node y carecen de rutas, acciones web o conexión con la interfaz.

1. Crea en Neon una rama de desarrollo independiente y una base vacía llamada `Family_Secret_Santa`. Usa un rol de esa rama con permiso para crear los objetos de la migración. Copia la URL **directa**, sin pooler, de esa base.
2. Copia `.env.example` a `.env.local` y asigna la URL a `DATABASE_URL_DEV`. Conserva ese archivo local. Puedes usar también PostgreSQL local con el mismo nombre de base.
3. Instala las dependencias y ejecuta los comandos desde la raíz.

```sh
npm ci
npm run db:migrate
npm run db:seed
```

El cliente valida el certificado TLS de Neon. Las herramientas rechazan producción, endpoints de pooler y bases con nombres distintos del esperado. Usa una rama y un rol separados para que la configuración de desarrollo tampoco tenga acceso operativo a datos de producción.

- `npm run db:generate -- --name=descripcion` genera SQL y metadatos a partir del esquema Drizzle. Revisa ambos antes de aplicar la migración. La generación funciona sin credenciales.
- `npm run db:migrate` aplica migraciones pendientes. El archivo inicial crea las tablas y constraints. Está pensado para una base vacía.
- `npm run db:seed` crea una partida ficticia con cuatro personas y una lista de deseos. Puedes ejecutarlo de nuevo sin duplicar registros.
- `npm run db:reset` reemplaza únicamente esa partida por los datos iniciales. Borra los cambios de esa partida y sus dependencias en la misma transacción. Las demás partidas y el historial de migración se conservan.

Los repositorios de `src/lib/db` permiten crear, consultar y configurar partidas, abrir y cerrar inscripciones, y registrar, consultar, editar, aprobar o rechazar participantes. Las identidades del organizador son referencias de datos para esta etapa. La validación de pertenencia para sesiones y permisos quedará en la capa de acceso de E2.2. En E3 se validará que el reparto completo cubra a todos los confirmados y respete las exclusiones antes de escribirlo.

### Pruebas

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Para la prueba de integración, crea una base local desechable llamada `amigo_secreto_test` y define `DATABASE_URL_TEST` con su URL de loopback. Ejecuta `npm run test:db`. La prueba aplica las migraciones y verifica persistencia desde conexiones independientes, transiciones, concurrencia de aprobaciones, integridad relacional y el alcance del reinicio. Reutiliza la base solo para estas pruebas.

[Conexiones seguras de Neon](https://neon.com/docs/connect/connect-securely) · [Generación de migraciones con Drizzle](https://orm.drizzle.team/docs/drizzle-kit-generate)

### Cierre de E2.1 en Neon

`npm run db:verify -- --inspect` comprueba la conexión directa y muestra la versión de PostgreSQL y el número de tablas. Tras aplicar las migraciones, `npm run db:verify` crea una partida ficticia temporal, verifica los cambios desde otra conexión y retira los registros que creó. Usa la rama de desarrollo. Para las migraciones y esta prueba se conserva `DATABASE_URL_DEV` directa. Prepara una URL agrupada aparte al integrar tráfico de aplicación con autorización.

## E2.2 · Acceso privado con datos ficticios

Usa una base de desarrollo desechable o una rama de Neon dedicada a pruebas. Configura en `.env.local` la URL directa `DATABASE_URL_DEV`, el origen exacto `AUTH_ORIGIN=http://localhost:3000` y un `AUTH_PEPPER` Base64URL de 32 bytes aleatorios. Genera el secreto con un gestor de secretos o con `crypto.randomBytes(32).toString("base64url")` en Node y guárdalo directamente en el archivo local. Usa el mismo secreto en todas las instancias del mismo entorno. Mantén un secreto distinto por entorno.

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run auth:invite:dev
npm run dev
```

1. Abre `.env.auth-invitation` en tu editor y abre el enlace de Luna de Ejemplo. El archivo es local, está excluido de Git y contiene un enlace de un solo uso. Usa la dirección exacta de `AUTH_ORIGIN`.
2. Elige y confirma un PIN ficticio. Guarda el enlace privado que se muestra y abre **Continuar a mi acceso**.
3. Elige **Cerrar sesión** y abre de nuevo el enlace privado con el PIN ficticio. Prueba la opción de dispositivo prestado.
4. Cambia el PIN desde tu cuenta. El enlace privado sigue siendo el mismo y el PIN anterior deja de servir.

Para repetir desde cero usa `npm run db:reset` en la base de pruebas, elimina tu copia local anterior de `.env.auth-invitation` y vuelve a emitir la invitación. El reinicio reemplaza los datos de esa partida ficticia.

El tráfico web fuera de `next dev` usa `DATABASE_URL_AUTH` con el hostname agrupado de Neon y TLS. En desarrollo, si omites esa variable, el flujo web usa la URL directa local o de Neon. Conserva la URL directa para migraciones. No uses credenciales reales en las pruebas.

Con PostgreSQL local y una base desechable `amigo_secreto_test`, configura `DATABASE_URL_TEST` como se explica en E2.1 y ejecuta `npm run test:auth` y `npm run test:db`. El flujo de E1.1 continúa en sus rutas de demo y usa sus propios datos ficticios.

## E2.3 · Partidas reales de desarrollo

Usa una rama de desarrollo o PostgreSQL local desechable. Mantén `DATABASE_URL_DEV` directa para emitir migraciones, configura `AUTH_PEPPER` y asigna a `AUTH_ORIGIN` la dirección exacta que abrirás en el navegador. No hace falta usar datos sembrados para crear una partida.

```sh
npm ci
npm run db:migrate
npm run dev
```

1. Abre `/partidas`, configura el intercambio y define tu PIN. Guarda el enlace privado del organizador cuando aparezca.
2. Abre el panel `/partidas/organizar` y genera el enlace general. Copia el enlace o abre el botón de WhatsApp para seleccionar el destinatario y enviar tú el mensaje.
3. Abre el enlace general en otro perfil del navegador o en otro dispositivo. Solicita la inscripción, sigue el enlace de activación y guarda tu enlace privado.
4. En el panel, aprueba o rechaza la solicitud. Actualiza `/acceso/cuenta` en el dispositivo del participante para consultar el estado. También puedes agregar una persona manualmente y darle un enlace de activación.
5. Para probar desde otros dispositivos en la misma red de desarrollo, configura `AUTH_ORIGIN=http://IP_LOCAL:3000`, inicia con `npm run dev -- --hostname 0.0.0.0` y abre esa misma dirección en todos los dispositivos. Con HTTP en red local usa nombres y PIN ficticios. Si el navegador bloquea el portapapeles, copia el enlace desde el campo de texto.

Generar un enlace general nuevo invalida el anterior. Una invitación general dura 30 días. Una invitación personal sigue durando 24 horas y se reemplaza al regenerarla. El panel no muestra de nuevo los enlaces ya emitidos después de recargar. Los datos de la partida y los estados sí se recuperan de PostgreSQL.

### Pruebas de E2.3

Con la base de pruebas local configurada, ejecuta `npm run test:registration`. Para Chromium usa una aplicación local conectada a una base desechable y un `AUTH_ORIGIN` igual a `E2E_ORIGIN`. El recorrido de navegador crea una partida ficticia en esa base.

```sh
npx playwright install chromium
E2E_ORIGIN=http://localhost:3000 npm run test:registration:browser
```

E1.1 sigue en las rutas de demostración. E2.3 guarda la configuración de listas de deseos y adivinanzas para etapas posteriores.

## E2.4 · Recuperación con cuentas ficticias

Aplica las migraciones en una base de desarrollo desechable con `npm run db:migrate`. Mantén la configuración de `AUTH_ORIGIN` y `AUTH_PEPPER` descrita en E2.2 y arranca con `npm run dev`.

1. Desde `/partidas` crea una partida ficticia. Guarda el código y el enlace privado del organizador. Haz lo mismo al activar un participante ficticio.
2. En otro perfil del navegador abre `/acceso` y elige **Olvidé mi PIN o perdí mi enlace**. Introduce el código, confirma un PIN nuevo y guarda los datos nuevos. Prueba también **dispositivo prestado** y comprueba que la sesión anterior se cerró.
3. Para probar asistencia, en el panel del organizador abre la fila de un participante activado, marca la verificación presencial y confirma **Generar enlace de recuperación**. Abre ese enlace en un perfil sin otra sesión y deja que el participante elija su PIN. El enlace vence en 15 minutos.
4. Desde **Mi acceso**, confirma tu PIN para generar otro código personal. Esto reemplaza el anterior. Las cuentas creadas antes de E2.4 deben hacer este paso para obtener su primer código.

Las pruebas de integración usan PostgreSQL desechable y `DATABASE_URL_TEST`. Ejecuta `npm run test:recovery`. Para el recorrido de Chromium instala el navegador con `npx playwright install chromium`, levanta la aplicación local sobre una base desechable y ejecuta `E2E_ORIGIN=http://localhost:3000 npm run test:recovery:browser`. Usa el mismo origen para la app y la prueba.

### Retención de seguridad

`AUTH_ATTEMPTS_RETENTION_DAYS` conserva los contadores durante 7 días tras su vencimiento. `AUTH_EVENTS_RETENTION_DAYS` conserva los eventos durante 90 días. Ambos valores aceptan entre 1 y 3650 días. En desarrollo, `npm run auth:cleanup` muestra únicamente conteos. `npm run auth:cleanup -- --apply` elimina únicamente las filas fuera de plazo. Programa la limpieza en producción con una tarea autorizada y credenciales de mantenimiento antes del despliegue.

El administrador debe verificar presencialmente a la persona y entregar el enlace en privado. Sin un canal de identidad independiente, quien controla la entrega del enlace puede canjearlo y suplantar al destinatario. El administrador único debe guardar su código personal. Una cuenta antigua de administrador que haya perdido enlace, PIN y sesión antes de emitir su código carece de un mecanismo automático de recuperación.

## E3.1 · Probar sorteos ficticios

Usa una base de desarrollo y configura el acceso como en E2.3. Desde `/partidas`, crea un evento ficticio, agrega cuatro personas y cierra las inscripciones. Prueba **Agregar exclusión** y **Comprobar viabilidad**. Confirma **Ejecutar sorteo** y recarga para ver la versión. Si dejas a una persona excluida de todas las demás, el panel indicará que el reparto es imposible.

**Repetir sorteo** crea otra versión con las mismas reglas. **Anular para editar exclusiones** invalida el reparto vigente, conserva el historial y permite ajustar las reglas antes de ejecutar otro. La cuenta de una persona activada muestra el aviso de nueva versión. La apertura se prueba con el flujo de E3.2 descrito abajo.

Ejecuta `npm run test:draw` para las pruebas exhaustivas, estadísticas y de rendimiento. Con `DATABASE_URL_TEST` apuntando a PostgreSQL local desechable, ejecuta `npm run test:draw:db`. Para Chromium, arranca la aplicación local con una base desechable y ejecuta `E2E_ORIGIN=http://localhost:3000 npm run test:draw:browser`.

## E3.2 · Probar el sobre y los deseos

1. Arranca la aplicación con la configuración de desarrollo de E2.3. En `/partidas`, crea una partida ficticia con listas de deseos habilitadas.
2. Agrega tres familiares ficticios desde el panel y genera un enlace personal para cada uno. Activa cada cuenta desde una ventana independiente y conserva sus enlaces privados y PIN de prueba.
3. Antes del sorteo, guarda deseos desde varias cuentas. Cierra las inscripciones y ejecuta el sorteo desde el panel.
4. En `/acceso/cuenta`, abre el sobre y pulsa **Ver sus deseos**. Vuelve a entrar desde otro dispositivo con el enlace y PIN de esa misma persona para verificar **Consultar mi sobre** y sus deseos guardados.
5. Deja una cuenta abierta. Desde el panel, elige **Repetir sorteo** y confirma. Al detectar el cambio, la cuenta muestra un sobre cerrado. **Anular para editar exclusiones** devuelve la cuenta al estado de espera.

Para integración, apunta `DATABASE_URL_TEST` a una base PostgreSQL local desechable y ejecuta `npm run test:participant:db`. Para navegador, arranca la app con una base de desarrollo desechable y ejecuta `E2E_ORIGIN=http://localhost:3000 npm run test:participant:browser`. Las pruebas crean partidas ficticias.

## E4.1 · Probar con dos dispositivos

1. Configura la base de desarrollo y aplica `npm run db:migrate` con su conexión directa. Arranca con `npm run dev`.
2. Crea una partida ficticia en `/partidas`, agrega al menos tres participantes, cierra las inscripciones y ejecuta el sorteo.
3. En el panel del organizador, genera y copia el **Enlace de presentación**. Ábrelo en otro navegador, perfil o dispositivo. Si pruebas desde dos dispositivos en tu red, configura `AUTH_ORIGIN` con la dirección accesible desde ambos y arranca Next con `npm run dev -- --hostname 0.0.0.0`.
4. Desde el panel, inicia el intercambio y el siguiente turno. Si activaste adivinanzas, registra una respuesta o pulsa **Continuar sin adivinanza**. Confirma **Revelar identidad** y marca la entrega. Prueba pausar, posponer y retomar antes de completar las entregas restantes.
5. Recarga ambas pantallas o desconecta temporalmente la presentación. Al volver, recuperarán el progreso guardado. Finaliza el intercambio para ver el resumen. Revoca el enlace para cerrar el acceso de presentación.

Con `DATABASE_URL_TEST` apuntando a PostgreSQL local desechable, ejecuta `npm run test:reveal:db`. Para Chromium, usa una app local con una base desechable y ejecuta `E2E_ORIGIN=http://localhost:3000 npm run test:reveal:browser`. Si también quieres que la prueba arranque y reinicie Next, proporciona `E41_WEB_DIR` con la ruta de una copia de trabajo desechable, `DATABASE_URL_DEV` con la conexión PostgreSQL local ya migrada y un `AUTH_PEPPER` dedicado a pruebas. Ese modo usará el puerto de `E2E_ORIGIN`, que debe estar libre antes de iniciar.

## E4.2 · Ver la presentación en el televisor

Sigue el flujo de dos dispositivos de E4.1. Abre el enlace en el televisor o en un navegador conectado a él y pulsa **Pantalla completa** si está disponible. Desde el celular puedes avanzar mientras el televisor muestra los turnos. Para ver cada entrada, espera a que aparezca en pantalla antes de iniciar el paso siguiente. Al recargar, la presentación recupera la escena actual. Con **Omitir efectos** o con movimiento reducido del sistema, muestra los resultados de inmediato.

Ejecuta `npm run test:presentation` para las comprobaciones de revisiones y reconexión. `npm run test:reveal:browser` recorre el intercambio con dos navegadores independientes y `npm run test:reveal:db` comprueba los permisos del motor.

## E5.1 · Preparación del despliegue

El procedimiento de Preview, las variables separadas, la revisión de migraciones y el plan de restauración están en la [guía de operación E5.1](docs/E5.1-operacion.md). La integración local se valida en PostgreSQL desechable. Los despliegues de prueba utilizan cuentas ficticias y un proyecto Neon aislado.
