/**
 * La plantilla de `public/atlas/ATRIBUCION.md`.
 *
 * Ese archivo no lo escribe una persona: lo reescribe `preparar.mjs` entero
 * cada vez que se regenera el atlas, y la página de créditos lo reproduce tal
 * cual. Es donde se cumple CC BY 4.0, que obliga a declarar qué se modificó.
 *
 * Vive aparte de `preparar.mjs` por lo que pasó la primera vez que se tocó.
 * Cuando el árbol empezó a enseñar los nombres en español y a corregir el
 * sistema de ocho estructuras, se corrigió el ATRIBUCION.md a mano y la
 * plantilla se quedó diciendo que los nombres «se conservan en su forma
 * original». Nada lo cantaba: `preparar.mjs` ejecuta la preparación entera en
 * cuanto se importa, así que ninguna prueba podía llamar a su plantilla, y las
 * pruebas del archivo escrito pasaban porque el archivo estaba bien. La próxima
 * regeneración habría borrado la declaración sin aviso. Aquí se puede importar
 * sin preparar nada, y `tests/unit/plantillaDeAtribucion.test.ts` comprueba que
 * lo que genera es lo que hay escrito.
 *
 * Lo que depende de datos se calcula y no se redacta:
 *
 *  - las correcciones de sistema salen de `src/atlas/correcciones-de-sistema.json`,
 *    el mismo archivo que aplica la plataforma. Una lista copiada aquí acabaría
 *    declarando unas correcciones y aplicando otras;
 *  - el nombre en español que acompaña a cada una sale de la tabla de
 *    traducciones, y si todavía no tiene, se deja el original solo;
 *  - las cifras de regiones se cuentan sobre el catálogo YA corregido, que es
 *    el que ve quien usa la plataforma. Contadas sobre el crudo, el mismo
 *    documento que dice que los peroneos son músculos no los contaba entre
 *    los músculos.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const leerJson = (...partes) => JSON.parse(readFileSync(join(RAIZ, ...partes), 'utf8'))

/** Las correcciones de sistema, del mismo archivo que lee `src/atlas/clasificacion.ts`. */
export const leerCorrecciones = () => leerJson('src', 'atlas', 'correcciones-de-sistema.json')

/** La tabla de nombres en español, la misma que lee `src/atlas/nombres.ts`. */
export const leerTraducciones = () => leerJson('src', 'atlas', 'nombres-es.json')

/**
 * El catálogo con los sistemas corregidos, y la lista de lo que cambió.
 *
 * Hace lo mismo que `corregirCatalogo` (`src/atlas/clasificacion.ts`), que este
 * guion no puede importar por ser TypeScript. Son cinco líneas y la prueba de
 * la plantilla exige que las dos den el mismo catálogo; lo que no se duplica es
 * la lista, que es donde un desacuerdo no se vería.
 *
 * Lo que cambió se devuelve en el orden de la lista de correcciones y no en el
 * del catálogo, y una sola vez por nombre: es el orden en que la lee una
 * persona, con el derecho y el izquierdo seguidos.
 */
export function aplicarCorrecciones(catalogo, correcciones) {
  const cambiadas = new Map()
  const piezas = catalogo.piezas.map((pieza) => {
    const corregido = correcciones[pieza.nombre]
    if (!corregido || corregido === pieza.sistema) return pieza
    if (!cambiadas.has(pieza.nombre)) {
      cambiadas.set(pieza.nombre, { nombre: pieza.nombre, de: pieza.sistema, a: corregido })
    }
    return { ...pieza, sistema: corregido }
  })
  const aplicadas = Object.keys(correcciones)
    .filter((nombre) => cambiadas.has(nombre))
    .map((nombre) => cambiadas.get(nombre))
  return { catalogo: { ...catalogo, piezas }, aplicadas }
}

/**
 * Corta un texto a ochenta columnas, como el resto del archivo.
 *
 * Solo para lo que cambia de largo con los datos. La página de créditos junta
 * las líneas al pintar, así que dónde se corta no cambia lo que se lee; se
 * corta para que el archivo se pueda leer también en el repositorio.
 */
function ajustar(texto, primera = '', siguientes = '', ancho = 80) {
  const lineas = []
  let linea = primera
  let vacia = true
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    if (!vacia && linea.length + 1 + palabra.length > ancho) {
      lineas.push(linea)
      linea = siguientes
      vacia = true
    }
    linea += vacia ? palabra : ` ${palabra}`
    vacia = false
  }
  lineas.push(linea)
  return lineas.join('\n')
}

const vineta = (texto) => ajustar(texto, '- ', '  ')

/** «ocho estructuras»: con cifra se leería como un dato de tabla y no como prosa. */
const EN_LETRAS = ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce']
const enLetras = (n) => EN_LETRAS[n] ?? String(n)

const n = (v) => v.toLocaleString('es-CL')
const pct = (parte, de) => Math.round((parte * 100) / de)

/**
 * El párrafo que dice cuánto de la clasificación por región es estimado.
 *
 * Se cuenta sobre el catálogo en vez de redactarlo a mano. La versión a mano
 * decía que deducir la región era la excepción de vasos y nervios; era falso
 * —son la mayoría de las piezas— y nadie lo notó porque el texto no dependía de
 * los datos. Tiene que recibir el catálogo corregido: ver el comentario de
 * arriba.
 */
export function resumenDeRegiones(catalogo) {
  const VASOS_Y_NERVIOS = ['arterial', 'venous', 'nervous']
  const estimadas = catalogo.piezas.filter((p) => p.origenRegion === 'caja')
  const cuantas = (piezas, sistema) => piezas.filter((p) => p.sistema === sistema).length

  const total = catalogo.piezas.length
  const conConcepto = total - estimadas.length
  const deVasos = estimadas.filter((p) => VASOS_Y_NERVIOS.includes(p.sistema)).length

  // Los dos sistemas que más aportan al resto, con su nombre y sus cifras: así
  // el ejemplo sigue siendo cierto aunque cambie el material de origen.
  const resto = catalogo.sistemas
    .filter((s) => !VASOS_Y_NERVIOS.includes(s.id))
    .map((s) => ({
      nombre: s.nombre.toLocaleLowerCase('es'),
      estimadas: cuantas(estimadas, s.id),
      total: cuantas(catalogo.piezas, s.id),
    }))
    .sort((a, b) => b.estimadas - a.estimadas)
    .slice(0, 2)
    .map((s) => `${s.nombre} (${s.estimadas} de ${s.total})`)
    .join(' y ')

  return ajustar(`La mayoría de las piezas tiene la región deducida: solo ${n(conConcepto)}
(el ${pct(conConcepto, total)} %) tienen un concepto FMA que las sitúa; las otras
${n(estimadas.length)} (el ${pct(estimadas.length, total)} %) no. No es la excepción de vasos y
nervios: arterias, venas y nervios son ${n(deVasos)} de esas ${n(estimadas.length)}, el
${pct(deVasos, estimadas.length)} %; el resto es sobre todo ${resto}. Sirve igual porque la
estimación no se disfraza de dato: cada pieza deducida queda marcada en el
catálogo y el árbol anatómico la señala con un distintivo.`)
}

/**
 * Las viñetas de «Cambios realizados» que tocan a la traducción y a las
 * correcciones, y la sección que enumera estas últimas.
 *
 * La de los nombres va siempre, aunque la tabla tenga pocas entradas: lo que
 * se declara es que la plataforma los enseña traducidos, y eso es así desde la
 * primera. La de las correcciones, solo si alguna cambió algo: declarar una
 * modificación que no se hizo también es declarar mal.
 */
function correccionesDeclaradas(catalogo, aplicadas, traducciones) {
  const sistema = (id) =>
    catalogo.sistemas.find((s) => s.id === id)?.nombre.toLocaleLowerCase('es') ?? id
  // El nombre de la tabla va en mitad de una frase: «(músculo peroneo corto
  // derecho)» y no «(Músculo…)». Solo la primera letra, que la tabla puede
  // traer epónimos con mayúscula más adelante.
  const enLaFrase = (texto) => texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1)

  const cuantas = aplicadas.length
  const vinetas = [
    'traducidos al español los nombres de los sistemas y de las regiones;',
    `traducidos al español, para enseñarlos, los nombres de las estructuras. La
    traducción no sustituye al original: el nombre de BodyParts3D se conserva
    al lado, porque es el que se puede buscar en la bibliografía y en la
    Foundational Model of Anatomy. Una estructura que todavía no tiene
    traducción se enseña con su nombre original, sin traducirla a ciegas${cuantas ? ';' : '.'}`,
  ]
  if (cuantas === 0) return { vinetas, seccion: null }

  vinetas.push(`corregido el sistema anatómico de ${cuantas === 1 ? 'una estructura' : `${enLetras(cuantas)} estructuras`}
    que el material original clasifica mal. La geometría no cambia: cambia el
    grupo en el que se pintan, se encienden y se apagan.`)

  const lista = aplicadas.map(({ nombre, de, a }, i) => {
    const traducida = traducciones[nombre]
    const quien = traducida ? `${nombre} (${enLaFrase(traducida)})` : nombre
    return vineta(`${quien}: de ${sistema(de)} a ${sistema(a)}${i === cuantas - 1 ? '.' : ';'}`)
  })

  // El porqué es prosa y no se deduce de la lista. Quien añada una corrección
  // a `correcciones-de-sistema.json` tiene que añadir aquí la suya.
  const seccion = `${cuantas === 1 ? 'La corrección de sistema es esta:' : `Las ${enLetras(cuantas)} correcciones de sistema son estas:`}

${lista.join('\n')}

El porqué: los tres peroneos, el tibial anterior y el tibial posterior son
músculos de la pierna, y la cintilla iliotibial es un engrosamiento de la fascia
lata; ninguno es hueso. En el atlas de origen era solo un color equivocado, pero
en esta plataforma el sistema decide la capa de la simulación quirúrgica, y con
el error el peroneo corto seguía encendido pegado al peroné al apagar la capa de
músculo, como si fuera hueso; en la reducción de una tibia partida, los dos
tibiales salían fundidos con el esqueleto y se veían pegados al hueso. Las
encías son mucosa de la boca y no hueso: el atlas las agrupa con los dientes,
y en la simulación entrarían en la capa de hueso. La corrección se aplica al leer el catálogo, sobre el nombre original de cada
estructura.`

  return { vinetas, seccion }
}

/**
 * El ATRIBUCION.md entero.
 *
 * Recibe el catálogo tal como sale de la preparación, con los sistemas del
 * origen, y lo corrige aquí: así quien lo llama no puede olvidarse. Las dos
 * tablas se pueden pasar para probar con otras; por omisión se leen del
 * repositorio, que es lo que hace `preparar.mjs`.
 */
export function atribucion(
  catalogoCrudo,
  { correcciones = leerCorrecciones(), traducciones = leerTraducciones() } = {},
) {
  const { catalogo, aplicadas } = aplicarCorrecciones(catalogoCrudo, correcciones)
  const { vinetas, seccion } = correccionesDeclaradas(catalogo, aplicadas, traducciones)

  return `# Atribución del atlas anatómico

La geometría anatómica de esta plataforma procede de **BodyParts3D**, y su
licencia obliga a citarla allí donde se muestre. Este archivo es la fuente de
ese crédito; la página de créditos de la plataforma lo reproduce.

## Crédito exigido

> BodyParts3D, © The Database Center for Life Science licensed under
> CC Attribution 4.0 International

- Licencia: https://creativecommons.org/licenses/by/4.0/
- Términos del origen: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- Conjunto de datos: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Publicación: Mitsuhashi et al. (2009), *BodyParts3D: 3D structure database for
  anatomical concepts*. https://doi.org/10.1093/nar/gkn613

Los comentarios de los archivos OBJ originales mencionan una licencia anterior,
CC BY-SA 2.1 Japón. La página oficial vigente la sustituye por CC BY 4.0, que no
obliga a compartir igual.

## Cambios realizados

CC BY 4.0 exige indicar si se modificó el material. Se modificó así:

- ejes y unidades convertidos de milímetros y Z arriba a metros y Y arriba;
- geometría simplificada con meshoptimizer, con un límite de error relativo del
  0,2 % por estructura; las ${n(catalogo.piezas.length)} mallas de origen se conservan todas;
- normales cuantizadas a entero de 16 bits con signo;
- geometría empaquetada en ${catalogo.paquetes.length} archivos binarios comprimidos;
- añadida una clasificación por **región anatómica** que el material original no
  traía: se toma de los conceptos FMA de región del propio atlas (cabeza, tórax,
  miembro superior derecho) cuando la pieza figura entre sus elementos y, si no,
  se deduce de la posición de su caja envolvente;
${vinetas.map(vineta).join('\n')}

La preparación intermedia procede de https://github.com/ashemag/human-atlas
(código bajo licencia MIT), que documenta las cuatro primeras adaptaciones.
${seccion ? `\n${seccion}\n` : ''}
${resumenDeRegiones(catalogo)}

## Límites de este material

- Es **anatomía de referencia de un varón adulto**. No representa la variación
  anatómica ni la anatomía femenina.
- Es material **docente**. No sirve para diagnóstico ni para planificación
  quirúrgica sobre un paciente concreto.

---
Preparación \`${catalogo.version}\` · ${catalogo.triangulos.toLocaleString('es-CL')} triángulos
`
}

/**
 * Ejecutado directamente —`node scripts/atlas/atribucion.mjs`— reescribe el
 * ATRIBUCION.md desde el `catalogo.json` ya preparado.
 *
 * Existe para lo que cambia sin regenerar el atlas: la tabla de traducciones se
 * llena y una corrección de sistema se añade sin tocar la geometría, y para
 * eso `preparar.mjs` pide el material de origen, que no está en ninguna
 * máquina de despliegue. Sin esta vía, el archivo se volvería a corregir a
 * mano, que es justo lo que dejó la plantilla atrás la primera vez.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const destino = join(RAIZ, 'public', 'atlas')
  const catalogo = JSON.parse(readFileSync(join(destino, 'catalogo.json'), 'utf8'))
  writeFileSync(join(destino, 'ATRIBUCION.md'), atribucion(catalogo), 'utf8')
  console.log('Escrito public/atlas/ATRIBUCION.md')
}
