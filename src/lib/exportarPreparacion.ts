import { readFile } from 'node:fs/promises'
import { gunzip } from 'node:zlib'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas, ContenidoDeInstancia } from '@/atlas/formato'
import { escribirGlb } from '@/lib/glb'
import {
  avisosDeLaExportacion,
  nombresDelArchivo,
  piezasDeLaPreparacion,
  prepararExportacion,
  TECHO_BYTES,
  type CorteExportado,
  type PiezaExportada,
  type PiezaLeida,
} from '@/lib/exportarAtlas'
import { normalizarCorte } from '@/lib/planoDeCorte'
import { exigirIdentificador } from '@/lib/validacion'

/**
 * Exportar una preparación del atlas a un modelo 3D, sin sesión.
 *
 * Vivía entera dentro de la acción `exportarComoModelo`, y así solo se podía
 * llamar desde el navegador de alguien con sesión de editor: una acción de
 * servidor lee la cookie antes de hacer nada, y un guion que se lanza con
 * `npx tsx` no tiene cookie que leer. Para armar un caso entero sin salir de la
 * plataforma —preparación, modelo partido y caso, uno detrás de otro— el guion
 * necesita llamar a lo mismo que el botón, no a una copia que se desvíe con el
 * tiempo. Así que la acción se quedó en la guardia más esta llamada, y todo lo
 * demás está aquí.
 *
 * **Aquí no hay guardia, a propósito.** Quien importa esto desde una acción de
 * servidor tiene que haber pasado antes por `exigirEditor`; quien lo importa
 * desde un guion ya tiene la base en la mano. Este archivo no lleva
 * `'use server'` y no debe llevarlo nunca: con esa línea, cada exportación de
 * aquí sería un extremo HTTP sin guardia.
 *
 * Tampoco se revalida ninguna ruta de Next: fuera de Next no existe
 * `revalidatePath`, y lo hace la acción al volver.
 */

/** Dónde están el catálogo y los paquetes cuando nadie dice otra cosa. */
const DIRECTORIO_DEL_ATLAS = () => join(process.cwd(), 'public', 'atlas')

/**
 * Los catálogos leídos, recordados por directorio.
 *
 * Son 0,7 MB de JSON que no cambian mientras el proceso viva: volver a leerlos
 * y analizarlos en cada guardado sería gastar por nada.
 *
 * Se recuerda YA corregido (`corregirCatalogo`), y la corrección va aquí, en la
 * única puerta del servidor, y no en la exportación. El navegador corrige en
 * `cargarCatalogo`; si el servidor no lo hiciera, el taller pintaría el peroneo
 * corto como músculo y el archivo exportado lo seguiría fundiendo con el
 * esqueleto, con el rol de hueso escrito dentro: con la capa de músculo
 * apagada, el residente vería un músculo pegado al peroné como si fuera hueso.
 *
 * Por directorio y no uno solo porque un guion puede apuntar a otro atlas
 * (`directorioDelAtlas`) en el mismo proceso que el de siempre.
 */
const catalogos = new Map<string, CatalogoDelAtlas>()

/**
 * El catálogo del atlas instalado.
 *
 * Exportada porque las acciones del taller la usan también para validar y
 * listar; son la misma lectura y el mismo recuerdo.
 */
export async function leerCatalogo(directorio = DIRECTORIO_DEL_ATLAS()): Promise<CatalogoDelAtlas> {
  const recordado = catalogos.get(directorio)
  if (recordado) return recordado
  try {
    const crudo = await readFile(join(directorio, 'catalogo.json'), 'utf8')
    const catalogoEnMemoria = corregirCatalogo(JSON.parse(crudo) as CatalogoDelAtlas)
    catalogos.set(directorio, catalogoEnMemoria)
    return catalogoEnMemoria
  } catch {
    throw new Error(
      'El atlas anatómico no está instalado en este servidor. ' +
        'Falta public/atlas/catalogo.json.',
    )
  }
}

/**
 * Un paquete de geometría del atlas, descomprimido en memoria.
 *
 * En el navegador no hay ni una línea de descompresión porque los paquetes se
 * sirven con `Content-Encoding: gzip` y la hace el propio navegador. Aquí se
 * leen del disco, donde están comprimidos, así que hay que hacerla a mano.
 *
 * No se recuerdan entre llamadas a propósito: son decenas de megabytes y una
 * exportación es algo que se hace de vez en cuando, no en cada petición.
 */
async function leerPaquete(
  catalogo: CatalogoDelAtlas,
  indice: number,
  directorio: string,
): Promise<ArrayBuffer> {
  const paquete = catalogo.paquetes[indice]
  if (!paquete) throw new Error(`El atlas no tiene el paquete ${indice}.`)
  const comprimido = await readFile(join(directorio, paquete.archivo))
  const crudo = await new Promise<Buffer>((resolver, rechazar) => {
    gunzip(comprimido, (error, salida) => (error ? rechazar(error) : resolver(salida)))
  })
  // Se copia a un ArrayBuffer propio: el de un Buffer de Node puede estar
  // compartido con otros, y las vistas tipadas leerían bytes ajenos.
  return crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength) as ArrayBuffer
}

export interface OpcionesDeExportarPreparacion {
  /**
   * Identificadores del atlas de las piezas que salen sueltas: `['FJ3387']`.
   *
   * `unknown` y no `string[]` porque llega también del navegador, y se
   * normaliza aquí: lo que no sea texto se descarta.
   */
  protagonistas?: unknown
  /**
   * El hueso que sale partido, con la forma de `CorteDeHueso`
   * (`src/lib/planoDeCorte.ts`):
   * `{ pieza: 'FJ3387', posicion: 50, inclinacion: 30, giro: 90, fragmento: 'distal' }`.
   *
   * Se valida con `normalizarCorte`: un valor imposible es un error con
   * palabras, no un corte corregido en silencio. La pieza tiene que estar
   * además en `protagonistas` y ser un hueso (`partirLaPieza`).
   */
  corte?: unknown
  /** Otro directorio del atlas; por omisión, `public/atlas` bajo `process.cwd()`. */
  directorioDelAtlas?: string
}

/** El modelo creado y lo que hay que decir de él. */
export interface ModeloExportado {
  /** Identificador del documento nuevo en `modelos-3d`. */
  id: string
  nombre: string
  bytes: number
  /** Nombres de nodo del archivo, en orden. */
  nodos: string[]
  /** Cada nodo con su etiqueta y su rol, como los lee el taller de piezas del caso. */
  piezas: PiezaExportada[]
  /** Piezas de la preparación que ya no existen en el atlas instalado. */
  perdidas: string[]
  sinTraducir: string[]
  sinLaPiel: boolean
  pielRecortada: boolean
  pielFuera: string[]
  /** El hueso partido y sus dos nodos, o `null` si no se pidió corte. */
  corte: CorteExportado | null
}

/**
 * Exporta una preparación del atlas a un documento nuevo de `modelos-3d`.
 *
 * ```ts
 * exportarPreparacion(
 *   payload: Payload,              // la instancia: getPayload({ config }) en un guion
 *   idDeLaPreparacion: unknown,    // id de `instancias-atlas`, número o texto
 *   opciones?: OpcionesDeExportarPreparacion,  // protagonistas, corte, directorioDelAtlas
 *   usuario?: Record<string, unknown>,         // quién crea el modelo; omitido en un guion
 * ): Promise<ModeloExportado>
 * ```
 *
 * Un guion, para armar un caso con la tibia derecha partida:
 *
 * ```ts
 * const payload = await getPayload({ config })
 * const modelo = await exportarPreparacion(payload, idDeLaPreparacion, {
 *   protagonistas: ['FJ3387', 'FJ3366'],
 *   corte: { pieza: 'FJ3387', posicion: 60, inclinacion: 30, giro: 90, fragmento: 'distal' },
 * })
 * // modelo.corte.fragmento === 'Tibia_derecha_fragmento_distal': el nodo que
 * // va con rol `fragmento` en las piezas del caso. `modelo.piezas` trae la
 * // lista entera con su rol, lista para el caso. `modelo.corte.pivote` es el
 * // origen de ese nodo, en el foco del corte: el desplazamiento y los giros que
 * // guarde el caso son relativos a él, no al centro del modelo.
 * ```
 *
 * Lanza `Error` con el motivo en español si algo impide exportar: la
 * preparación sin piezas, el atlas sin instalar, un corte imposible, el modelo
 * por encima de `TECHO_BYTES`. No escribe nada en ese caso.
 *
 * `usuario` es opcional porque un guion no tiene a nadie detrás. Con él, la
 * lectura de la preparación y la creación del modelo se hacen en su nombre, que
 * es lo que deja rastro de quién lo creó. Sin él, Payload las hace con la API
 * local tal cual. En los dos casos con `overrideAccess`, que es el valor por
 * omisión de la API local y lo que ya hacía la acción: la guardia es la de quien
 * llama, no la de esta función.
 *
 * El archivo es una copia: el atlas no se toca, y la preparación tampoco. Sale
 * con cada objeto con su nombre en español y, dentro, el rol y la etiqueta que el
 * taller de piezas del caso lee para rellenar la lista solo; centrado en lo que
 * se exporta, con la piel recortada a esa zona y, si se pidió, con el hueso
 * partido en dos (ver `prepararExportacion`). Las notas del modelo dicen todo
 * eso, avisos incluidos, para que lo lea quien lo abra después y no solo quien
 * exportó.
 */
export async function exportarPreparacion(
  payload: Payload,
  idDeLaPreparacion: unknown,
  opciones: OpcionesDeExportarPreparacion = {},
  usuario?: Record<string, unknown>,
): Promise<ModeloExportado> {
  const identificador = exigirIdentificador(idDeLaPreparacion, 'La preparación')
  const directorio = opciones.directorioDelAtlas ?? DIRECTORIO_DEL_ATLAS()
  // Antes de leer nada: un corte mal escrito se dice sin esperar a descomprimir
  // decenas de megabytes.
  const corte = normalizarCorte(opciones.corte)
  const conQuien = usuario ? { user: usuario as never } : {}

  const instancia = (await payload.findByID({
    collection: 'instancias-atlas',
    id: identificador,
    depth: 0,
    overrideAccess: true,
    ...conQuien,
  })) as unknown as Record<string, unknown>

  const contenido = (instancia.contenido ?? {}) as Partial<ContenidoDeInstancia>
  const ids = Array.isArray(contenido.piezas)
    ? contenido.piezas.map((p) => String((p as { id?: unknown })?.id ?? '')).filter(Boolean)
    : []
  if (ids.length === 0) throw new Error('Esa preparación no tiene ninguna pieza.')

  const catalogo = await leerCatalogo(directorio)
  const { encontradas, perdidas } = piezasDeLaPreparacion(catalogo, ids)
  if (encontradas.length === 0) {
    throw new Error(
      'Ninguna de las piezas de esa preparación existe en el atlas instalado. ' +
        'Puede que se haya regenerado con otra versión.',
    )
  }

  // Un paquete se lee y descomprime una sola vez aunque le toquen cien
  // piezas: son decenas de megabytes y descomprimirlos por pieza sería
  // repetir el trabajo ciento treinta y nueve veces.
  const necesarios = [...new Set(encontradas.map((p) => p.paquete))]
  const buferes = new Map<number, ArrayBuffer>()
  for (const indice of necesarios) {
    buferes.set(indice, await leerPaquete(catalogo, indice, directorio))
  }

  const leidas: PiezaLeida[] = encontradas.map((pieza) => {
    const bufer = buferes.get(pieza.paquete)!
    return {
      id: pieza.id,
      nombre: pieza.nombre,
      // Ya corregido: `leerCatalogo` pasa el catálogo por `corregirCatalogo`.
      sistema: pieza.sistema,
      fma: pieza.fma,
      // Copias, no vistas: las vistas apuntan al paquete entero y al
      // reindexar se escribiría sobre él.
      posiciones: new Float32Array(new Float32Array(bufer, pieza.pos, pieza.vertices * 3)),
      normales: new Int16Array(new Int16Array(bufer, pieza.nor, pieza.vertices * 3)),
      indices: new Uint32Array(new Uint32Array(bufer, pieza.idx, pieza.indices)),
    }
  })

  const colores = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.color]))
  const nombresDeSistema = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.nombre]))
  const protagonistas = Array.isArray(opciones.protagonistas)
    ? opciones.protagonistas.map((p) => String(p)).filter(Boolean)
    : []

  const { objetos, piezas, centro, sinLaPiel, pielRecortada, pielFuera, sinTraducir, corte: cortado } =
    prepararExportacion(leidas, {
      protagonistas,
      colores,
      nombresDeSistema,
      corte,
    })
  const glb = escribirGlb(objetos, 'TraumaHub · exportado del atlas anatómico')

  if (glb.byteLength > TECHO_BYTES) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
    // Antes el consejo culpaba a la piel, que salía entera y pesaba ella sola
    // más de un megabyte. Ya sale recortada a la zona: si aun así no cabe, lo
    // que pesa es lo grande que es la zona, y eso se arregla preparando menos.
    throw new Error(
      `El modelo pesaría ${mb(glb.byteLength)} MB y el techo son ${mb(TECHO_BYTES)} MB. ` +
        'Quite sistemas de la preparación o acote la zona: la piel sale recortada a lo ' +
        'que se exporta, así que cuanto más cuerpo se prepara, más piel lleva.',
    )
  }

  // En milímetros y con signo: es lo que hay que SUMAR para devolver el
  // modelo a su sitio en el cuerpo. Sin anotarlo, quien quiera juntar dos
  // exportaciones en Blender no tiene cómo alinearlas.
  const milimetros = centro.map((v) => Math.round(v * 1000)).join(', ')
  const nombre = `${String(instancia.nombre ?? 'Preparación')} · del atlas`
  const archivo = `${String(instancia.nombre ?? 'preparacion')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.glb`

  // El corte va dicho en las notas con sus dos nodos: en Blender los dos trozos
  // se ven pegados, como un hueso entero, y sin esta frase no hay forma de saber
  // que está partido ni cuál de los dos es el que el caso mueve.
  const delCorte = cortado
    ? ` «${cortado.etiqueta}» sale partida en dos (${cortado.descripcion}): ` +
      `${cortado.proximal} y ${cortado.distal}.`
    : ''

  const creado = await payload.create({
    collection: 'modelos-3d',
    data: {
      nombre,
      origen: 'sintetico',
      anonimizado: true,
      notas:
        `Exportado de la preparación «${String(instancia.nombre ?? '')}» del atlas anatómico ` +
        `(${catalogo.version}), con ${encontradas.length} piezas. ` +
        `Objetos del archivo: ${piezas.map((p) => `${p.nodo} (${p.etiqueta}, ${p.rol})`).join(', ')}.` +
        delCorte +
        ` Centrado en su propia caja: para devolverlo a su sitio en el cuerpo, ` +
        `sumar ${milimetros} mm (x, y, z).` +
        avisosDeLaExportacion({ pielRecortada, pielFuera, sinTraducir, corte: cortado })
          .map((aviso) => ` ${aviso}`)
          .join(''),
    } as never,
    file: {
      data: Buffer.from(glb),
      mimetype: 'model/gltf-binary',
      name: archivo,
      size: glb.byteLength,
    },
    overrideAccess: true,
    ...conQuien,
  })

  return {
    id: String((creado as { id: unknown }).id),
    nombre,
    bytes: glb.byteLength,
    nodos: nombresDelArchivo(objetos),
    piezas,
    perdidas,
    sinTraducir,
    sinLaPiel,
    pielRecortada,
    pielFuera,
    corte: cortado,
  }
}
