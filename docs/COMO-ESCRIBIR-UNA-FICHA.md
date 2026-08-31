# Cómo escribir una ficha

Guía para el traumatólogo. No hace falta saber nada de informática: se escribe
dentro de la plataforma, en `/admin`, y se publica con un botón.

---

## Antes de empezar: los segmentos

Las fichas se ordenan por segmento anatómico —hombro, codo, fémur, rodilla— y
esos segmentos hay que crearlos una sola vez, antes de la primera ficha.

**Contenido → Segmentos → Crear nuevo.** Nombre y número de orden. El orden
decide cómo aparecen en la biblioteca: conviene un orden anatómico de arriba
hacia abajo (hombro 1, codo 2, muñeca 3…) y dejar huecos entre números —10, 20,
30— para poder intercalar después sin renumerar todo.

---

## Una ficha, paso a paso

**Contenido → Patologías → Crear nuevo.**

### Los datos de cabecera

| Campo | Qué poner | Ejemplo |
|---|---|---|
| Nombre | El de la patología, sin abreviar | Fractura de la diáfisis femoral |
| Subtítulo | Una línea que acote el alcance | Adulto · trazo simple y complejo |
| Segmento | El que corresponda | Fémur |
| Código | AO/OTA si lo tiene, o una sigla | 32 |
| Tipo | Trauma u ortopedia | Trauma |

### Las seis pestañas

Son siempre las mismas, en el mismo orden, para que el residente sepa dónde
buscar sin aprenderse cada ficha:

1. **Definición** — qué es, epidemiología, mecanismo general, lesiones asociadas
2. **Mecanismo** — cómo se produce; es donde mejor encaja un modelo 3D
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
el orden que se quiera. Se arrastran para reordenarlos.

| Bloque | Cuándo conviene |
|---|---|
| **Texto** | Párrafos con negrita, cursiva, listas y subtítulos. El caballo de batalla |
| **Lista clínica** | Puntos donde cada uno tiene una idea destacada y su desarrollo |
| **Tabla de clasificación** | Código y descripción: 32-A, 32-B, 32-C |
| **Advertencia** | Algo que no se debe pasar por alto. Tres tonos, ver abajo |
| **Imagen** | Radiografías, esquemas, fotografías. Ancho completo, media columna o pequeña |
| **Video** | Maniobras, gestos quirúrgicos |
| **Modelo 3D** | Un hueso que el residente puede rotar |

### Los tres tonos de advertencia

- **Atención** — algo que hay que tener presente
- **Error frecuente** — la equivocación que se repite en la práctica
- **Perla clínica** — el detalle que distingue a quien sabe

Conviene no abusar: si toda la ficha son advertencias, ninguna destaca.

---

## Borrador y publicación

Todo lo que se escribe queda como **borrador** hasta pulsar **Publicar**. Un
borrador solo lo ven quienes editan; los residentes no.

Eso permite escribir una ficha en varias sesiones sin que nadie vea el trabajo a
medias. Y cada versión guardada se conserva: si algo se estropea, se vuelve a la
anterior desde **Versiones**.

Para comprobar cómo quedará antes de publicar está el botón **Ver como
residente**, arriba a la derecha. Muestra exactamente lo que él vería, no una
imitación.

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
3. Revisarla con «Ver como residente»
4. Publicarla y comentarla con el desarrollador antes de seguir

Ese cuarto paso importa: si algo del editor estorba o falta un tipo de bloque,
es mucho más barato arreglarlo con una ficha escrita que con cuarenta.
