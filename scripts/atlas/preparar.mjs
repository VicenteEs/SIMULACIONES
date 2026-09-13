/**
 * Prepara el atlas anatómico para la plataforma.
 *
 * Toma el material de BodyParts3D ya optimizado para navegador y produce lo que
 * TraumaHub necesita en `public/atlas/`:
 *
 *   catalogo.json   descripción de las 2.234 piezas, con su sistema, su región
 *                   anatómica y dónde está su geometría dentro de los paquetes
 *   cuerpo-N.bin.gz los paquetes de geometría, tal cual (no se recomprimen)
 *   ATRIBUCION.md   los créditos que exige la licencia CC BY 4.0
 *
 * Uso:
 *   node scripts/atlas/preparar.mjs [ruta-al-material]
 *
 * Por omisión busca en `.vendor/human-atlas/public/models`, que es donde queda
 * tras clonar el repositorio de origen. Se ejecuta una sola vez: el resultado se
 * versiona, de modo que un despliegue nuevo no depende de esta máquina ni de
 * ninguna descarga.
 *
 * --------------------------------------------------------------------------
 * Por qué hay un catálogo propio y no se usa el `atlas.json` original tal cual:
 *
 *  1. El original agrupa por **sistema** (arterial, óseo, muscular…), que es
 *     como se estudia anatomía. Aquí hace falta además agrupar por **región**
 *     —miembro superior derecho, tórax, pie izquierdo—, que es como se opera y
 *     como se pide «déjame solo la tibia».
 *  2. La región se deduce en dos pasos, y el orden importa: primero se usan los
 *     conceptos FMA reales del propio atlas (`right lower limb` y compañía),
 *     que son anatomía verificable; lo que queda fuera cae en una regla
 *     geométrica sobre la caja envolvente. Ojo con el tamaño del segundo paso:
 *     es la mayoría del atlas, tres de cada cinco piezas, y no solo los vasos y
 *     nervios que atraviesan regiones. Por eso cada pieza queda marcada con
 *     cuál de los dos caminos la clasificó: sin esa marca no habría manera de
 *     distinguir un dato de una estimación.
 *  3. Los nombres de los sistemas y de las regiones se escriben aquí en
 *     español. Los de las piezas salen del catálogo con su nombre ORIGINAL y
 *     así se quedan en `catalogo.json`: la plataforma los enseña en español
 *     leyendo `src/atlas/nombres-es.json`, una tabla indexada por ese original.
 *     La tradujeron agentes automáticos con una pasada de revisión clínica, y
 *     ningún médico la ha leído fila a fila (D-092): quien vea un término que no
 *     suena a consulta, que lo corrija ahí. Escritos aquí dentro, se
 *     perderían en cada regeneración; indexados por el original, sobreviven a
 *     cualquiera que no cambie la anatomía. Por eso este guion no traduce nada:
 *     quien quiera cambiar una traducción la cambia en la tabla.
 *
 * El ATRIBUCION.md no se redacta aquí: lo escribe `atribucion.mjs`, que es la
 * única plantilla. Aquí hubo otra, y cuando el atlas empezó a enseñarse en
 * español siguió afirmando que los nombres de las estructuras no se traducían;
 * nada lo cantaba, porque este guion prepara el atlas entero en cuanto se
 * importa y ninguna prueba podía llamar a su plantilla. Regenerar habría
 * borrado sin aviso la declaración de cambios que exige CC BY 4.0 —la
 * traducción, el original conservado y las correcciones de sistema—.
 * --------------------------------------------------------------------------
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { atribucion } from './atribucion.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..', '..')
const ORIGEN = resolve(process.argv[2] ?? join(RAIZ, '.vendor', 'human-atlas', 'public', 'models'))
const DESTINO = join(RAIZ, 'public', 'atlas')

/** Los quince sistemas del atlas, con el nombre que verá el traumatólogo. */
const SISTEMAS = [
  { id: 'skeletal', nombre: 'Esqueleto', color: '#e8e2d5', orden: 1 },
  { id: 'muscular', nombre: 'Músculos', color: '#b6544c', orden: 2 },
  { id: 'connective', nombre: 'Tejido conectivo', color: '#d8c9a8', orden: 3 },
  { id: 'arterial', nombre: 'Arterias', color: '#c2392f', orden: 4 },
  { id: 'venous', nombre: 'Venas', color: '#3f6fa8', orden: 5 },
  { id: 'nervous', nombre: 'Sistema nervioso', color: '#d8c24a', orden: 6 },
  { id: 'cardiac', nombre: 'Corazón', color: '#a83636', orden: 7 },
  { id: 'respiratory', nombre: 'Aparato respiratorio', color: '#6fa8bd', orden: 8 },
  { id: 'digestive', nombre: 'Aparato digestivo', color: '#b98a4e', orden: 9 },
  { id: 'urinary', nombre: 'Aparato urinario', color: '#8a9b5c', orden: 10 },
  { id: 'reproductive', nombre: 'Aparato reproductor', color: '#a87ba0', orden: 11 },
  { id: 'endocrine', nombre: 'Sistema endocrino', color: '#c98f5e', orden: 12 },
  { id: 'lymphatic', nombre: 'Sistema linfático', color: '#8fbd9a', orden: 13 },
  { id: 'sensory', nombre: 'Órganos de los sentidos', color: '#9b8fc4', orden: 14 },
  { id: 'integumentary', nombre: 'Piel', color: '#dcc0a8', orden: 15 },
]

/**
 * Regiones, en el orden en que se ofrecen.
 *
 * `conceptos` son identificadores FMA del propio atlas: cuando una pieza
 * pertenece a uno de ellos, la región es un dato y no una estimación. Se
 * recorren en este orden y gana el primero, así que lo más específico —la mano
 * antes que el miembro superior— va primero.
 */
const REGIONES = [
  { id: 'cabeza', nombre: 'Cabeza', conceptos: ['FMA7154', 'FMA54545'], orden: 1 },
  { id: 'cuello', nombre: 'Cuello', conceptos: ['FMA7155'], orden: 2 },
  { id: 'torax', nombre: 'Tórax', conceptos: ['FMA9576', 'FMA259209'], orden: 3 },
  { id: 'abdomen', nombre: 'Abdomen y pelvis', conceptos: ['FMA9577', 'FMA259211', 'FMA9578'], orden: 4 },
  { id: 'mano-derecha', nombre: 'Mano derecha', conceptos: ['FMA9713'], orden: 5 },
  { id: 'mano-izquierda', nombre: 'Mano izquierda', conceptos: ['FMA9714'], orden: 6 },
  { id: 'miembro-superior-derecho', nombre: 'Miembro superior derecho', conceptos: ['FMA7185', 'FMA24880'], orden: 7 },
  { id: 'miembro-superior-izquierdo', nombre: 'Miembro superior izquierdo', conceptos: ['FMA7186', 'FMA24881'], orden: 8 },
  { id: 'pie-derecho', nombre: 'Pie derecho', conceptos: ['FMA11343'], orden: 9 },
  { id: 'pie-izquierdo', nombre: 'Pie izquierdo', conceptos: ['FMA11344'], orden: 10 },
  { id: 'miembro-inferior-derecho', nombre: 'Miembro inferior derecho', conceptos: ['FMA7187', 'FMA24882'], orden: 11 },
  { id: 'miembro-inferior-izquierdo', nombre: 'Miembro inferior izquierdo', conceptos: ['FMA7188', 'FMA24883'], orden: 12 },
  { id: 'tronco', nombre: 'Tronco (sin asignar)', conceptos: ['FMA7181'], orden: 13 },
]

/**
 * Región por geometría, para lo que ningún concepto FMA clasifica.
 *
 * Por aquí pasa la mayoría del atlas, no un resto marginal: los vasos y nervios
 * largos, que por definición atraviesan varias regiones, pero también casi todo
 * el sistema muscular y el aparato digestivo, cuyas piezas simplemente no
 * figuran entre los elementos de ningún concepto de región de los de arriba.
 * Se les asigna la región donde está su **centro**, que es lo que hace que al
 * pedir «solo el miembro inferior derecho» aparezca la arteria femoral derecha
 * y no la aorta entera.
 *
 * Las alturas salen del propio cuerpo: 1,73 m, de pie, con los pies en y=0.
 */
function regionPorGeometria(caja) {
  const [min, max] = caja
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2

  // En este cuerpo el eje X positivo apunta al costado izquierdo del sujeto:
  // medido sobre los propios conceptos, el miembro superior derecho ocupa
  // x −0,32…−0,03 y el izquierdo +0,03…+0,32.
  const derecha = cx < 0

  // La separación lateral es lo primero que se mira, y no la altura. Con los
  // brazos caídos, la mano queda a y 0,74–0,86, **más abajo** que buena parte
  // del muslo: clasificar por altura mandaría manos a la pierna. Lo que nunca
  // se solapa es la distancia al eje —brazo 0,22–0,32 frente a pierna
  // 0,07–0,17—, así que ese es el corte fiable.
  if (Math.abs(cx) > 0.2) {
    return derecha ? 'miembro-superior-derecho' : 'miembro-superior-izquierdo'
  }

  // Mano y pie NO se deducen aquí a propósito. Sus conceptos FMA existen y son
  // exactos; a esta función llega de todo, y para una pieza que ningún concepto
  // sitúa es más honesto decir «miembro superior» que fingir precisión sobre
  // dónde acaba la muñeca.
  if (cy > 1.48) return 'cabeza'
  if (cy > 1.4) return 'cuello'
  if (cy > 1.05) return 'torax'
  if (cy > 0.85) return 'abdomen'
  return derecha ? 'miembro-inferior-derecho' : 'miembro-inferior-izquierdo'
}

// ---------------------------------------------------------------------------

function principal() {
  if (!existsSync(join(ORIGEN, 'atlas.json'))) {
    console.error(`No encuentro el material del atlas en:\n  ${ORIGEN}\n
Clone primero el repositorio de origen:
  git clone --depth 1 https://github.com/ashemag/human-atlas.git .vendor/human-atlas`)
    process.exit(1)
  }

  const original = JSON.parse(readFileSync(join(ORIGEN, 'atlas.json'), 'utf8'))
  console.log(`Material de origen: ${original.version}, ${original.parts.length} piezas`)

  // --- región de cada pieza ------------------------------------------------
  const porConcepto = new Map()
  const conceptos = new Map(original.concepts.map((c) => [c.id, c]))
  for (const region of REGIONES) {
    for (const idConcepto of region.conceptos) {
      const concepto = conceptos.get(idConcepto)
      if (!concepto) continue
      for (const idPieza of concepto.elements) {
        if (!porConcepto.has(idPieza)) porConcepto.set(idPieza, region.id)
      }
    }
  }

  let porAnatomia = 0
  let porCaja = 0

  const piezas = original.parts.map((p) => {
    const region = porConcepto.get(p.id)
    const deducida = region ?? regionPorGeometria(p.bounds)
    if (region) porAnatomia += 1
    else porCaja += 1

    return {
      id: p.id,
      nombre: p.name,
      fma: p.conceptId,
      sistema: p.system,
      region: deducida,
      // «anatomia» = lo dice un concepto FMA del atlas. «caja» = deducido de la
      // posición. Se guarda para poder distinguir el dato de la estimación.
      origenRegion: region ? 'anatomia' : 'caja',
      paquete: p.chunk,
      pos: p.positions,
      nor: p.normals,
      idx: p.indices,
      vertices: p.vertexCount,
      indices: p.indexCount,
      caja: p.bounds,
    }
  })

  // --- paquetes de geometría ----------------------------------------------
  mkdirSync(DESTINO, { recursive: true })

  const paquetes = original.chunks.map((c, i) => {
    const origenGz = join(ORIGEN, c.gzip.replace(/^\/models\//, ''))
    const nombre = `cuerpo-${i}.bin.gz`
    copyFileSync(origenGz, join(DESTINO, nombre))
    return { archivo: nombre, bytesComprimido: c.gzipBytes, bytes: c.bytes }
  })

  const pesoComprimido = paquetes.reduce((t, p) => t + p.bytesComprimido, 0)

  // --- catálogo ------------------------------------------------------------
  const catalogo = {
    // La versión identifica esta preparación concreta. Una instancia guardada
    // anota cuál usó, de modo que si algún día se regenera el atlas se puede
    // avisar en vez de mostrar piezas equivocadas en silencio.
    // Se resume el catálogo entero, no solo la lista de identificadores. La
    // versión no sirve únicamente para avisar de piezas desaparecidas: viaja
    // en la URL de cada paquete, que se sirve con caché de un año. Resumiendo
    // solo los ids, un atlas reempaquetado con las mismas piezas conservaba la
    // versión, la URL no cambiaba y los navegadores seguían usando la
    // geometría antigua contra los desplazamientos nuevos.
    version: `bp3d-4.0-${createHash('sha1')
      .update(JSON.stringify({ piezas, paquetes }))
      .digest('hex')
      .slice(0, 8)}`,
    fuente: 'BodyParts3D 4.0',
    licencia: 'CC BY 4.0',
    sujeto: 'Anatomía de referencia de varón adulto',
    triangulos: original.triangles,
    sistemas: SISTEMAS,
    regiones: REGIONES.map(({ id, nombre, orden }) => ({ id, nombre, orden })),
    paquetes,
    piezas,
  }

  writeFileSync(join(DESTINO, 'catalogo.json'), JSON.stringify(catalogo), 'utf8')
  // El catálogo crudo, con los sistemas del origen: la plantilla aplica ella
  // misma las correcciones antes de contar y de declararlas, para que quien la
  // llama no pueda olvidarse (ver `atribucion.mjs`).
  writeFileSync(join(DESTINO, 'ATRIBUCION.md'), atribucion(catalogo), 'utf8')

  // --- resumen -------------------------------------------------------------
  const porRegion = new Map()
  for (const p of piezas) porRegion.set(p.region, (porRegion.get(p.region) ?? 0) + 1)

  console.log(`\nEscrito en public/atlas/`)
  console.log(`  catalogo.json      ${(JSON.stringify(catalogo).length / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  ${paquetes.length} paquetes      ${(pesoComprimido / 1024 / 1024).toFixed(1)} MB comprimidos`)
  console.log(`  version            ${catalogo.version}`)
  console.log(`\nRegión de cada pieza:`)
  console.log(`  ${porAnatomia} por concepto anatómico · ${porCaja} deducidas de su posición`)
  for (const r of REGIONES) {
    const n = porRegion.get(r.id) ?? 0
    if (n > 0) console.log(`    ${r.nombre.padEnd(30)} ${String(n).padStart(5)}`)
  }
}

principal()
