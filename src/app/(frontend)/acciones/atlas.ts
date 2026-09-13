'use server'

/**
 * Acciones del taller del atlas.
 *
 * Una preparación no guarda geometría sino la lista de piezas que sobreviven,
 * de modo que estas acciones nunca tocan el atlas: leen el catálogo para
 * validar y escriben una lista. El atlas es material estático y no hay aquí
 * —ni en ninguna otra parte— código capaz de modificarlo.
 *
 * La selección se vuelve a normalizar en el servidor aunque el taller ya lo
 * haga. Una acción de servidor es un extremo HTTP: el tipo de TypeScript se
 * evapora al compilar y lo que llega es lo que el navegador quiso enviar.
 */

import { readFile } from 'node:fs/promises'
import { gunzip } from 'node:zlib'
import { join } from 'node:path'
import { revalidatePath } from 'next/cache'
import { accion, exigirEditor, type Respuesta } from '@/lib/guardias'
import { puedeEditarModulo, type UsuarioSesion } from '@/access/reglas'
import { exigirIdentificador, exigirTexto, textoOpcional } from '@/lib/validacion'
import type { Payload } from 'payload'
import { normalizarSeleccion, piezasPerdidas } from '@/atlas/catalogo'
import { corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas, ContenidoDeInstancia } from '@/atlas/formato'
import { escribirGlb } from '@/lib/glb'
import {
  avisosDeLaExportacion,
  nombresDelArchivo,
  piezasDeLaPreparacion,
  prepararExportacion,
  TECHO_BYTES,
  type PiezaExportada,
  type PiezaLeida,
} from '@/lib/exportarAtlas'
import {
  coleccionesQueInsertanPreparaciones,
  mensajeDePreparacionEnUso,
  type ColeccionMontada,
  type UsoDeLaPreparacion,
} from '@/lib/usosDeLaPreparacion'

const RUTA_PANEL = '/admin-panel/atlas'

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
async function leerPaquete(catalogo: CatalogoDelAtlas, indice: number): Promise<ArrayBuffer> {
  const paquete = catalogo.paquetes[indice]
  if (!paquete) throw new Error(`El atlas no tiene el paquete ${indice}.`)
  const ruta = join(process.cwd(), 'public', 'atlas', paquete.archivo)
  const comprimido = await readFile(ruta)
  const crudo = await new Promise<Buffer>((resolver, rechazar) => {
    gunzip(comprimido, (error, salida) => (error ? rechazar(error) : resolver(salida)))
  })
  // Se copia a un ArrayBuffer propio: el de un Buffer de Node puede estar
  // compartido con otros, y las vistas tipadas leerían bytes ajenos.
  return crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength) as ArrayBuffer
}

/**
 * El catálogo, leído del disco y recordado.
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
 */
let catalogoEnMemoria: CatalogoDelAtlas | null = null

async function leerCatalogo(): Promise<CatalogoDelAtlas> {
  if (catalogoEnMemoria) return catalogoEnMemoria
  try {
    const crudo = await readFile(join(process.cwd(), 'public', 'atlas', 'catalogo.json'), 'utf8')
    catalogoEnMemoria = corregirCatalogo(JSON.parse(crudo) as CatalogoDelAtlas)
    return catalogoEnMemoria
  } catch {
    throw new Error(
      'El atlas anatómico no está instalado en este servidor. ' +
        'Falta public/atlas/catalogo.json.',
    )
  }
}

/** Versión del atlas instalado, para la página de sistema. */
export async function versionDelAtlas(): Promise<Respuesta<{ version: string; piezas: number }>> {
  return accion(async () => {
    // Leer el catálogo no necesita permisos, pero un `export` de un archivo
    // 'use server' es un extremo HTTP: hoy solo la importa un componente de
    // servidor y el identificador de la acción no llega a ningún navegador; el
    // día que el taller enseñe la versión del atlas desde un componente de
    // cliente —cosa natural, porque ya compara versiones para avisar de
    // preparaciones desfasadas—, ese import lo mete en el paquete y la versión
    // y el número de piezas quedan contestándole a cualquiera sin sesión, en
    // contra de D-020. Quien lo escriba no va a sospecharlo: sus seis hermanas
    // de este archivo sí comprueban. La página que la usa pasa por
    // `exigirPanel('admin')`, así que esto no cambia nada visible.
    await exigirEditor()
    const catalogo = await leerCatalogo()
    return { version: catalogo.version, piezas: catalogo.piezas.length }
  })
}

export interface ResumenDeInstancia {
  id: string
  nombre: string
  descripcion: string | null
  piezas: number
  actualizada: string
  desfasada: boolean
}

export async function listarInstancias(): Promise<Respuesta<ResumenDeInstancia[]>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const catalogo = await leerCatalogo()

    const { docs } = await payload.find({
      collection: 'instancias-atlas',
      limit: 200,
      sort: '-updatedAt',
      depth: 0,
      overrideAccess: true,
    })

    return (docs as unknown as Record<string, unknown>[]).map((doc) => ({
      id: String(doc.id),
      nombre: String(doc.nombre ?? ''),
      descripcion: (doc.descripcion as string) ?? null,
      piezas: Number(doc.numeroDePiezas ?? 0),
      actualizada: String(doc.updatedAt ?? ''),
      // Se avisa en vez de descartar en silencio: una preparación que perdió
      // media pierna sin decir nada es peor que un aviso.
      desfasada: Boolean(doc.atlasVersion) && doc.atlasVersion !== catalogo.version,
    }))
  })
}

export async function obtenerInstancia(
  id: unknown,
): Promise<
  Respuesta<{
    id: string
    nombre: string
    descripcion: string | null
    segmento: string | null
    contenido: ContenidoDeInstancia
    perdidas: string[]
  }>
> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const catalogo = await leerCatalogo()

    const doc = (await payload.findByID({
      collection: 'instancias-atlas',
      id: exigirIdentificador(id, 'La preparación'),
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const bruto = doc.contenido as Record<string, unknown> | null
    const contenido = normalizarSeleccion(catalogo, bruto?.piezas, bruto?.vista)

    return {
      id: String(doc.id),
      nombre: String(doc.nombre ?? ''),
      descripcion: (doc.descripcion as string) ?? null,
      segmento: doc.segmento === null || doc.segmento === undefined ? null : String(doc.segmento),
      contenido,
      perdidas: piezasPerdidas(catalogo, {
        ...contenido,
        // Se comparan los identificadores tal como se guardaron, no los ya
        // filtrados: si no, nunca habría nada que avisar.
        piezas: Array.isArray(bruto?.piezas)
          ? (bruto.piezas as { id?: string }[])
              .map((p) => ({ id: typeof p === 'string' ? p : String(p?.id ?? '') }))
              .filter((p) => p.id)
          : [],
      }),
    }
  })
}

export async function guardarInstancia(
  id: unknown,
  datos: unknown,
): Promise<Respuesta<{ id: string; piezas: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const catalogo = await leerCatalogo()

    if (!datos || typeof datos !== 'object') throw new Error('No llegó nada que guardar.')
    const entrada = datos as Record<string, unknown>

    const contenido = normalizarSeleccion(catalogo, entrada.piezas, entrada.vista)
    if (contenido.piezas.length === 0) {
      throw new Error('Encienda al menos una pieza antes de guardar la preparación.')
    }

    const documento = {
      nombre: exigirTexto(entrada.nombre, 'El nombre', 120),
      descripcion: textoOpcional(entrada.descripcion, 'La descripción', 600) ?? null,
      segmento: entrada.segmento ? exigirIdentificador(entrada.segmento, 'El segmento') : null,
      contenido,
      atlasVersion: catalogo.version,
    }

    const guardada =
      id === null || id === undefined || id === ''
        ? await payload.create({
            collection: 'instancias-atlas',
            data: documento as never,
            user: usuario as never,
          })
        : await payload.update({
            collection: 'instancias-atlas',
            id: exigirIdentificador(id, 'La preparación'),
            data: documento as never,
            user: usuario as never,
          })

    revalidatePath(RUTA_PANEL)
    return { id: String((guardada as { id: unknown }).id), piezas: contenido.piezas.length }
  })
}

/**
 * Copia una preparación.
 *
 * Es el gesto que hace barato explorar: partir de «rodilla completa» y quitarle
 * cosas hasta llegar a «solo los ligamentos cruzados», sin perder la primera.
 */
export async function duplicarInstancia(id: unknown): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()

    const original = (await payload.findByID({
      collection: 'instancias-atlas',
      id: exigirIdentificador(id, 'La preparación'),
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const copia = await payload.create({
      collection: 'instancias-atlas',
      data: {
        nombre: `${String(original.nombre ?? 'Preparación')} (copia)`,
        descripcion: original.descripcion ?? null,
        segmento: original.segmento ?? null,
        contenido: original.contenido,
        atlasVersion: original.atlasVersion ?? null,
      } as never,
      user: usuario as never,
    })

    revalidatePath(RUTA_PANEL)
    return { id: String((copia as { id: unknown }).id) }
  })
}

/**
 * Las fichas que llevan un bloque con esta preparación dentro.
 *
 * Dónde buscar sale de la configuración montada, no de una lista escrita aquí
 * (ver `src/lib/usosDeLaPreparacion.ts`). Se consulta una ruta cada vez, y no
 * todas juntas en un `or`: cada ruta es un `JOIN` a una tabla de bloques, y
 * juntar seis en una sola consulta es justo el tipo de SQL que el adaptador
 * arma distinto de una versión a otra. Son una veintena de consultas pequeñas
 * en un gesto que se hace de vez en cuando.
 *
 * En las colecciones con borradores se mira dos veces. Sin `draft`, Payload lee
 * la tabla principal, que solo cambia al publicar; con `draft: true`, lee el
 * último borrador. Una ficha publicada con la preparación y un borrador que ya
 * la quitó sigue enseñándola a los residentes, y la contraria —el borrador que
 * la acaba de añadir— la perdería al publicar. Las dos cuentan. Se comprobó
 * contra PostgreSQL con una patología cuyo borrador cambió de preparación: sin
 * `draft` aparecía solo la vieja, con `draft: true` solo la nueva.
 *
 * En esa misma comprobación salió otra cosa que conviene saber: el adaptador
 * de Payload 3.88 no distingue la pestaña. Un bloque puesto en «Manejo» aparece
 * también al preguntar por `definicion.preparacion`, porque las seis pestañas
 * comparten la tabla del bloque y la consulta no las separa.
 * Para esta pregunta da igual —se agrupa por documento—, y por eso el mensaje
 * dice qué ficha y no en qué pestaña: esa respuesta no sería de fiar.
 *
 * `overrideAccess: true` a propósito: la pregunta es «¿se rompe algo?», y una
 * ficha que el editor no puede ver se rompe igual.
 */
async function documentosQueUsanLaPreparacion(
  payload: Payload,
  id: string,
): Promise<UsoDeLaPreparacion[]> {
  const usos = new Map<string, UsoDeLaPreparacion>()
  const colecciones = coleccionesQueInsertanPreparaciones(
    payload.config.collections as unknown as ColeccionMontada[],
  )
  for (const coleccion of colecciones) {
    for (const ruta of coleccion.rutas) {
      for (const draft of coleccion.versionada ? [false, true] : [false]) {
        const { docs } = await payload.find({
          collection: coleccion.coleccion as never,
          where: { [ruta]: { equals: id } } as never,
          depth: 0,
          limit: 100,
          draft,
          overrideAccess: true,
        })
        for (const documento of docs as unknown as Record<string, unknown>[]) {
          const clave = `${coleccion.coleccion}:${String(documento.id)}`
          if (usos.has(clave)) continue
          const titulo = documento[coleccion.titulo]
          usos.set(clave, {
            coleccion: coleccion.coleccion,
            id: String(documento.id),
            titulo: typeof titulo === 'string' && titulo.trim() ? titulo : `#${String(documento.id)}`,
            etiqueta: coleccion.etiqueta,
          })
        }
      }
    }
  }
  return [...usos.values()]
}

/**
 * Borra una preparación, pero no si alguna ficha la usa.
 *
 * Antes borraba sin mirar, y el taller se limitaba a advertir en la
 * confirmación. La base no protege nada —la relación del bloque queda a nulo
 * al borrar— así que el aviso era lo único entre el clic y una ficha publicada
 * con el visor vacío. Ahora se rechaza diciendo cuáles, para que el
 * traumatólogo decida si quita el bloque o se queda con la preparación.
 */
export async function eliminarInstancia(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const identificador = exigirIdentificador(id, 'La preparación')

    const usos = await documentosQueUsanLaPreparacion(payload, identificador)
    if (usos.length > 0) {
      // Todas cuentan para negar el borrado; solo se NOMBRAN las que este editor
      // puede editar (ver `mensajeDePreparacionEnUso`).
      throw new Error(
        mensajeDePreparacionEnUso(usos, (uso) =>
          puedeEditarModulo(usuario as unknown as UsuarioSesion, uso.coleccion),
        ),
      )
    }

    await payload.delete({
      collection: 'instancias-atlas',
      id: identificador,
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
    return null
  })
}

/**
 * Exporta una preparación a un modelo 3D que la consola quirúrgica pueda abrir.
 *
 * El atlas y el simulador son dos motores distintos: el atlas funde las piezas
 * de cada sistema en una malla y decide qué se ve con una textura; la consola
 * carga objetos con nombre, mueve uno y mide milímetros. En vez de enseñarle el
 * atlas a la consola —que es reescribir el simulador— se escribe un archivo del
 * mismo formato que sale de Blender, y la consola no se entera de que el atlas
 * existe.
 *
 * El archivo es una copia: el atlas no se toca, y la preparación tampoco.
 *
 * Sale hablando el idioma de la consola: cada objeto con su nombre en español
 * y, dentro, el rol y la etiqueta que el taller de piezas del caso lee para
 * rellenar la lista solo (ver `prepararExportacion`). Centrado en lo que se
 * exporta, no en el cuerpo del que salió. Y con la piel recortada a la zona de
 * lo exportado: la del atlas es de cuerpo entero, y una pierna con la piel
 * encendida llegaba a la consola dentro de una carcasa con forma de persona.
 *
 * Devuelve `nodos` tal como antes —el taller del atlas los pinta— y además
 * `piezas`, con el rol y la etiqueta de cada uno.
 *
 * Y los avisos de lo que no sale como se pidió, que van también a las notas del
 * modelo para que los lea quien lo abra después, no solo quien exportó:
 *
 *  - `sinTraducir`: los objetos que salen con su nombre en inglés porque
 *    `nombres-es.json` todavía no los tiene. Sin decirlo, el médico encontraba
 *    «Right_fibularis_brevis» en el caso sin saber si era un fallo.
 *  - `pielRecortada`: que la piel se recortó a la zona (ver `recortarLaPiel`).
 *    En Blender se ve una piel abierta por arriba y por abajo, y tiene que
 *    constar que es a propósito y no una malla rota.
 *  - `pielFuera`: los objetos de piel que quedaban enteros fuera de esa zona y
 *    no salen. Exportar de menos sin decirlo es entregar una pierna a la que le
 *    falta algo.
 *
 * `sinLaPiel` se sigue devolviendo con su significado de siempre: había piel y
 * no contó para el centro.
 */
export async function exportarComoModelo(
  id: unknown,
  opciones?: { protagonistas?: unknown },
): Promise<
  Respuesta<{
    id: string
    nombre: string
    bytes: number
    nodos: string[]
    piezas: PiezaExportada[]
    perdidas: string[]
    sinTraducir: string[]
    sinLaPiel: boolean
    pielRecortada: boolean
    pielFuera: string[]
  }>
> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const identificador = exigirIdentificador(id, 'La preparación')

    const instancia = (await payload.findByID({
      collection: 'instancias-atlas',
      id: identificador,
      user: usuario as never,
    })) as unknown as Record<string, unknown>

    const contenido = (instancia.contenido ?? {}) as Partial<ContenidoDeInstancia>
    const ids = Array.isArray(contenido.piezas)
      ? contenido.piezas.map((p) => String((p as { id?: unknown })?.id ?? '')).filter(Boolean)
      : []
    if (ids.length === 0) throw new Error('Esa preparación no tiene ninguna pieza.')

    const catalogo = await leerCatalogo()
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
      buferes.set(indice, await leerPaquete(catalogo, indice))
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
        posiciones: new Float32Array(
          new Float32Array(bufer, pieza.pos, pieza.vertices * 3),
        ),
        normales: new Int16Array(new Int16Array(bufer, pieza.nor, pieza.vertices * 3)),
        indices: new Uint32Array(new Uint32Array(bufer, pieza.idx, pieza.indices)),
      }
    })

    const colores = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.color]))
    const nombresDeSistema = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.nombre]))
    const protagonistas = Array.isArray(opciones?.protagonistas)
      ? opciones.protagonistas.map((p) => String(p)).filter(Boolean)
      : []

    const { objetos, piezas, centro, sinLaPiel, pielRecortada, pielFuera, sinTraducir } =
      prepararExportacion(leidas, {
        protagonistas,
        colores,
        nombresDeSistema,
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

    const nodos = nombresDelArchivo(objetos)
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

    const creado = await payload.create({
      collection: 'modelos-3d',
      data: {
        nombre,
        origen: 'sintetico',
        anonimizado: true,
        notas:
          `Exportado de la preparación «${String(instancia.nombre ?? '')}» del atlas anatómico ` +
          `(${catalogo.version}), con ${encontradas.length} piezas. ` +
          `Objetos del archivo: ${piezas.map((p) => `${p.nodo} (${p.etiqueta}, ${p.rol})`).join(', ')}. ` +
          `Centrado en su propia caja: para devolverlo a su sitio en el cuerpo, ` +
          `sumar ${milimetros} mm (x, y, z).` +
          avisosDeLaExportacion({ pielRecortada, pielFuera, sinTraducir })
            .map((aviso) => ` ${aviso}`)
            .join(''),
      } as never,
      file: {
        data: Buffer.from(glb),
        mimetype: 'model/gltf-binary',
        name: archivo,
        size: glb.byteLength,
      },
      user: usuario as never,
    })

    revalidatePath(RUTA_PANEL)
    return {
      id: String((creado as { id: unknown }).id),
      nombre,
      bytes: glb.byteLength,
      nodos,
      piezas,
      perdidas,
      sinTraducir,
      sinLaPiel,
      pielRecortada,
      pielFuera,
    }
  })
}
