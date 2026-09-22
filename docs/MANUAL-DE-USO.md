# Manual de uso del panel

Para quien va a llenar TraumaHub de contenido: editores y administradores. No
hace falta saber informática. Los nombres entre «comillas» son los que aparecen
escritos en pantalla, tal cual.

Dos guías hermanas entran en más detalle y este manual no las repite:
[COMO-ESCRIBIR-UNA-FICHA.md](COMO-ESCRIBIR-UNA-FICHA.md), sobre cómo se redacta
una patología, y [COMO-SUBIR-UN-MODELO.md](COMO-SUBIR-UN-MODELO.md), sobre los
modelos 3D y los casos del simulador.

**Dirección de la plataforma:** https://ved.tailc2094f.ts.net:10000/traumahub

---

## 1. Lo que hay que saber antes de tocar nada

Si solo va a leer una sección, que sea esta. Son las seis cosas que más trabajo
hacen perder.

1. **Nada se guarda solo.** Ni en las fichas ni en el taller anatómico. Lo que
   no se guardó con un botón, no existe. Guarde seguido.
2. **Un borrador no lo ve ningún lector**, ni siquiera con el enlace directo.
   Para que algo se vea hay que pulsar «Publicar». Y al revés: puede guardar
   borradores a medias con toda tranquilidad.
3. **No abra la misma ficha en dos pestañas**, ni la edite a la vez que otra
   persona. La plataforma lo detecta y no deja pisar el trabajo ajeno, pero no
   mezcla las dos versiones: una de las dos hay que rehacerla a mano (sección 5).
4. **En los permisos por módulo, no marcar ninguno significa «todos»**, no
   «ninguno» (sección 9).
5. **Eliminar no se deshace.** Si solo quiere que algo deje de verse, use
   «Retirar de publicación» en una ficha o «Desactivar» en una cuenta.
6. **El taller anatómico y el armado de casos del simulador necesitan un
   computador.** En el teléfono no abren. Leer, corregir texto y revisar
   comentarios sí se puede desde el teléfono.

---

## 2. Quién puede hacer qué

| | Lector | Editor | Administrador |
|---|:-:|:-:|:-:|
| Leer lo publicado | sí | sí | sí |
| Entrar al panel | — | sí | sí |
| Crear, guardar, publicar, retirar y eliminar fichas | — | sí | sí |
| Taller anatómico | — | sí | sí |
| Ver y resolver comentarios | — | sí | sí |
| Eliminar comentarios | — | — | sí |
| Estadísticas y actividad de lectura | — | — | sí |
| Cuentas, solicitudes y permisos | — | — | sí |
| Difusión por correo, respaldos, sistema | — | — | sí |

El editor puede estar limitado a algunos módulos; el administrador ve y edita
siempre los cinco.

---

## 3. Entrar, salir y la contraseña

- Se entra por «Entrar», con correo y contraseña. Quien edita o administra ve en
  la portada el botón «Escribir contenido», que lleva al panel.
- La sesión dura **8 horas**. Tras **5 intentos fallidos** la cuenta se bloquea
  **10 minutos**; después se desbloquea sola.
- **Si olvidó la contraseña:** «Recuperar contraseña», en la pantalla de entrada.
  Llega un correo con un enlace que **caduca en una hora y sirve una sola vez**.
  Si no llega, mire la carpeta de **no deseados**; si tampoco está, pida a un
  administrador que se lo genere con el botón «Clave».
- Para volver del panel al sitio: «Volver a la plataforma», abajo en la barra
  lateral.

---

## 4. El panel, pantalla por pantalla

Barra lateral, grupo **«Trabajo»** (editores y administradores):

| Pantalla | Para qué |
|---|---|
| «Resumen» | El estado de todo de un vistazo: fichas por módulo, comentarios pendientes y avisos. |
| «Contenido» | Donde se escribe. Arriba los cinco **«Módulos»**, abajo el **«Material de apoyo»**. |
| «Taller anatómico» | Armar preparaciones del atlas 3D para ponerlas en las fichas. |
| «Comentarios» | Lo que los lectores escriben en las fichas: errores, sugerencias, correcciones. |

Grupos **«Seguimiento»** y **«Administración»** (solo administradores):
«Estadísticas», «Actividad», «Usuarios y permisos», «Difusión», «Respaldos» y
«Sistema». Van en las secciones 9 a 12.

> **Un guion «—» no es un cero.** En «Resumen», «Estadísticas» y «Actividad»,
> un guion significa que ese dato no se pudo consultar en ese momento. Recargue
> antes de sacar conclusiones.

---

## 5. Escribir una ficha

### El camino

1. «Contenido» → en la tarjeta del módulo, **«+ Nueva»**. (Desde dentro del
   listado, el mismo botón se llama «+ Agregar Patología», «+ Agregar
   Maniobra», etc.)
2. Rellene lo obligatorio, marcado en el formulario. Lo mínimo por módulo:

   | Módulo | Obligatorio |
   |---|---|
   | Patologías | «Nombre de la patología», «Segmento anatómico» |
   | Maniobras | «Nombre de la maniobra», «Segmento», «Qué evalúa», «Técnica», «Qué se considera positivo» |
   | Casos AO | «Título del caso»; en cada paso: «Título del paso», «Qué se hace», «Principio AO en juego» |
   | Cirugías simuladas | «Nombre del caso»; en cada paso del guion: «Título del paso», «Qué se evalúa» |
   | Estudios de demostración | «Nombre del caso» |

3. **«Guardar borrador»** cuantas veces haga falta.
4. **«Publicar»** cuando esté lista. Aparece «Publicado. Ya es visible para los
   lectores.»
5. **«Ver publicado ↗»** la abre en otra pestaña, tal como la ve el lector.

**Antes de la primera ficha hay que crear los segmentos** («Contenido» →
«Material de apoyo» → «Segmentos anatómicos» → «Gestionar»): patologías y
maniobras no se pueden guardar sin uno. Numere el «Orden de aparición» de diez
en diez (10, 20, 30) para poder intercalar después.

### Borrador y publicación

- «Guardar borrador» es indulgente: deja guardar con campos vacíos. «Publicar»
  lo exige todo. Si falta algo, la pestaña culpable lleva un **«!»** y el editor
  salta a ella.
- En una patología, **una pestaña vacía no se muestra** al lector. Se puede
  publicar con tres pestañas escritas y completar el resto después.
- **«Retirar de publicación»** (al pie de la ficha) la devuelve a borrador sin
  borrar nada.
- **Para corregir una ficha ya publicada**, haga el cambio y pulse «Publicar» de
  nuevo. Mientras solo pulse «Guardar borrador», el lector no ve la corrección.

### Los bloques

Las pestañas de contenido se llenan apilando bloques con **«+ Agregar bloque»**.
Cada uno se pliega (▾), se mueve (↑ ↓) y se quita (✕).

| Bloque | Úselo para |
|---|---|
| «Texto» | Casi todo. Párrafos con formato. |
| «Lista clínica» | Puntos con una idea en negrita y su desarrollo. |
| «Tabla de clasificación» | Código o tipo + descripción (AO, Garden, Gustilo…). |
| «Advertencia» | «Atención», «Error frecuente» o «Perla clínica». Con moderación: si todo es advertencia, nada lo es. |
| «Imagen» | Radiografías y esquemas. |
| «Video» | Maniobras y gestos quirúrgicos. |
| «Preparación anatómica» | Una pieza del atlas que el lector puede girar. Se arma antes en el taller. |
| «Modelo 3D» | Un archivo `.glb` propio, con su encuadre inicial. |

### Imágenes, videos y modelos

| | Formatos | Máximo |
|---|---|---|
| Imagen | PNG, JPG, WEBP, SVG | 50 MB |
| Video | **MP4 o WEBM** | 50 MB |
| Modelo 3D | `.glb` | **5 MB** |

- Se suben desde el propio bloque («Subir nuevo») o en tanda desde «Contenido» →
  «Medios» → «+ Subir archivo», que admite varios a la vez.
- Toda imagen y todo video piden una **«Descripción para lectores de
  pantalla»**. Es obligatoria.
- **Un `.mov` de iPhone se rechaza**, y cambiarle el nombre a `.mp4` no sirve:
  la plataforma mira el contenido del archivo, no la extensión. Hay que
  convertirlo antes.
- Un video grande tarda minutos. La barra dice cuánto lleva; al llegar al 100 %
  aparece «Procesando en el servidor…». **No recargue ni cambie de pestaña
  dentro de la ficha mientras sube**: el archivo queda subido pero sin elegir, y
  hay que buscarlo a mano en el desplegable.
- Si un video grande se corta con «Se cortó la conexión durante la subida»,
  pruebe con uno más liviano antes de dar nada por roto: las subidas grandes por
  la conexión del servidor no están probadas a fondo.
- **Nunca suba una imagen con datos del paciente a la vista.** Nombre, RUT,
  fecha y número de ficha se recortan antes. Los modelos 3D piden confirmarlo
  con una casilla; las imágenes no, y la responsabilidad es la misma.

### Cuando dos guardados chocan

Si alguien guardó la ficha después de que usted la abriera —otra persona, o
usted en otra pestaña—, su guardado se rechaza con un aviso que empieza por «No
se guardó: esta ficha se guardó desde otro sitio…». **Lo que escribió sigue en
pantalla.** Qué hacer:

1. «Ver la versión guardada ↗» y mire qué cambió la otra persona.
2. Si ese cambio importa, **cópielo a mano** a su pantalla.
3. «Recargar sin perder lo escrito» y después guardar.

Ese último guardado **reemplaza entera** la otra versión: la plataforma no
mezcla. Por eso el paso 2. La forma de no llegar aquí es repartirse las fichas.
Este aviso no existe en el taller anatómico ni en las cuentas: ahí gana el último
que guarda, sin aviso.

### Salir, duplicar y eliminar

- Al salir con cambios pendientes el panel pregunta «¿Salir igual?». En
  **Firefox y Safari antiguos el botón Atrás no pregunta**: use Chrome o Edge al
  día, o guarde antes de retroceder.
- **«Duplicar» copia lo último guardado, no lo que hay en pantalla**, y sale de
  la ficha. Guarde primero. La copia nace como borrador.
- «Eliminar» no tiene vuelta atrás.

---

## 6. El taller anatómico

Sirve para preparar una vista del atlas (2.230 piezas; la piel, el pelo, las
cejas y el vello se quitaron del atlas y no existen) y ponerla en una ficha con
el bloque «Preparación anatómica».

1. **Seleccione** lo que le interesa. Un clic sobre una pieza la selecciona y
   la pinta de naranja; **Mayús + clic** suma otra. Para muchas de una vez,
   pulse «Marco» (o la tecla **B**) y arrastre un recuadro sobre la zona: entran
   las piezas cuyo centro queda dentro. Con Mayús el marco suma a lo que ya
   había; con Ctrl, quita.
2. Decida qué hacer con lo seleccionado: **«Solo esto»** (Mayús + H) apaga todo
   lo demás; **«Apagar»** (Supr, X o H) apaga lo seleccionado. «Encender todo»
   (Alt + H) devuelve el cuerpo completo. Las casillas del árbol y su «solo»
   siguen funcionando igual.
3. Si se equivocó, **«Deshacer»** (Ctrl + Z) devuelve lo encendido a como
   estaba, hasta cincuenta pasos atrás.
4. «Frente», «Lateral», «Superior» (teclas 1, 3 y 7) y «Centrar» (el punto)
   colocan la cámara. «Encuadrar» centra todo lo que quedó.

### Abrir un modelo 3D en el taller

En el panel derecho, bajo el nombre, está la lista **«Modelos 3D»** con todos los
modelos del catálogo. Al pulsar uno se encienden en el atlas las piezas de las
que salió —el muslo derecho, sus 59— y quedan al alcance de todas las
herramientas: seleccionar, apagar, mover, cortar. **El modelo no se modifica**:
lo que haga se guarda como una preparación nueva, que nace con el nombre del
modelo.

Los modelos que no salieron pieza a pieza del atlas —los de prueba, o los
agrupados por sistema— aparecen en gris con «no es del atlas»: no traen
apuntadas sus piezas y no se pueden abrir aquí.

### Mover, rotar y quebrar

Sirve para enseñar lo que no está en su sitio: una luxación, un fragmento
desplazado, una fractura.

- **Mover** (tecla **G**) y **Rotar** (tecla **R**): con algo seleccionado, pulse
  la tecla o el botón y mueva el ratón, **sin mantener pulsado nada**: la pieza
  lo sigue. Un **clic** o Intro lo dejan ahí; **Esc** o el botón derecho lo
  cancelan. Durante el gesto, **X**, **Y** o **Z** lo atan a ese eje (la misma
  tecla otra vez lo suelta). Abajo a la izquierda se lee cuánto lleva, en
  milímetros o en grados.
- **«A su sitio»** devuelve lo seleccionado a su lugar anatómico (Alt + G solo la
  posición, Alt + R solo el giro).
- **Cortar** (tecla **K**): seleccione **un** hueso, pulse «Cortar» y **trace una
  línea de lado a lado** del hueso, por donde quiera la fractura. Queda partido
  en dos fragmentos, cada uno con su tapa, que se seleccionan, se mueven y se
  rotan por separado. El corte entra «hacia dentro» de la pantalla, así que
  conviene mirar el hueso de frente o de lado antes de trazarlo —mejor con
  «Orto»—. **«Soldar»** deshace el corte.
- **«Rayos X»** (Alt + Z) vuelve todo translúcido, como en Blender, para
  encontrar un hueso bajo el músculo. Es solo una forma de mirar: no se guarda.
- **Mayús + G** selecciona todo lo encendido del mismo sistema que lo
  seleccionado —todos los músculos, todos los vasos—, que es la forma rápida de
  quitar una capa entera: Mayús + G y después Supr.

### Asas, números y más herramientas

- **Asas** (encendidas de entrada): sobre lo seleccionado aparecen tres flechas
  y tres aros de colores. Arrastrar una **flecha** mueve por ese eje; un **aro**,
  gira sobre él. X es rojo (hacia la izquierda del paciente), Y verde (hacia
  arriba) y Z azul (hacia delante).
- **Valores exactos.** Durante un gesto se puede teclear el número: `G`, `X`,
  `8`, Intro mueve 8 mm en X; `R`, `Z`, `15`, Intro gira 15°. Y el panel
  **«Posición y giro»**, a la derecha, enseña cuánto se ha movido la pieza
  seleccionada, en milímetros y en grados, y deja escribirlo.
- **Recortar** (tecla **J**): un marco que además corta. Arrastre un rectángulo:
  lo que queda entero dentro se selecciona, y lo que cruza el borde **se parte
  limpio por el borde**, como con un cuchillo, con su tapa. Lo de dentro queda
  seleccionado para moverlo; lo de fuera queda como fragmentos. Cada pieza que
  cruza gasta un corte por borde que cruce, y una preparación admite doscientos.
- **Varios cortes.** Un fragmento se puede volver a cortar, hasta tres cortes
  encadenados, y ya no hace falta devolverlo a su sitio antes: se corta donde
  esté. «Soldar» deshace el último corte del fragmento seleccionado.
- **Agrupar** (Ctrl + G): lo agrupado se selecciona y se mueve junto —el
  fragmento distal con su pie—. «Desagrupar», Ctrl + Mayús + G.
- **Espejo:** pasa la preparación entera al otro lado del cuerpo, con lo movido y
  lo cortado reflejado. Pulsarlo otra vez vuelve. Las extremidades son simétricas
  al milímetro; lo que no tiene pareja se queda donde está, y el aviso dice
  cuánto fue.
- **Color y transparencia:** con algo seleccionado, en el panel derecho se le da
  un color propio o se deja ver a través. Un músculo al 30 % sobre su hueso es la
  lámina de atlas de siempre.
- **Rótulo, Medir (M) y Ángulo:** se pulsa sobre la anatomía —un punto, dos o
  tres— y queda apuntado: un texto, una distancia en milímetros o un ángulo. El
  texto del rótulo se escribe en el panel derecho. Conviene marcar al final: las
  marcas se quedan donde se pusieron aunque después se mueva la pieza.
- **Vistas con nombre:** busque un encuadre, escríbale un nombre —«Lateral»,
  «El foco»— y pulse «Guardar vista». En la ficha salen como botones bajo el
  modelo.
- **Orto** (tecla 5): vista sin fuga, para trazar cortes rectos y comparar
  tamaños. Solo cambia cómo se mira; la ficha abre siempre en perspectiva.
- El árbol también selecciona: pulsar el **nombre** de una pieza la selecciona
  (la casilla sigue encendiendo y apagando), y lo seleccionado se marca en
  naranja en los dos sitios.

Las herramientas están a la izquierda del modelo y las vistas arriba, sobre el
propio lienzo; abajo quedan las acciones sobre lo seleccionado.

**Para el simulador:** en «Exportar como modelo», si la preparación tiene un
hueso cortado aparece **«Usar el corte del taller»**, que lleva ese mismo corte
a la exportación. El modelo exportado sale con el hueso partido y **en su
sitio**: en el simulador el desplazamiento lo pone el caso y lo reduce el
residente.

Lo movido, lo rotado y lo cortado **se guarda con la preparación** y es lo que el
residente ve en la ficha. «Deshacer» y «Rehacer» (Ctrl + Z, Ctrl + Mayús + Z)
cubren también estos cambios; los rótulos, las medidas y las vistas se quitan
con su botón.

> **Un clic ya no apaga la pieza.** Hasta septiembre de 2026 pulsar una pieza la
> apagaba; ahora la selecciona, como en Blender, y se apaga con Supr. El botón
> «Atajos», bajo el visor, enseña la lista completa de teclas. La selección es
> solo una ayuda para trabajar: no se guarda con la preparación.

5. **«Guardar preparación».** Sin esto no queda nada: volver a «Cuerpo
   completo», abrir otra preparación o cerrar la pestaña se lleva media hora de
   trabajo. El aviso «Hay cambios sin guardar» lo recuerda.

El atlas original nunca se estropea, por mucho que se apague. Una preparación
sirve para muchas fichas, y por eso no se deja eliminar mientras alguna la use:
el panel dice cuáles. «Exportar como modelo» convierte la preparación en un
`.glb` para el simulador; está en COMO-SUBIR-UN-MODELO.md.

---

## 7. Comentarios de los lectores

Cada ficha tiene «Dejar un comentario o sugerencia». Llegan a «Comentarios», con
el número de pendientes en la barra lateral.

- «editar →» abre la ficha comentada para corregirla; «ver ficha →», la pública.
- Corregido o descartado, **«Resolver»**. Se puede «Reabrir».
- «Resolver todos» cierra todos los pendientes de una vez. Pide confirmación.
- Solo un administrador puede «Eliminar» un comentario. Lo normal es resolverlo,
  no borrarlo.

---

## 8. Ver la plataforma como la ve un residente

En la barra del **sitio público** —no dentro del panel— está «Ver como
residente». Baja su vista a la de un lector durante 4 horas o hasta «Volver a mi
vista». Un borrador, visto así, no existe. De ahí el orden: **publicar primero,
mirar después**.

---

# Solo administradores

## 9. Cuentas

La plataforma es cerrada: nadie ve nada sin una cuenta **activada por un
administrador**.

### Solicitudes

Quien quiere entrar llena «Solicitar una cuenta» y queda pendiente. Aparecen en
«Usuarios y permisos», arriba, en «Solicitudes por revisar», y con un número en
la barra lateral.

- **La plataforma no comprueba quién es quien pide la cuenta.** Eso lo hace
  usted. Si no reconoce el nombre, pregunte en el servicio antes de activar.
- Elija el «Rol» —por omisión, Lector— y pulse **«Activar»**. Se le avisa por
  correo.
- **«Rechazar» borra la solicitud y sus datos**, y no se deshace.

### Crear una cuenta a mano

«+ Nueva cuenta». En «Cómo entra esta persona»:

- *«Enviarle un correo para que elija su contraseña»*: lo normal. El enlace dura
  **72 horas**. Marque «Activar de inmediato», o el enlace no le servirá hasta
  que usted active la cuenta.
- *«Ponerle yo una contraseña y entregársela»*: para cuando la persona está
  delante. La contraseña **se muestra una sola vez**; cópiela antes de guardar.

### Roles y permisos por módulo

El rol se cambia con «Editar». Dé el rol de administrador a pocas personas:
puede crear y eliminar cuentas.

El botón «Permisos» tiene dos listas, «Módulos que puede ver» y «Módulos que
puede editar»:

- **Sin marcar ninguno = los cinco.** Se marca solo para restringir. Para que un
  editor trabaje solo en «Examen físico», marque *únicamente* ese.
- **Editar exige ver**: si restringe lo que puede ver, también deja de poder
  editar lo demás.
- A un administrador estos permisos no le afectan.

### Contraseñas, bajas y seguros

- **«Clave»** envía un enlace para cambiar la contraseña: caduca en una hora y
  sirve una vez. **Pulsarlo de nuevo invalida el anterior**: no lo pulse dos
  veces «por si acaso». Si el correo falla, el panel muestra el enlace con
  «Copiar» para entregarlo por otra vía.
- **«Desactivar»** retira el acceso y conserva todo. Es lo indicado cuando
  alguien termina su rotación.
- **«Eliminar»** borra su historial de lectura y deja sus comentarios sin autor.
  No se deshace. Casi nunca hace falta.
- La plataforma no deja que usted se quite su propio rol, se desactive o se
  elimine, ni que desaparezca el último administrador activo. **Conviene que
  haya siempre dos administradores**: si el único pierde su acceso, no hay
  pantalla desde la que arreglarlo.

---

## 10. Difusión

Un correo a todas las cuentas activas o a un grupo, uno por persona y con su
nombre.

1. Escriba «Asunto» y «Mensaje». Una línea en blanco separa párrafos, «- » al
   principio de línea hace lista. El saludo lo pone la plataforma.
2. Mire la «Vista previa» y pulse **«Enviarme una prueba»**. Siempre.
3. «Enviar a N personas» y confirme.

Sale **despacio a propósito** —unos 200 por hora—, porque el servidor de correo
limita los envíos y esa cuota es la misma de los correos de contraseña. Si el
servidor se reinicia a mitad, queda «Detenida» y **no sigue sola**: hay que
pulsar «Reanudar», y una persona puede recibirlo dos veces. Es para avisos del
servicio, no para correo frecuente: no hay forma de darse de baja.

---

## 11. Respaldos y sistema

- **«Respaldos»**: cada noche se guardan solos la base de datos y los archivos
  subidos, y se conservan 30 días. «Respaldar ahora» hace uno al momento:
  **úselo antes de un cambio grande**, como una tanda de eliminaciones.
- **Una vez al mes, «Descargar» el último de cada tipo** («Base de datos» y
  «Archivos subidos») y guárdelos fuera del servidor. Hoy todos los respaldos
  viven en el mismo disco que la plataforma: protegen de un error, no de que el
  disco muera.
- Restaurar no se hace desde el panel: se pide al desarrollador.
- **«Sistema»**: una lista de comprobaciones —base, respaldo reciente, correo,
  disco—. Si algo se comporta raro, mire aquí primero y mande una captura.

---

## 12. Estadísticas y actividad

«Estadísticas» muestra cuánto contenido hay, qué se lee más y dónde se comenta.
«Actividad», quién abrió qué y su paso por el simulador.

**El puntaje del simulador no es una calificación.** Sirve para ver qué gesto se
le atraviesa a la gente, no para evaluar a nadie, y el panel lo dice en la misma
pantalla. La actividad de lectura solo la ven los administradores: trátela como
lo que es, información sobre personas.

---

## 13. Cuando algo no sale

| Qué pasa | Qué hacer |
|---|---|
| «Su cuenta existe pero todavía no está activada» | Un administrador debe activarla en «Usuarios y permisos». |
| No llega el correo de contraseña | Carpeta de no deseados. Si no, que un administrador use «Clave». |
| El enlace de contraseña dice que no sirve | Caducó (una hora), ya se usó, o alguien pulsó «Clave» otra vez. Pida uno nuevo. |
| «No se guardó: esta ficha se guardó desde otro sitio» | Sección 5, «Cuando dos guardados chocan». Lo escrito no se perdió. |
| «Publicar» no deja y hay una pestaña con «!» | Falta un campo obligatorio en esa pestaña. |
| El archivo se rechaza al subir | Formato o peso: 50 MB imagen y video, 5 MB modelos, video solo MP4 o WEBM. |
| El video se corta al subir | Pruebe uno más liviano; si ese sube, comprima el grande. |
| No aparece un módulo en «Contenido» | Sus permisos no lo incluyen. Lo cambia un administrador. |
| «El taller anatómico necesita un computador» | Pantalla demasiado estrecha. Ábralo en un computador. |
| Publiqué y un lector no lo ve | Confirme la insignia «✓ Publicada» y que la cuenta del lector tiene ese módulo visible. |
| La plataforma no abre | Avise al desarrollador. No hay nada que hacer desde el navegador. |

**Al pedir ayuda**, mande: qué estaba haciendo, el texto exacto del aviso —mejor
una captura— y la hora. Con eso se encuentra en los registros; sin eso, no.
