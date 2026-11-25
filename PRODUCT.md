# Amigo Secreto — Especificación de producto

**Versión:** 1.0 · **Fecha:** 2026-11-23 · **Estado:** Diseño funcional acordado; detalles marcados como «propuesta» son ajustables.

## 1. Visión

Aplicación web navideña para organizar un amigo secreto familiar: registro sencillo, sorteo privado, listas de deseos y revelación presencial guiada desde la aplicación. Debe funcionar bien en teléfonos de distintas gamas y ser comprensible para personas de todas las edades. Inicialmente es un proyecto familiar, pero su diseño permitirá múltiples partidas y grupos.

**Principios:** sencillez primero; misterio antes de la revelación; una experiencia festiva y elegante; acceso privado sin exigir correo electrónico; buena recuperación ante errores e interrupciones.

## 2. Alcance por entregas

| Entrega | Entra | No entra todavía |
|---|---|---|
| E1 — Prototipo visual | Pantallas navegables, diseño responsive, estados simulados, sobre y revelación animados con datos ficticios | Persistencia, autenticación real, sorteo real, servicios externos |
| E2 — Partidas y acceso | Creación/gestión de partidas, inscripción y aprobación, registro manual, invitaciones personales, PIN, sesiones y recuperación asistida | Mensajería, alertas automáticas |
| E3 — Juego clásico | Restricciones, validación de factibilidad, sorteo privado, listas de deseos, sobre individual | Pistas y mensajes anónimos |
| E4 — Revelación | Modo presentador y vista pública, orden de turnos, adivinanzas opcionales, revelación controlada, pausa y reanudación, resumen | Efectos de sonido obligatorios, funciones de streaming |
| E5 — Validación y publicación | Pruebas funcionales, seguridad, accesibilidad, móviles, despliegue | Facturación, monetización |
| Posterior | Mensajería anónima, pistas, enlaces/fotos en listas, notificaciones, más personalización | No bloquear el lanzamiento por estas funciones |

## 3. Roles

### Organizador (exactamente uno por partida)
- Crea y configura la partida; opcionalmente participa como jugador.
- Comparte invitación general; agrega, edita, aprueba, rechaza y retira participantes antes del sorteo.
- Cierra inscripciones, configura exclusiones, solicita validación y ejecuta el sorteo.
- Puede invalidar y repetir el sorteo **solo antes de iniciar la revelación**, con confirmación y aviso inequívoco de que las asignaciones antiguas dejan de valer.
- Inicia y controla la revelación: avanzar, registrar respuesta, revelar, posponer, pausar y finalizar.
- Puede iniciar recuperación de accesos mediante un proceso asistido; nunca recibe una pantalla de consulta global de asignaciones privadas.
- Si participa, solo ve su propia asignación en su vista personal.

### Participante
- Solicita inscripción o activa una invitación de registro manual; establece PIN y usa su acceso privado.
- Consulta datos generales y lista de participantes confirmados.
- Edita sus propios deseos; después del sorteo consulta el destinatario que le correspondió y sus deseos.
- Participa en la revelación presencial, con o sin celular personal.
- No ve quién le regalará antes de la revelación autorizada.

### Participante asistido
- El organizador lo agrega y le proporciona un enlace individual de activación.
- Puede activar y usar su acceso privadamente en un teléfono prestado, con cierre explícito de sesión. No requiere sobres físicos.
- La activación de cuentas de otros **no** debe ocurrir silenciosamente desde la sesión del organizador. Es una experiencia asistida; no garantiza que el organizador no pueda suplantar si obtiene el enlace y el PIN o controla el proceso de recuperación.

## 4. Configuración de partida

**Campos:** nombre de la partida; fecha y hora del encuentro (zona `America/Bogota` por defecto como propuesta); presupuesto sugerido en COP (importe o rango); participación opcional del organizador; activación de listas de deseos (por defecto sí); adivinanzas en revelación (por defecto sí); mensajes anónimos y pistas (desactivados hasta su entrega posterior).

**Reglas básicas:** mínimo 3 participantes confirmados; cada persona debe regalar exactamente a una y recibir exactamente de una; nunca a sí misma; las exclusiones se respetan. Restricciones entre parejas son bidireccionales desde el panel. El juego puede existir con participantes confirmados sin activar su acceso. El administrador debe ver advertencias sobre esas personas antes del evento.

## 5. Ciclo de vida

`INSCRIPCIONES_ABIERTAS → INSCRIPCIONES_CERRADAS → SORTEADO → REVELACION_EN_CURSO → FINALIZADO`

- Abiertas: el organizador gestiona participantes; se permiten solicitudes de registro.
- Cerradas: se resuelven pendientes; se revisan exclusiones; puede reabrirse antes de sortear.
- Sorteado: asignaciones privadas, sobres activos, deseos editables hasta iniciar la revelación; participantes bloqueados.
- Revelación en curso: sin modificación de participantes, reglas ni sorteo; deseos bloqueados; progreso guardado.
- Finalizado: resumen e identidades reveladas, siempre bajo las reglas de visibilidad de la partida.

Un nuevo sorteo antes de la revelación crea una **nueva versión**: invalida enlaces/resultados de asignaciones previas y fuerza a los usuarios a reconocer que han cambiado. Nunca debe hacer un cambio silencioso.

## 6. Registro y acceso

### 6.1 Registro por enlace general
1. El organizador comparte enlace general por WhatsApp.
2. La persona ve fecha, presupuesto y reglas esenciales.
3. Escribe su nombre y solicita unirse; recibe un acceso privado y establece un PIN de 6 dígitos. Su estado queda `PENDIENTE`.
4. El organizador comprueba que pertenece al grupo y aprueba o rechaza.
5. Una vez aprobada, puede entrar con el mismo acceso.

### 6.2 Registro manual por organizador
1. El organizador añade el nombre; el registro queda `CONFIRMADO_SIN_ACTIVAR`.
2. Genera un enlace individual de activación de un solo uso y lo entrega al familiar.
3. El familiar activa su cuenta, crea PIN y pasa a `CONFIRMADO_ACTIVO`.
4. La persona participa en el sorteo incluso si no activa la cuenta todavía; para conocer su asignación deberá activar un acceso privado.

**Duplicados:** una persona con el mismo nombre no reclama automáticamente un registro preexistente. En caso de coincidencia, el organizador valida y entrega la invitación del registro original. Los nombres visibles no son identificadores de autenticación.

**Acceso temporal:** modo para dispositivo prestado, con expiración corta, cierre de sesión explícito y `no-store` en respuestas sensibles. **Recuperación:** el organizador solo inicia una invitación de reactivación de un solo uso, tras verificar por fuera de la aplicación la identidad del familiar. El organizador requiere además un código de recuperación individual generado al crear su partida (propuesta para evitar quedar bloqueado si pierde su acceso). Sin un factor externo verificable no puede garantizarse resistencia absoluta frente a suplantación por un organizador malicioso: límite conocido del producto.

## 7. Sorteo y restricciones

- Solo participan registros `CONFIRMADO_*` y, si corresponde, el organizador inscrito como jugador.
- El servidor comprueba que hay solución válida antes de ejecutar el sorteo; si no la hay muestra recomendaciones sobre qué restricciones revisar.
- La asignación usa un generador aleatorio criptográficamente seguro; evitar elecciones deterministas y sesgos intencionales. La estrategia concreta se detallará y probará en E3.
- Se guarda **atómicamente** una asignación por regalador y por destinatario en cada versión.
- El organizador ve confirmación de sorteo y cuántos sobres se han consultado, pero no las parejas ocultas.
- Texto de interfaz: **«Te tocó regalarle a [nombre]»**, no «Tu amigo secreto es [nombre]», para evitar ambigüedad.
- Abrir un sobre se registra como evento de consulta, sin exponer la asignación a terceros. El participante puede volver a consultarla sin repetir la animación.

## 8. Listas de deseos

Campos ligeros: «Qué me gustaría recibir», «Cosas que me gustan», «Qué preferiría no recibir» (opcional). No exigir completarlos para participar. El dueño edita sus datos; su regalador asignado puede verlos después del sorteo. No se muestran indiscriminadamente a todos los jugadores. Después del inicio de la revelación quedan bloqueados.

## 9. Revelación presencial guiada

**Modalidad elegida:** un administrador dirige el juego. Puede mostrar una vista pública en televisor/computador o usar un único dispositivo. La pantalla pública **no** debe recibir nombres de regaladores antes de que se autorice su revelación.

Flujo por turno:
1. Al iniciar el evento, el servidor crea y guarda un orden aleatorio de **destinatarios**.
2. Se anuncia al destinatario actual; si no está presente, el organizador puede posponerlo sin perderlo.
3. Con «Adivina quién» activado, el destinatario anuncia su hipótesis y el administrador registra la respuesta de la lista de participantes (sin ver aún la verdadera asignación).
4. El organizador confirma «Revelar»; el servidor cambia el estado del turno y entonces la pantalla pública recibe la identidad del regalador.
5. Animación, resultado de adivinanza y entrega del regalo.
6. El organizador marca el turno como concluido y continúa.

Reglas: reanudar desde el último estado confirmado; no revelación automática por calendario; una identidad publicada ya no puede ocultarse realmente; si se cae la conexión no duplicar avances; no permitir reiniciar el sorteo una vez iniciada la revelación. Los resultados de turnos concluidos quedan visibles para quienes tengan autorización. En una partida con todas las revelaciones completadas se puede mostrar un resumen final.

**Sincronización inicial propuesta:** consultas periódicas al servidor para la vista pública, con intervalos discretos; no son necesarios WebSockets en E4.

## 10. Pantallas y rutas lógicas

| Sección | Pantallas |
|---|---|
| Públicas | Inicio general, bienvenida de partida, formulario de solicitud, información del juego |
| Activación/acceso | Activación de invitación personal, crear/confirmar PIN, iniciar sesión, sesión temporal, recuperación |
| Participante | Sala de espera/estado, inicio de partida, abrir/consultar sobre, mis deseos, deseos de mi asignado, participantes |
| Organizador | Crear partida, dashboard, configuración, invitaciones, pendientes, participantes, exclusiones, validación de sorteo, confirmar sorteo, gestión de accesos, control de revelación |
| Evento | Pantalla pública, adivinanza, revelación animada, resumen final |

**Comportamientos globales:** botones visibles con etiquetas claras, estados de carga/errores, navegación mediante clic/tap, indicador del estado de partida, conservación de avances. Sin actualización de datos sensibles en notificaciones o vistas previas de WhatsApp.

## 11. Reglas de privacidad

- El organizador no tiene endpoint ni tabla de interfaz para consultar todas las asignaciones ocultas.
- Cada participante solo consulta su propia asignación y la lista de deseos de su destinatario.
- La pantalla pública únicamente obtiene datos públicos o ya revelados.
- Token individual + PIN son credenciales: no incluirlos en analítica, logs, capturas de errores o textos de notificaciones.
- Compartir enlace no debe bastar para leer un resultado: hay que validar también el PIN/sesión.
- El modo de recuperación asistida es una excepción que requiere controles y advertencias; no prometer anonimato absoluto ante un administrador con capacidad de suplantación.

## 12. Aceptación del MVP (E1–E4)

- Un usuario nuevo entiende qué hacer sin tutorial.
- El organizador registra manualmente y valida solicitudes; nadie aparece dos veces por una recuperación.
- El sorteo no permite autoselección, duplicados ni exclusiones prohibidas; rechaza configuraciones imposibles.
- Los participantes ven exclusivamente sus asignaciones privadas; una cuenta ajena o la pantalla pública no puede obtenerlas.
- La revelación se pausa y continúa; el televisor muestra la identidad únicamente tras la autorización.
- El sitio es utilizable con teléfono de gama media, teclado y preferencia de movimiento reducido.
- El juego funciona sin mensajes ni pistas; las dinámicas posteriores no alteran su núcleo.

## 13. Decisiones ya aprobadas / detalles abiertos

**Aprobado:** juego clásico con extras opcionales; revelación presencial guiada; inscripción híbrida; una persona administradora por partida; acceso individual mediante enlace + PIN de 6 dígitos; participación asistida con celular prestado; sin sobres físicos; estética navideña elegante y moderna; stack definido en `ARCHITECTURE.md`.

**Propuestas técnicas a validar durante implementación:** límite máximo de participantes por partida; expiración concreta de invitaciones/sesiones; política precisa de bloqueos; mecanismo de recuperación del organizador; intervalo de sincronización; estrategia de selección aleatoria uniforme bajo restricciones. No inventar decisiones de producto adicionales sin documentarlas.

## 14. Guion de demostración E1

La demo recorre inscripción y gestión en una sola pestaña. El sobre personal corresponde al perfil ficticio de Valentina y la revelación usa un elenco fijo de cuatro personas. Las altas de prueba y la configuración de participación del organizador ilustran la gestión sin cambiar ese elenco.

E1.1 refina la presentación del mismo guion. El sobre es la acción principal del participante y el organizador puede saltar entre las cuatro etapas desde una guía de navegación.

## 15. Base de datos E2.1

La primera parte de E2 incorpora el modelo y las operaciones de datos de partidas e inscripciones. Los comandos de desarrollo permiten probar la persistencia con una partida ficticia independiente de la demo visual. La identidad y los permisos de uso se incorporarán en la siguiente entrega, previa revisión.

## 16. Acceso privado E2.2

Una invitación individual activa el acceso de un participante confirmado. El usuario crea y confirma su PIN y guarda un enlace privado distinto para accesos posteriores. La cuenta permite cerrar sesión y cambiar el PIN con el PIN vigente. El dispositivo prestado acorta la sesión y evita una cookie persistente. La demo visual se mantiene separada.

## 17. Gestión real E2.3

El organizador crea el evento, obtiene un acceso propio y comparte una invitación general. El registro individual entrega un acceso personal que permite consultar la decisión sin otorgar acciones de participante confirmado. El registro manual confirma a la persona de inmediato. Los mensajes anónimos y las pistas se presentan como opciones de etapas futuras.

## 18. Recuperación de acceso E2.4

El participante y el administrador reciben un código personal de un solo uso al habilitar su acceso. El código permite elegir otro PIN y recibir un enlace privado nuevo. En su cuenta pueden reemplazar el código tras confirmar el PIN actual. El organizador puede emitir un enlace de recuperación para un participante activado de su partida tras verificarlo presencialmente. El participante elige su PIN en privado y el canje revoca los accesos anteriores. El administrador único se recupera con su código personal.

## 19. Sorteo real E3.1

El organizador puede comprobar la viabilidad y sortear una partida con 3 a 20 personas confirmadas. Se requiere cerrar las inscripciones y resolver todas las solicitudes pendientes. Las exclusiones son bidireccionales y solo reciben cambios sin un sorteo vigente. Repetir crea una versión nueva y la cuenta del participante muestra un aviso de revisión del sobre. Anular para editar conserva las versiones anteriores invalidadas y mantiene las inscripciones cerradas.

## 20. Sobre y deseos E3.2

La cuenta de una persona confirmada muestra un estado de espera hasta que exista un sorteo vigente. La primera apertura registra la consulta para esa versión. En futuras sesiones se puede consultar el mismo resultado directamente o repetir la animación de forma voluntaria. Un nuevo sorteo vuelve a cerrar el sobre. Una anulación devuelve la cuenta al estado de espera.

Cuando la partida tiene deseos habilitados, cada persona confirmada puede escribir y editar hasta 250 caracteres por campo. Su regalador puede consultar la lista después de abrir el sobre vigente. La edición se cierra al comenzar la revelación.

## 21. Revelación presencial E4.1

El organizador puede abrir una pantalla independiente con un enlace de presentación válido durante 12 horas. Antes de iniciar se muestra el nombre del evento y un estado de espera. El mismo enlace permite seguir el intercambio y ver el resumen de las entregas. Renovar o revocar el enlace desconecta los dispositivos que usan el anterior.

Al iniciar se fija el orden aleatorio de destinatarios y se cierran los cambios al sorteo y los deseos. El organizador inicia cada turno, puede posponerlo antes de revelar y elige cuándo retomarlo. Si están habilitadas las adivinanzas, registra una persona o elige continuar sin adivinanza. Después de confirmar y revelar, registra la entrega. El cierre es explícito y requiere todas las entregas completadas.

## 22. Experiencia de presentación E4.2

En el televisor se distinguen la espera, el inicio, la pregunta, el regalo listo, la identidad confirmada, la entrega y el cierre. Si se pierde la conexión, la pantalla muestra un aviso junto a la última vista. A los 15 segundos sin verificación reciente retira los datos del juego hasta recuperar el estado vigente. Cuando el enlace caduca o se revoca, muestra el acceso finalizado al recibir la respuesta del servidor.
