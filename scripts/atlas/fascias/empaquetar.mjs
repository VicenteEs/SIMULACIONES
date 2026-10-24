/**
 * Lo que `agregar-fascias.mjs` hace con los datos, sin tocar el disco (P-006, E1).
 *
 * Separado del guion para poder probarlo: `devolver-piel.mjs` hace todo al importarse y por eso
 * nada de él se puede llamar desde una prueba. Aquí están las cuentas que pueden estar mal sin que
 * se note —desplazamientos alineados a cuatro bytes, versión del catálogo, qué se considera
 * una pieza generada—, y `tests/unit/empaquetarFascias.test.ts` las ejerce.
 *
 * El formato es el del resto del atlas (`src/atlas/formato.ts`): cada pieza lleva en el catálogo
 * `pos`, `nor` e `idx` como desplazamientos **en bytes** dentro de su paquete ya descomprimido, y
 * todo accessor empieza en múltiplo de cuatro.
 */
import { createHash } from 'node:crypto'

/** El paquete de las fascias. Los quince de BodyParts3D van del 0 al 14 y no se tocan (F-3). */
export const NUMERO_DEL_PAQUETE = 15
export const ARCHIVO_DEL_PAQUETE = `cuerpo-${NUMERO_DEL_PAQUETE}.bin.gz`

/** Los cuatro sistemas de fascia, con el nombre que ve el traumatólogo. El orden sigue al de los quince de origen. */
export const SISTEMAS_DE_FASCIA = [
  { id: 'fascia-superficial', nombre: 'Fascia superficial', color: '#f3dc90', orden: 16 },
  { id: 'fascia-profunda', nombre: 'Fascia profunda', color: '#e9b5ad', orden: 17 },
  { id: 'fascia-meningea', nombre: 'Fascia meníngea', color: '#cfd5e0', orden: 18 },
  { id: 'fascia-visceral', nombre: 'Fascia visceral', color: '#e3bfc8', orden: 19 },
]

export const alinear = (n) => (n + 3) & ~3

/** Si una pieza del catálogo la generó TraumaHub en vez de venir de BodyParts3D. */
export const esGenerada = (pieza) => typeof pieza.generada === 'string' && pieza.generada.length > 0

/**
 * El paquete de geometría y dónde quedó cada pieza.
 *
 * `datos` es, por `id`, el `.bin` que escribe `generar.py`: posiciones, normales y —después de
 * alinear a cuatro bytes— índices. Aquí se reparten de nuevo con la misma alineación **entre
 * accessors del paquete**, que es lo que espera `montarEscena` (vistas tipadas sobre el búfer con
 * los desplazamientos tal cual): un `Float32Array` sobre un desplazamiento que no es múltiplo de
 * cuatro lanza un error que no dice qué pieza lo causó.
 */
export function construirPaquete(registros, datos) {
  const trozos = []
  const colocadas = new Map()
  let cursor = 0
  const poner = (bytes) => {
    const relleno = alinear(cursor) - cursor
    if (relleno) trozos.push(Buffer.alloc(relleno))
    cursor = alinear(cursor)
    const donde = cursor
    trozos.push(bytes)
    cursor += bytes.length
    return donde
  }
  for (const r of registros) {
    const bin = datos.get(r.id)
    if (!bin) throw new Error(`Falta el archivo de la pieza ${r.id}.`)
    const nPos = r.vertices * 12
    const nNor = r.vertices * 6
    const desdeIdx = alinear(nPos + nNor)
    const nIdx = r.indices * 4
    if (bin.length !== desdeIdx + nIdx) {
      throw new Error(`La pieza ${r.id} mide ${bin.length} bytes y su manifiesto dice ${desdeIdx + nIdx}.`)
    }
    colocadas.set(r.id, {
      pos: poner(bin.subarray(0, nPos)),
      nor: poner(bin.subarray(nPos, nPos + nNor)),
      idx: poner(bin.subarray(desdeIdx, desdeIdx + nIdx)),
    })
  }
  const total = alinear(cursor)
  if (total > cursor) trozos.push(Buffer.alloc(total - cursor))
  return { buffer: Buffer.concat(trozos), colocadas }
}

/** La pieza como la lleva el catálogo, a partir del registro del manifiesto y de dónde quedó en el paquete. */
export function piezaDelCatalogo(registro, donde) {
  return {
    id: registro.id,
    nombre: registro.nombre,
    fma: registro.fma,
    sistema: registro.sistema,
    region: registro.region,
    // La región la fija la definición anatómica de cada fascia, no una estimación por la caja:
    // el distintivo «~» del árbol (`ArbolAnatomico`) es solo para lo estimado.
    origenRegion: 'anatomia',
    generada: 'fascia',
    paquete: NUMERO_DEL_PAQUETE,
    pos: donde.pos,
    nor: donde.nor,
    idx: donde.idx,
    vertices: registro.vertices,
    indices: registro.indices,
    caja: registro.caja,
  }
}

/** La versión de un catálogo: la misma cuenta que `preparar.mjs`, `quitar-piel.mjs` y `devolver-piel.mjs`. */
export function versionDelCatalogo(piezas, paquetes) {
  return `bp3d-4.0-${createHash('sha1').update(JSON.stringify({ piezas, paquetes })).digest('hex').slice(0, 8)}`
}

/**
 * El catálogo con las fascias puestas, y nada más cambiado.
 *
 * Quita las piezas generadas que ya hubiera y el paquete de fascias anterior, y añade lo nuevo
 * **al final**: así las piezas de BodyParts3D conservan su posición en `piezas` y en `paquetes`,
 * que es el número de píxel que cada una tiene en las texturas del visor, y los quince paquetes
 * de siempre siguen donde estaban. Es lo que lo hace idempotente: aplicarlo dos veces con los
 * mismos datos da el mismo catálogo.
 */
export function catalogoConFascias(catalogo, registros, colocadas, paquete) {
  const deOrigen = catalogo.piezas.filter((p) => !esGenerada(p))
  const nuevas = registros.map((r) => piezaDelCatalogo(r, colocadas.get(r.id)))
  const ids = new Set()
  for (const p of [...deOrigen, ...nuevas]) {
    if (ids.has(p.id)) throw new Error(`El identificador ${p.id} está repetido.`)
    ids.add(p.id)
  }
  const sistemasDeOrigen = catalogo.sistemas.filter((s) => !SISTEMAS_DE_FASCIA.some((f) => f.id === s.id))
  const paquetes = catalogo.paquetes.slice(0, NUMERO_DEL_PAQUETE)
  if (paquetes.length !== NUMERO_DEL_PAQUETE) {
    throw new Error(`Se esperaban ${NUMERO_DEL_PAQUETE} paquetes de BodyParts3D y el catálogo trae ${paquetes.length}.`)
  }
  paquetes.push(paquete)
  const piezas = [...deOrigen, ...nuevas]
  const triangulos = (lista) => lista.reduce((t, p) => t + p.indices / 3, 0)
  // Los triángulos de BodyParts3D salen de restar al total lo que ya fuera generado: sin eso,
  // aplicarlo dos veces sumaría las fascias dos veces.
  const deBodyParts = catalogo.triangulos - triangulos(catalogo.piezas.filter(esGenerada))
  return {
    ...catalogo,
    sistemas: [...sistemasDeOrigen, ...SISTEMAS_DE_FASCIA],
    paquetes,
    piezas,
    triangulos: deBodyParts + triangulos(nuevas),
    version: versionDelCatalogo(piezas, paquetes),
  }
}
