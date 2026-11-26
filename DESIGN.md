# Amigo Secreto — Sistema visual y experiencia UX

**Versión:** 1.0 · **Fecha:** 2026-11-23

## 1. Concepto creativo

**«Una Navidad llena de secretos»**. Una experiencia digital navideña **elegante, cálida, moderna y festiva**. Debe producir expectativa y alegría, sin parecer un portal corporativo decorado ni un videojuego infantil. Diseño *mobile-first*, simple para todas las edades, pero con movimiento e interactividad cuidados.

### Palabras guía

Calidez, misterio, celebración, lujo discreto, sencillez, accesibilidad, detalle artesanal contemporáneo.

### Evitar

Rojo y verde saturados en todas las pantallas; brillos constantes; nieve permanente sobre formularios; animaciones que retrasen acciones; efectos 3D pesados; textos pequeños; navegación escondida; emojis como único sistema de iconos; estética corporativa plana o temática infantil excesiva.

## 2. Tokens iniciales

| Token | Valor | Uso |
|---|---|---|
| `forest` | `#173F35` | Cabeceras, tarjetas protagonista, fondos de celebración |
| `wine` | `#A7433F` | CTA y énfasis navideño |
| `gold` | `#CFAB69` | Ornamentos, detalles, estrellas, indicadores especiales |
| `ivory` | `#F7F2E8` | Fondo base |
| `charcoal` | `#27342F` | Texto principal |
| `surface` | `#FFFFFF` | Formularios y tarjetas legibles |

Son tokens iniciales aprobados como dirección visual, **no una obligación de usarlos sin verificar contraste**. Ajustar tonos de texto, bordes y estados para que superen las comprobaciones de accesibilidad. El dorado es decorativo, no debe ser la única señal de estado.

**Tipografía:** DM Sans o Inter para interfaz y formularios; Fraunces (o serif editorial similar) **solo** para titulares grandes en bienvenida, sobre y revelación. Usar alternativas del sistema si falla la carga de fuentes.

**Espaciado:** escala consistente de 4/8/12/16/24/32 px; tarjetas con bordes redondeados de 12–20 px, sombras suaves; uso generoso de espacio vacío.

## 3. Diseño de interfaz

### Componentes compartidos

- `AppShell`: encabezado, navegación, fondo y ancho responsivo.
- `ChristmasButton`: primario, secundario, peligro, deshabilitado, carga.
- `FestiveCard`: superficie, ilustración opcional, icono y llamada a la acción.
- `SecretEnvelope`: estados cerrado, abriendo y abierto.
- `WishlistForm`: edición rápida con feedback de guardado.
- `ParticipantRow`: nombre, estado, acciones autorizadas.
- `StatusPill`: estado de acceso/inscripción/sorteo (texto + color + icono).
- `FestiveModal`: confirmación de acciones críticas; enfoque y teclado accesibles.
- `RevealStage`: escena pública a pantalla completa.
- `RevealController`: control del organizador en teléfono o escritorio.
- `EmptyState`: mensaje útil para no inscritos, sin sorteo o sin deseos.

### Jerarquía

- Una acción principal evidente por pantalla.
- Encabezado claro, instrucciones breves, información agrupada.
- Botones táctiles de mínimo 44 × 44 px; tamaño base de texto cercano a 16 px.
- No depender de hover o drag. Siempre ofrecer acciones de toque/clic.
- Mostrar siempre el estado real: pendiente, aprobado, sin activar, sorteado, en revelación, etc.

### Navegación del participante

Bienvenida → Inscripción/activación → PIN y sesión → Espera/aprobación → Inicio → Mi sobre / Mis deseos / Deseos de mi asignado → Evento presencial.

El sobre debe explicar expresamente «Te tocó regalarle a...» y conservar el estado `ya abierto`, para no imponer animaciones repetidas.

### Navegación del organizador

Dashboard con estado y CTA contextual → Personas → Configuración / Restricciones → Validación del sorteo → Confirmación → Control de revelación. La persona organizadora que participa puede cambiar a «Mi partida» para ver su propia experiencia sin privilegios sobre asignaciones ajenas.

### Vista pública

Modo televisor con tipografías grandes, composición centralizada, contraste alto, sin controles ni datos privados. En pantalla pequeña el mismo flujo debe funcionar de manera secuencial sin necesitar un segundo dispositivo.

## 4. Animación como lenguaje de interacción

| Momento | Efecto | Duración orientativa |
|---|---|---|
| Tap en botón | respuesta táctil sutil (escala/tono) | 100–160 ms |
| Cambio de tarjeta | entrada ligera con opacidad/desplazamiento | 180–250 ms |
| Modal | transición de opacidad y escala suave | 180–260 ms |
| Sobre secreto | abrir sello, desplegar sobre, revelar nombre | 800–1.200 ms |
| Revelación de identidad | anticipación breve + nombre + partículas puntuales | 1–2 s, omisible |
| Guardado | cambio de estado + confirmación visible | inmediato |

**Reglas:** Motion para transiciones; limitar animaciones a `transform` y `opacity` cuando sea posible; no bloquear controles en procesos largos; las animaciones no sustituyen información textual; no reproducir efectos sonoros automáticamente. Preferencia `prefers-reduced-motion` debe desactivar o simplificar movimiento manteniendo la función completa. Respetar los estados reales de servidor; una animación jamás autoriza revelar datos.

## 5. Ilustraciones y recursos

Imágenes selectivas de regalos, sobres, ramas, lazos, estrellas y pequeños ornamentos. Consistencia entre imágenes; SVG/CSS para elementos interactivos; recursos comprimidos y con dimensiones definidas; no cargar ilustraciones enormes para cada tarjeta. Diseñar con estilo original y no depender de marcas de terceros. Una estética festiva puede obtenerse con CSS y pocos recursos gráficos cuidadosamente elegidos.

## 6. Accesibilidad y adaptación

- Contraste WCAG AA como objetivo práctico: 4.5:1 para texto normal; 3:1 para elementos visuales relevantes y texto grande cuando corresponda.
- Enfoque de teclado visible; secuencia lógica; componentes semánticos; campos etiquetados; errores asociados a campos.
- No solo color para indicar estados; icono o texto de apoyo.
- Pantallas de bienvenida y revelación compatibles con 320 px a gran formato, evitando desplazamiento horizontal.
- Mensajes claros, sin jerga técnica; evitar tareas de memoria (volver a explicar PIN/acceso).
- Celebraciones con opción de saltar; sin destellos frecuentes, audio automático ni efectos constantes.
- Formularios simples, especialmente en registro y PIN, con modos de entrada adecuados.

## 7. Estados y tratamiento visual

- `loading`: indicador breve + texto sin saltos de diseño.
- `empty`: explicar qué sucederá y CTA contextual.
- `error`: texto comprensible y alternativa de recuperación; nunca exponer datos técnicos internos.
- `success`: confirmación visible (sin depender solo de color).
- `disabled`: informar por qué la acción no está disponible (ej. «Las inscripciones están cerradas»).
- `sensitive`: no mostrar nombre asignado en notificaciones, miniaturas, pantalla pública o vistas previas.

## 8. Criterios de aceptación visual E1

- Navegación completa entre pantallas ficticias mediante botones reales, sin controles inertes.
- Apariencia consistente en móvil y escritorio; no hay desbordamientos.
- Sobre interactivo con estado abierto/cerrado y opción de omitir/reproducir animación.
- Simulación de revelación con control y pantalla pública, marcadas claramente como **datos ficticios**.
- Las personas pueden completar el prototipo sin hover, solo con clic/tap y teclado.
- Movimiento reducido funcional y lectura clara.

## 9. Instrucción de diseño para Codex

Priorizar **acabado visual real** desde E1: sistema de tokens, componentes reutilizables, estados creíbles y animaciones cuidadas; no generar un CRUD genérico ni pantallas de administración con estilo desconectado de las pantallas navideñas. Mantener simplicidad de uso para todas las edades.

## 10. Aplicación visual en E1

La invitación y el sobre comparten una ilustración de papel y sello hecha con CSS. La escena pública usa texto de gran formato y separa la navegación de la escena de revelación. La etiqueta «Datos ficticios» acompaña el recorrido.

## 11. Refinamiento E1.1

La bienvenida, el acceso y el inicio del participante comparten la escena de papel, sello y ornamentos. En el inicio, el sobre ocupa la tarjeta principal. Los deseos, participantes y datos del encuentro quedan en superficies claras de apoyo. El organizador tiene una cabecera y un recorrido por preparación, inscripciones, sorteo y revelación. Sus enlaces llevan a cada sección e indican la etapa actual.

Al abrir el sobre, el sello se desvanece, se levanta la solapa y aparece la tarjeta con el nombre. La secuencia se puede omitir y repetir. Con movimiento reducido, el resultado aparece directamente.

## 12. Acceso privado E2.2

La activación y el acceso usan tarjetas y botones del sistema visual existente. Cada campo de PIN se enmascara, usa teclado numérico y muestra su formato junto al campo. Al elegir un PIN nuevo se indican los seis dígitos y que puede comenzar por cero. La activación muestra el código de recuperación, y la vista de cuenta muestra el cierre de sesión y el aviso de dispositivo prestado.

## 13. Partidas reales E2.3

Las pantallas reales y la demo tienen navegación diferenciada. La creación y la invitación reutilizan el sobre y las tarjetas del sistema visual. El panel muestra pendientes, confirmados e historial con estados textuales, y las operaciones que cambian acceso o inscripciones requieren confirmación.

## 14. Recuperación E2.4

La pantalla de acceso enlaza a la recuperación en lenguaje directo. Las mismas tarjetas y los mismos campos numéricos de PIN se reutilizan para código personal y enlace asistido. El éxito muestra el código nuevo una sola vez. El panel del organizador pide verificación presencial y confirmación antes de entregar un enlace temporal.

## 15. Sorteo E3.1

El panel muestra el número de personas elegibles, las exclusiones y el estado del sorteo. Generar, repetir y anular usan el diálogo de confirmación existente. Cuando hay nombres iguales se muestra una referencia corta para distinguirlos. El aviso de repetición en la cuenta solo muestra la versión.

## 16. Sobre y deseos E3.2

La cuenta real reutiliza la escena del sobre de E1.1. En la primera apertura, el sello se desvanece, la solapa gira y la tarjeta aparece en unos 860 ms. Se ofrece omitir la animación y reproducirla a voluntad. Con movimiento reducido, el resultado se presenta de inmediato. Los formularios de deseos comparten campos con la demo. Al consultar deseos del destinatario, el foco pasa al encabezado de la lista.

## 17. Presentación independiente E4.1

La pantalla de presentación reutiliza la escena de E1.1 con fondo verde, ornamento y tipografía editorial de gran formato. El nombre de quien recibe encabeza cada turno. La tarjeta del regalador aparece junto con el resultado de la adivinanza tras la confirmación. Entre turnos queda visible la última entrega. El panel usa botones con texto y diálogos para iniciar, revelar y finalizar. Durante una reconexión, un mensaje discreto identifica que sigue visible la última actualización recibida.

## 18. Puesta en escena E4.2

La presentación ocupa la pantalla con un marco fino, luz cálida sobre verde bosque y un regalo de papel vino con lazo dorado. La composición da el mayor tamaño al nombre que corresponde al momento del intercambio. Una tarjeta marfil destaca a quien regala después de la confirmación. La pausa se superpone al turno sin perder el contexto. El cierre reúne las parejas en una o dos columnas fluidas y presenta los totales con etiquetas.

Motion acompaña las transiciones con entradas breves. Al revelar, la tapa se alza, aparece la tarjeta y salen doce partículas de una sola vez. El cierre tiene una celebración breve. Los controles de presentación permiten omitir efectos y usar pantalla completa cuando el navegador la admite. El panel móvil prioriza la acción del turno y agrupa pausa y posposición en segundo plano.

El acceso pide «Tu nombre» y «Tu PIN». Si se abre sin el contexto de una partida, también pide el nombre de la partida. Una sesión vigente lleva directamente a «Mi partida».
