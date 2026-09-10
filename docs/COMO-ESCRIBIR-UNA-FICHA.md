# Cómo escribir una ficha

Guía para el traumatólogo. No hace falta saber nada de informática: se escribe
dentro de la plataforma, en `/admin-panel/contenido`, y se publica con un botón.

---

## Antes de empezar: los segmentos

Las fichas se ordenan por segmento anatómico —hombro, codo, fémur, rodilla— y
esos segmentos hay que crearlos una sola vez, antes de la primera ficha.

**Contenido → Material de apoyo → Segmentos anatómicos → Gestionar**, y ahí el
botón de agregar. Nombre y número de orden. El orden decide cómo aparecen en la
biblioteca: conviene un orden anatómico de arriba hacia abajo (hombro 1, codo 2,
muñeca 3…) y dejar huecos entre números —10, 20, 30— para poder intercalar
después sin renumerar todo.

---

## Una ficha, paso a paso

**Contenido → Patologías → + Nueva.**

### Los datos de cabecera

| Campo | Qué poner | Ejemplo |
|---|---|---|
| Nombre | El de la patología, sin abreviar | Fractura de la diáfisis femoral |
| Subtítulo | Una línea que acote el alcance | Adulto · trazo simple y complejo |
| Segmento | El que corresponda | Fémur |
| Código | AO/OTA si lo tiene, o una sigla | 32 |
| Tipo | Trauma u ortopedia | Trauma |

Todo eso va en **Identificación**, la primera pestaña del editor. En pantalla
son siete pestañas y no seis: esta, la de los datos, y las seis de contenido.

### Las seis pestañas de contenido

Son siempre las mismas, en el mismo orden, para que el residente sepa dónde
buscar sin aprenderse cada ficha:

1. **Definición** — qué es, epidemiología, mecanismo general, lesiones asociadas
2. **Mecanismo** — cómo se produce; es donde mejor encajan la anatomía y el 3D
3. **Clasificación** — AO/OTA y las clasificaciones útiles en la práctica
4. **Evaluación** — examen inicial, exploración dirigida, imágenes
5. **Manejo** — conservador, quirúrgico, criterios de decisión
6. **Rehabilitación** — fases, criterios de progresión, retorno a la actividad

**Una pestaña vacía no se muestra.** Se puede publicar una ficha con tres
pestañas y completar el resto después: el residente verá solo lo escrito, y la
ficha parecerá incompleta en vez de rota.

---

## Los bloques

Dentro de cada pestaña se agregan bloques, en la cantidad que haga falta y en
el orden que se quiera. Cada bloque trae dos flechas para subirlo o bajarlo, un
triángulo para plegarlo cuando estorbe y una cruz para quitarlo.

Son ocho, y aparecen en este orden al pulsar **+ Agregar bloque**:

| Bloque | Cuándo conviene |
|---|---|
| **Texto** | Párrafos con negrita, cursiva, listas y subtítulos. El caballo de batalla |
| **Lista clínica** | Puntos donde cada uno tiene una idea destacada y su desarrollo |
| **Tabla de clasificación** | Código y descripción: 32-A, 32-B, 32-C |
| **Advertencia** | Algo que no se debe pasar por alto. Tres tonos, ver abajo |
| **Imagen** | Radiografías, esquemas, fotografías. Ancho completo, media columna o pequeña |
| **Video** | Maniobras, gestos quirúrgicos |
| **Preparación anatómica** | Una parte del cuerpo sacada del atlas, girable. Se arma antes, ver abajo |
| **Modelo 3D** | Un archivo propio —un hueso escaneado, una placa— que el residente puede rotar |

### Los tres tonos de advertencia

- **Atención** — algo que hay que tener presente
- **Error frecuente** — la equivocación que se repite en la práctica
- **Perla clínica** — el detalle que distingue a quien sabe

Conviene no abusar: si toda la ficha son advertencias, ninguna destaca.

### La preparación anatómica se arma antes, en el taller

Este bloque es el único que no se llena en la ficha. Los demás se completan ahí
mismo: se escribe el texto, se sube la imagen. Este solo elige, de una lista,
algo que ya estaba hecho.

Lo que elige se prepara en el **Taller anatómico**, en el menú del panel. Ahí se
abre el cuerpo completo: 2.234 piezas —esqueleto, músculos, arterias, nervios,
vísceras—, todas encendidas. El trabajo consiste en apagar lo que estorbe hasta
dejar a la vista lo que se quiere enseñar.

Hay tres formas de apagar, y conviene empezar por la última:

- La casilla de cada pieza o de cada grupo, para ir de a poco.
- Pulsar una pieza en el modelo, que la apaga. Es el gesto de «esto me tapa».
- El botón **solo**, que apaga todo lo demás de un golpe. Es el que resuelve
  casi todo: buscar «tibia derecha» arriba, pulsar **solo**, y ya está el
  grueso hecho.

El árbol de la izquierda se puede mirar por **región** —cómo se opera— o por
**sistema** —cómo se estudia—. Son las dos maneras de buscar y ninguna sustituye
a la otra.

Cuando quede lo que se quiere, se gira el modelo hasta el ángulo con que debe
abrirse en la ficha, se le pone nombre —«Tibia derecha con peroné»—, se anota
para qué sirve y se pulsa **Guardar preparación**. Se guardan las piezas
encendidas y el encuadre de la cámara.

Recién entonces, en la ficha, se agrega el bloque **Preparación anatómica** y se
elige de la lista. Nada más; el pie es opcional.

Cuatro cosas que conviene saber antes de empezar:

**El atlas nunca se estropea.** Apagar una pieza no la borra: lo que se guarda
es la lista de las que quedan, no una copia del cuerpo. Por eso el original
sigue intacto y una pieza que se quitó siempre se puede devolver.

**Guardar es un acto explícito.** Lo que se apague o encienda no queda en
ninguna parte hasta pulsar el botón. Volver al cuerpo completo, abrir otra
preparación o cerrar la pestaña avisan antes, pero se llevan el trabajo si se
acepta. Apagar piezas hasta dejar una tibia sola es media hora.

**Una preparación sirve para muchas fichas.** Ese es el motivo de armarlas
aparte y no dentro de cada ficha: la «rodilla izquierda con ligamentos» se
prepara una vez y se inserta donde haga falta. Y el residente descarga el atlas
una sola vez para todas.

**El taller necesita un computador.** Por debajo de 900 píxeles de ancho no se
abre, y en su lugar sale un aviso: son tres cosas a la vez —el árbol, el modelo
y la ficha de la preparación— y en un teléfono no caben. Eso vale solo para
armarla. Una preparación ya guardada se ve bien en el teléfono, dentro de su
ficha.

### El modelo 3D y su encuadre

Este otro bloque es para un archivo propio: un hueso escaneado, una placa, un
montaje. No tiene relación con el atlas.

En el recuadro **Encuadre inicial**, más abajo en el mismo bloque, aparece el
modelo en un visor, y es el mismo que verá el residente, no una imitación. Se
arrastra para girar y se usa la rueda para acercar. Cuando quede como debe
abrirse, se pulsa **Capturar encuadre** y los cinco números de abajo se rellenan
solos; quedan a la vista por si hay que afinarlos a mano. Si el modelo aparece
diminuto o gigante —viene en las unidades del estudio del que salió—, primero
**Ajustar al modelo**.

---

## Borrador y publicación

Arriba a la derecha hay dos botones distintos: **Guardar borrador** y
**Publicar**. Todo lo que se escribe queda en borrador hasta pulsar el segundo,
y un borrador no lo ve ningún lector, ni siquiera con el enlace directo.

Eso permite escribir una ficha en varias sesiones sin que nadie vea el trabajo a
medias. Y publicar no es irreversible: **Retirar de publicación**, al pie del
editor, la devuelve a borrador sin borrar nada.

Ya publicada, el botón **Ver publicado ↗** abre la ficha en la plataforma, en
una pestaña nueva. Mientras sea borrador ese botón no se pinta.

Que no se pinte no significa que la página no exista. Quien edita ve también lo
que no está publicado, así que si escribe esa dirección a mano verá su borrador.
Lo que no verá así es lo que ve el residente: lo está mirando con sus propios
permisos, que son otros.

### Ver como residente

Para eso está el botón **Ver como residente**, arriba a la derecha en la barra
de la plataforma. Ojo: esa barra no se muestra dentro del panel, de modo que hay
que estar en la parte pública. Lo más corto es pulsar **Ver publicado ↗** y usar
el botón en la pestaña que se abre.

Lo que hace es bajar su rol al de residente durante cuatro horas, o hasta que
pulse **Volver a mi vista** en el aviso que sale mientras dura. La plataforma
le responde exactamente lo que le respondería a él, y eso incluye lo que no debe
ver: sus borradores desaparecen, el propio también, y su dirección pasa a
responder que no existe esa ficha.

De ahí el orden: publicar primero y mirar después. Un borrador no se puede
revisar con los ojos del residente, porque para él todavía no hay nada.

---

## Sobre qué escribir

**El contenido debe ser propio o estar licenciado.** Copiar párrafos de un
manual ajeno crea un problema legal que no se arregla después. Lo que se busca
es su criterio clínico: qué importa de verdad, qué se pasa por alto, qué decide
la conducta. Eso no está en ningún libro y es lo que hace valiosa la plataforma.

**Escribir para el residente que va a operar mañana**, no para un examen. La
diferencia se nota: en vez de «la clasificación de Winquist tiene cuatro tipos»,
algo como «el grado de conminución decide si el clavo necesita bloqueo
estático».

**Una ficha buena vale más que tres a medias.** Conviene terminar la primera de
principio a fin antes de empezar la segunda: sirve de molde para las demás y
revela pronto si algo falta en el editor.

---

## Orden sugerido para empezar

1. Crear los segmentos anatómicos
2. Escribir **una** ficha completa, de una patología que domine
3. Publicarla, abrirla con «Ver publicado» y revisarla con «Ver como residente»
4. Comentarla con el desarrollador antes de seguir

Ese cuarto paso importa: si algo del editor estorba o falta un tipo de bloque,
es mucho más barato arreglarlo con una ficha escrita que con cuarenta.
