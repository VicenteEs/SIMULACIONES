/**
 * La revisión del contenido, la parte que toca la base (D-142).
 *
 * Lo puro —cómo se cuentan las palabras, cuánto se editó, cuándo una
 * validación es sospechosa— está en `src/lib/revision.ts`. Aquí se lee y se
 * escribe: se mete una ficha en revisión con su versión original, se mide cada
 * guardado contra ella, se suman los latidos del editor y se anota cada cambio
 * de estado en el historial.
 *
 * Todo con `overrideAccess: true`: quien llega aquí ya pasó por la guardia de
 * su acción (`exigirEdicionDe` o `exigirAdmin`), y las dos colecciones de la
 * revisión solo admiten al administrador por REST.
 */
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { depurarDocumento, faltantes, sinIdentificadoresDeFila } from '@/admin/depurar'
import { esquemaDe, type EsquemaDeColeccion } from '@/admin/esquema'
import {
  MODULOS_EN_REVISION,
  evaluarValidacion,
  medirEdicion,
  palabrasPorSeccion,
  seccionesVistas,
  sumarTiempos,
  type AccionDeRevision,
  type EstadoDeRevision,
  type JuicioDeLaValidacion,
  type OrigenDeContenido,
  type TiempoDeRevision,
} from './revision'
import {
  CAMPOS_DE_FIRMA,
  alguienDe,
  esProfesion,
  firmaComo,
  firmasDe,
  firmasQueFaltan,
  laOtra,
  porQueNoPuedeFirmar,
  textoParaLaHuella,
  tieneAlguna,
  tieneLasDos,
  type FirmasDeLaFicha,
  type Profesion,
} from './firmas'

type Registro = Record<string, unknown>

export const esModuloEnRevision = (slug: unknown): slug is (typeof MODULOS_EN_REVISION)[number] =>
  typeof slug === 'string' && (MODULOS_EN_REVISION as readonly string[]).includes(slug)

/**
 * Lo que se le dice a un editor que intenta publicar una ficha en revisión.
 *
 * Una constante y no un literal en cada acción: la dicen `guardarDocumento` y
 * `cambiarPublicacion`, y el formulario no ofrece el botón, así que quien la
 * lee llegó por el listado o por una llamada a mano.
 */
export const MENSAJE_DE_PUBLICAR_EN_REVISION =
  'Esta ficha está en revisión: con la firma de un médico y la de un kinesiólogo queda lista, y la publicará un administrador.'

/** El identificador de una relación, venga como venga. */
const idDe = (valor: unknown): string | null => {
  if (typeof valor === 'number' || typeof valor === 'string') return String(valor)
  if (valor && typeof valor === 'object' && 'id' in valor) return idDe((valor as { id: unknown }).id)
  return null
}

/** El título de una ficha según su esquema. */
const tituloDe = (esquema: EsquemaDeColeccion, documento: Registro): string => {
  const valor = documento[esquema.titulo]
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : `#${String(documento.id ?? '')}`
}

/**
 * La revisión de una ficha, o `null` si no está en revisión.
 *
 * Sin la versión original salvo que se pida: es el campo más pesado de la fila
 * —la ficha entera tal como llegó— y casi nadie lo necesita.
 */
export async function revisionDe(
  payload: Payload,
  coleccion: string,
  documentoId: string,
  { conOriginal = false }: { conOriginal?: boolean } = {},
): Promise<Registro | null> {
  if (!esModuloEnRevision(coleccion)) return null
  const { docs } = await payload.find({
    collection: 'revisiones',
    where: { and: [{ coleccion: { equals: coleccion } }, { documentoId: { equals: documentoId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    ...(conOriginal ? {} : { select: { original: false } }),
  })
  return (docs[0] as unknown as Registro | undefined) ?? null
}

/** Una fila nueva del historial, con la fecha de ahora. */
const entradaDeHistorial = (
  accion: AccionDeRevision,
  usuarioId: string | null,
  extra: { detalle?: string; porcentaje?: number; segundosActivos?: number } = {},
) => ({
  accion,
  usuario: usuarioId === null ? null : Number(usuarioId),
  fecha: new Date().toISOString(),
  ...(extra.detalle ? { detalle: extra.detalle.slice(0, 2000) } : {}),
  ...(extra.porcentaje !== undefined ? { porcentaje: extra.porcentaje } : {}),
  ...(extra.segundosActivos !== undefined ? { segundosActivos: extra.segundosActivos } : {}),
})

/**
 * El historial que ya hay, más lo nuevo, con techo.
 *
 * Se reescribe entero porque Payload guarda un arreglo así: las filas que ya
 * tenían `id` se conservan con él; las nuevas lo reciben. Con el techo lleno se
 * tiran las más antiguas, que es lo que menos se mira.
 */
const historialCon = (revision: Registro, ...nuevas: ReturnType<typeof entradaDeHistorial>[]) =>
  [...(Array.isArray(revision.historial) ? (revision.historial as Registro[]) : []), ...nuevas].slice(-200)

/**
 * La huella de lo que hay guardado de una ficha (D-240): lo último, borrador
 * incluido, depurado con su esquema y sin los identificadores de fila, que no son
 * contenido. Se lee de la base y no de lo que mandó el formulario para que la
 * firma y el guardado la calculen exactamente igual: dos caminos distintos al
 * mismo texto darían dos huellas, y una firma se borraría sin que nadie tocara
 * nada.
 */
async function huellaGuardada(payload: Payload, esquema: EsquemaDeColeccion, documentoId: string): Promise<string> {
  const documento = (await payload.findByID({
    collection: esquema.slug as never,
    id: documentoId,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })) as unknown as Registro
  return huellaDe(depurarDocumento(esquema, documento))
}

const huellaDe = (documento: Registro): string =>
  createHash('sha256').update(textoParaLaHuella(sinIdentificadoresDeFila(documento))).digest('hex')

/** Lo que se escribe para dejar una ficha sin firmas. */
const SIN_FIRMAS = {
  [CAMPOS_DE_FIRMA.medico.por]: null,
  [CAMPOS_DE_FIRMA.medico.en]: null,
  [CAMPOS_DE_FIRMA.kinesiologo.por]: null,
  [CAMPOS_DE_FIRMA.kinesiologo.en]: null,
  huellaFirmada: null,
} as const

/** «la firma de un médico», «las dos firmas»: de quién eran las que se borran. */
const lasFirmasDe = (firmas: FirmasDeLaFicha): string =>
  tieneLasDos(firmas)
    ? 'las dos firmas'
    : `la firma de ${alguienDe(firmas.medico !== null ? 'medico' : 'kinesiologo')}`

export interface DatosDeOrigen {
  origen?: OrigenDeContenido
  libro?: string
  capitulo?: string
  paginas?: string
  lote?: string
  modelo?: string
  /** La ruta del documento original (D-144). */
  archivoFuente?: string
  /** Lo que el modelo quiere que sepa quien revise (D-144). */
  notasParaElRevisor?: string[]
  /** A quién se le asigna, si se sabe ya. */
  asignadaA?: string | null
  /**
   * La versión con la que se mide lo editado, si no es la que la ficha tiene
   * ahora. La lleva la copia de una ficha en revisión (`duplicarDocumento`):
   * medida contra sí misma, lo que el revisor ya hubiera tocado en la original
   * dejaría de contar como editado.
   */
  original?: Registro
  /** La ficha de la que esta es copia, para dejarlo dicho en el historial. */
  copiaDe?: string
}

/**
 * Mete una ficha en revisión, tomando lo que tiene ahora como su versión
 * original.
 *
 * Es la puerta por la que entrará la ingesta de los libros: crea la ficha como
 * borrador y la registra aquí con su libro, su capítulo y su lote. Y es lo que
 * hace el botón «Enviar a revisión» del editor, para lo que un administrador
 * quiera que se revise aunque no venga de la ingesta.
 *
 * La original se guarda depurada con el esquema del panel, la misma forma que
 * tendrá cada guardado: comparar una ficha cruda de Payload —con sus relaciones
 * pobladas y sus campos internos— contra una depurada contaría como editado lo
 * que solo cambió de forma.
 */
export async function registrarParaRevision(
  payload: Payload,
  entrada: DatosDeOrigen & { coleccion: string; documentoId: string; usuarioId: string | null },
): Promise<{ id: string }> {
  if (!esModuloEnRevision(entrada.coleccion)) {
    throw new Error('Solo las fichas de los cinco módulos entran en revisión.')
  }
  if (await revisionDe(payload, entrada.coleccion, entrada.documentoId)) {
    throw new Error('Esta ficha ya está en revisión.')
  }
  const esquema = esquemaDe(entrada.coleccion)
  const documento = (await payload.findByID({
    collection: entrada.coleccion as never,
    id: entrada.documentoId,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })) as unknown as Registro
  const actual = depurarDocumento(esquema, documento)
  const original = entrada.original ?? actual
  const medida = medirEdicion(palabrasPorSeccion(esquema, original), palabrasPorSeccion(esquema, actual))

  const historial = [
    entradaDeHistorial('registrada', entrada.usuarioId, {
      detalle: [
        entrada.copiaDe && `copia de la ficha #${entrada.copiaDe}`,
        entrada.libro,
        entrada.capitulo && `cap. ${entrada.capitulo}`,
        entrada.paginas && `págs. ${entrada.paginas}`,
      ]
        .filter(Boolean)
        .join(' · '),
      porcentaje: medida.porcentaje,
    }),
    ...(entrada.asignadaA ? [entradaDeHistorial('asignada', entrada.usuarioId)] : []),
  ]
  const creada = await payload.create({
    collection: 'revisiones',
    overrideAccess: true,
    data: {
      coleccion: entrada.coleccion as never,
      documentoId: entrada.documentoId,
      titulo: tituloDe(esquema, documento),
      origen: entrada.origen ?? 'ia',
      libro: entrada.libro ?? null,
      capitulo: entrada.capitulo ?? null,
      paginas: entrada.paginas ?? null,
      lote: entrada.lote ?? null,
      modelo: entrada.modelo ?? null,
      archivoFuente: entrada.archivoFuente ?? null,
      notasParaElRevisor: entrada.notasParaElRevisor?.length ? entrada.notasParaElRevisor : null,
      estado: 'pendiente',
      asignadaA: entrada.asignadaA ? Number(entrada.asignadaA) : null,
      original,
      palabrasOriginales: medida.palabrasOriginales,
      palabrasActuales: medida.palabrasActuales,
      palabrasQuitadas: medida.palabrasQuitadas,
      palabrasNuevas: medida.palabrasNuevas,
      porcentajeEditado: medida.porcentaje,
      porSeccion: medida.porSeccion,
      historial,
    } as never,
  })
  return { id: String((creada as { id: unknown }).id) }
}

/**
 * Lo que un guardado le hace a la revisión: la medida al día y, según quién
 * guarde, el estado.
 *
 * Un revisor que guarda una ficha pendiente o devuelta la pone «en revisión».
 *
 * **Una ficha con firmas (D-240)** las pierde si el guardado cambió lo firmado,
 * lo guarde quien lo guarde, administrador incluido: una firma dice «este texto
 * lo revisé», y otro texto no lo revisó nadie. Si estaba lista o publicada,
 * vuelve a «en revisión». Guardar sin cambiar nada —el mismo texto, la misma
 * huella— no borra nada. Antes de las firmas, el administrador podía retocar una
 * ficha validada sin reabrirla (D-142); con dos profesiones firmando, ese
 * retoque publicaría con sus nombres un texto que no vieron.
 *
 * Una ficha validada antes de las firmas no tiene huella, y sigue la regla de
 * siempre: la reabre el guardado de un revisor, no el del administrador.
 *
 * `publicada` es el guardado con «Publicar» del administrador: entonces la
 * ficha pasa a publicada, y si no tenía las dos firmas —o las tenía sobre otro
 * texto—, se anota.
 */
export async function anotarGuardado(
  payload: Payload,
  entrada: {
    esquema: EsquemaDeColeccion
    documentoId: string
    /** Lo que se acaba de guardar, ya depurado. */
    documento: Registro
    usuarioId: string
    esAdmin: boolean
    publicada: boolean
  },
): Promise<void> {
  const revision = await revisionDe(payload, entrada.esquema.slug, entrada.documentoId, { conOriginal: true })
  if (!revision) return
  const medida = medirEdicion(
    palabrasPorSeccion(entrada.esquema, revision.original as Registro),
    palabrasPorSeccion(entrada.esquema, entrada.documento),
  )
  const estado = revision.estado as EstadoDeRevision
  const nuevas: ReturnType<typeof entradaDeHistorial>[] = []
  let nuevoEstado: EstadoDeRevision = estado
  const extra: Registro = {}
  const firmas = firmasDe(revision)
  // Solo se lee la ficha otra vez si hay firmas que defender: es una consulta
  // más por guardado, y el autoguardado guarda cada pocos segundos.
  const firmasCaducadas =
    tieneAlguna(firmas) &&
    (typeof revision.huellaFirmada !== 'string' ||
      revision.huellaFirmada !== (await huellaGuardada(payload, entrada.esquema, entrada.documentoId)))
  if (firmasCaducadas) Object.assign(extra, SIN_FIRMAS)
  if (entrada.publicada) {
    const validada = estado === 'lista' && !firmasCaducadas
    nuevoEstado = 'publicada'
    extra.publicadaEn = new Date().toISOString()
    extra.publicadaPor = Number(entrada.usuarioId)
    extra.publicadaSinValidar = !validada
    nuevas.push(
      entradaDeHistorial('publicada', entrada.usuarioId, {
        porcentaje: medida.porcentaje,
        detalle: validada
          ? undefined
          : firmasCaducadas
            ? `Publicada con cambios posteriores a ${lasFirmasDe(firmas)}, que se borraron.`
            : tieneAlguna(firmas)
              ? `Publicada sin la firma de ${alguienDe(firmasQueFaltan(firmas)[0])}.`
              : 'Publicada sin que nadie la validara.',
      }),
    )
  } else if (firmasCaducadas) {
    nuevoEstado = 'en-revision'
    nuevas.push(
      entradaDeHistorial('reabierta', entrada.usuarioId, {
        porcentaje: medida.porcentaje,
        detalle:
          estado === 'publicada'
            ? `Se editó después de publicarla: se borraron ${lasFirmasDe(firmas)} y el cambio queda en borrador hasta que se vuelva a firmar.`
            : `Se editó después de firmarla: se borraron ${lasFirmasDe(firmas)} y hay que volver a firmarla.`,
      }),
    )
  } else if (estado === 'pendiente' || estado === 'devuelta') {
    nuevoEstado = 'en-revision'
  } else if ((estado === 'lista' || estado === 'publicada') && !entrada.esAdmin && !tieneAlguna(firmas)) {
    nuevoEstado = 'en-revision'
    nuevas.push(
      entradaDeHistorial('reabierta', entrada.usuarioId, {
        porcentaje: medida.porcentaje,
        detalle:
          estado === 'lista'
            ? 'Se editó después de validarla: hay que volver a validarla.'
            : 'Se editó después de publicarla: el cambio queda en borrador hasta que se valide.',
      }),
    )
  }

  await payload.update({
    collection: 'revisiones',
    id: String(revision.id),
    overrideAccess: true,
    data: {
      titulo: tituloDe(entrada.esquema, entrada.documento),
      palabrasActuales: medida.palabrasActuales,
      palabrasQuitadas: medida.palabrasQuitadas,
      palabrasNuevas: medida.palabrasNuevas,
      porcentajeEditado: medida.porcentaje,
      porSeccion: medida.porSeccion,
      ultimaEdicion: new Date().toISOString(),
      ultimoEditor: Number(entrada.usuarioId),
      estado: nuevoEstado,
      ...extra,
      ...(nuevas.length > 0 ? { historial: historialCon(revision, ...nuevas) } : {}),
    } as never,
  })
}

/** Publicar o retirar una ficha en revisión desde el listado o el botón «Retirar». */
export async function anotarPublicacion(
  payload: Payload,
  entrada: { coleccion: string; documentoId: string; usuarioId: string; publicar: boolean },
): Promise<void> {
  const revision = await revisionDe(payload, entrada.coleccion, entrada.documentoId)
  if (!revision) return
  const estado = revision.estado as EstadoDeRevision
  if (entrada.publicar) {
    await payload.update({
      collection: 'revisiones',
      id: String(revision.id),
      overrideAccess: true,
      data: {
        estado: 'publicada',
        publicadaEn: new Date().toISOString(),
        publicadaPor: Number(entrada.usuarioId),
        publicadaSinValidar: estado !== 'lista',
        historial: historialCon(
          revision,
          entradaDeHistorial('publicada', entrada.usuarioId, {
            porcentaje: Number(revision.porcentajeEditado ?? 0),
            detalle: estado !== 'lista' ? 'Publicada sin que nadie la validara.' : undefined,
          }),
        ),
      } as never,
    })
    return
  }
  // Retirada: vuelve a donde estaba antes de publicarse. Con las dos firmas,
  // lista; si no, en revisión, a esperar la que falta. Antes miraba `listaEn`,
  // que se conserva como la foto de la última validación aunque después se
  // reabra, y una ficha reabierta y retirada volvía a «lista» sin que nadie la
  // hubiera validado otra vez.
  await payload.update({
    collection: 'revisiones',
    id: String(revision.id),
    overrideAccess: true,
    data: {
      estado: tieneLasDos(firmasDe(revision)) ? 'lista' : 'en-revision',
      historial: historialCon(revision, entradaDeHistorial('retirada', entrada.usuarioId)),
    } as never,
  })
}

/**
 * Lo que un revisor ha dedicado a una ficha, sumando sus sesiones; sin
 * `usuarioId`, lo de todos.
 */
export async function tiempoDe(
  payload: Payload,
  coleccion: string,
  documentoId: string,
  usuarioId?: string,
): Promise<TiempoDeRevision> {
  const { docs } = await payload.find({
    collection: 'sesiones-de-revision',
    where: {
      and: [
        { coleccion: { equals: coleccion } },
        { documentoId: { equals: documentoId } },
        ...(usuarioId ? [{ usuario: { equals: usuarioId } }] : []),
      ],
    },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  return sumarTiempos(
    (docs as unknown as Registro[]).map((d) => ({
      segundosAbiertos: Number(d.segundosAbiertos ?? 0),
      segundosActivos: Number(d.segundosActivos ?? 0),
      ediciones: Number(d.ediciones ?? 0),
      porSeccion: (d.porSeccion ?? {}) as Record<string, number>,
    })),
  )
}

/**
 * Cuánto se da por bueno de un latido: el tiempo que de verdad pasó desde el
 * anterior, con cinco segundos de holgura por lo que tarda en viajar.
 *
 * Para la primera fila de una sesión no hay anterior: se admite hasta un
 * minuto, que cubre el primer latido —a los quince segundos— y uno que se
 * reintentó tras un corte de red. Lo que el navegador diga de más se pierde:
 * inflar el propio tiempo de revisión no debe estar al alcance de una consola.
 */
export function segundosAdmisibles(ultimoLatido: unknown, ahora: number): number {
  const antes = typeof ultimoLatido === 'string' ? Date.parse(ultimoLatido) : Number.NaN
  if (Number.isNaN(antes)) return 60
  return Math.max(0, (ahora - antes) / 1000) + 5
}

/**
 * El techo de un latido, mirando también a la cuenta y no solo a su sesión.
 *
 * `segundosAdmisibles` recorta por sesión, y la sesión la inventa el navegador:
 * un identificador nuevo en cada llamada traía su minuto de primera fila cada
 * vez, y una consola que llamara a `latidoDeRevision` en bucle se abonaba horas
 * de revisión en segundos —justo lo que la alarma de «validación rápida»
 * existe para notar, y por la puerta que su cabecera da por cerrada—. Sin
 * trampa pasaba lo mismo a menor escala: dos pestañas abiertas contaban doble.
 *
 * Así que además nada puede pasar del tiempo real transcurrido desde el último
 * latido **de la cuenta**, en cualquier ficha y cualquier sesión: una persona
 * revisa una cosa a la vez. Este segundo techo va sin holgura a propósito. Los
 * cinco segundos de `segundosAdmisibles` se pagan una vez por llamada, y
 * repetidos a ráfagas volvían a ser la puerta abierta; lo que cuesta quitarlos
 * es que un latido que llega antes de tiempo pierde esa fracción.
 *
 * Sin latido anterior de la cuenta, solo manda el de la sesión.
 */
export function techoDelLatido(
  ultimoDeLaSesion: unknown,
  ultimoDeLaCuenta: unknown,
  ahora: number,
): number {
  const porSesion = segundosAdmisibles(ultimoDeLaSesion, ahora)
  const antes = typeof ultimoDeLaCuenta === 'string' ? Date.parse(ultimoDeLaCuenta) : Number.NaN
  if (Number.isNaN(antes)) return porSesion
  return Math.min(porSesion, Math.max(0, (ahora - antes) / 1000))
}

/**
 * Pone en fila los latidos de una misma cuenta.
 *
 * El techo de `techoDelLatido` lee el último latido y después escribe el suyo:
 * dos llamadas a la vez leerían el mismo y se abonarían cada una el hueco
 * entero, así que cien en paralelo valían cien veces el tiempo. En fila, cada
 * una ve lo que escribió la anterior. De paso deja de chocar el primer latido
 * doble de una sesión nueva contra el índice único de `sesion`.
 *
 * Vive en la memoria del proceso, como el freno de `src/lib/ritmo.ts` y por la
 * misma razón: la plataforma corre en un solo proceso. Cuelga de `globalThis`
 * para que dos copias del módulo no sean dos filas.
 */
const FILAS_DE_LATIDOS = Symbol.for('traumahub.latidosDeRevision')

function enFilaDeLaCuenta<T>(usuarioId: string, tarea: () => Promise<T>): Promise<T> {
  const global = globalThis as unknown as { [FILAS_DE_LATIDOS]?: Map<string, Promise<unknown>> }
  const filas = (global[FILAS_DE_LATIDOS] ??= new Map())
  const esta = (filas.get(usuarioId) ?? Promise.resolve()).then(tarea)
  const cola = esta.catch(() => undefined)
  filas.set(usuarioId, cola)
  // La fila se borra al vaciarse, o el mapa guardaría una entrada por cuenta
  // para siempre.
  void cola.then(() => {
    if (filas.get(usuarioId) === cola) filas.delete(usuarioId)
  })
  return esta
}

const acotar = (valor: unknown, techo: number): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.min(Math.max(0, Math.round(valor)), Math.floor(techo)) : 0

/**
 * Suma un latido del editor a su sesión (ver `useSeguimientoDeRevision`).
 *
 * Devuelve `false` si la ficha no está en revisión: el editor lo manda igual y
 * no pasa nada. Una sesión que ya existe tiene que ser del mismo revisor y de
 * la misma ficha: si no, el identificador se está reutilizando para sumar
 * tiempo en otra parte, y se rechaza. Lo que se abona sale de `techoDelLatido`,
 * y los de una misma cuenta van en fila (`enFilaDeLaCuenta`).
 */
export function anotarLatido(
  payload: Payload,
  entrada: Parameters<typeof anotarLatidoEnFila>[1],
): Promise<boolean> {
  return enFilaDeLaCuenta(entrada.usuarioId, () => anotarLatidoEnFila(payload, entrada))
}

async function anotarLatidoEnFila(
  payload: Payload,
  entrada: {
    esquema: EsquemaDeColeccion
    documentoId: string
    usuarioId: string
    sesion: string
    abiertos: unknown
    activos: unknown
    porSeccion: unknown
    ediciones: unknown
  },
): Promise<boolean> {
  const revision = await revisionDe(payload, entrada.esquema.slug, entrada.documentoId)
  if (!revision) return false

  const { docs } = await payload.find({
    collection: 'sesiones-de-revision',
    where: { sesion: { equals: entrada.sesion } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existente = docs[0] as unknown as Registro | undefined
  if (
    existente &&
    (idDe(existente.usuario) !== entrada.usuarioId ||
      existente.coleccion !== entrada.esquema.slug ||
      existente.documentoId !== entrada.documentoId)
  ) {
    throw new Error('Esa sesión de revisión es de otra ficha o de otra cuenta.')
  }

  const { docs: ultimos } = await payload.find({
    collection: 'sesiones-de-revision',
    where: { usuario: { equals: entrada.usuarioId } },
    sort: '-ultimoLatido',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { ultimoLatido: true },
  })
  const ultimoDeLaCuenta = (ultimos[0] as unknown as Registro | undefined)?.ultimoLatido

  const ahora = Date.now()
  const techo = techoDelLatido(existente?.ultimoLatido, ultimoDeLaCuenta, ahora)
  const abiertos = acotar(entrada.abiertos, techo)
  const activos = acotar(entrada.activos, abiertos)
  // Solo secciones que existen en la ficha, y nunca más de lo activo en total.
  const titulos = new Set(entrada.esquema.secciones.map((s) => s.titulo))
  const porSeccion: Record<string, number> = { ...((existente?.porSeccion ?? {}) as Record<string, number>) }
  let repartido = 0
  if (entrada.porSeccion && typeof entrada.porSeccion === 'object') {
    for (const [seccion, segundos] of Object.entries(entrada.porSeccion as Record<string, unknown>)) {
      if (!titulos.has(seccion)) continue
      const suyos = acotar(segundos, activos - repartido)
      if (suyos === 0) continue
      repartido += suyos
      porSeccion[seccion] = (porSeccion[seccion] ?? 0) + suyos
    }
  }
  const ediciones = acotar(entrada.ediciones, 10_000)
  const cuando = new Date(ahora).toISOString()

  if (existente) {
    await payload.update({
      collection: 'sesiones-de-revision',
      id: String(existente.id),
      overrideAccess: true,
      data: {
        segundosAbiertos: Number(existente.segundosAbiertos ?? 0) + abiertos,
        segundosActivos: Number(existente.segundosActivos ?? 0) + activos,
        porSeccion,
        ediciones: Number(existente.ediciones ?? 0) + ediciones,
        ultimoLatido: cuando,
      } as never,
    })
  } else {
    await payload.create({
      collection: 'sesiones-de-revision',
      overrideAccess: true,
      data: {
        usuario: Number(entrada.usuarioId),
        coleccion: entrada.esquema.slug as never,
        documentoId: entrada.documentoId,
        sesion: entrada.sesion,
        // Cuándo empezó: lo que se admitió como abierto, hacia atrás.
        inicio: new Date(ahora - abiertos * 1000).toISOString(),
        ultimoLatido: cuando,
        segundosAbiertos: abiertos,
        segundosActivos: activos,
        porSeccion,
        ediciones,
      } as never,
    })
  }

  // Alguien la tiene delante: ya no está esperando a nadie.
  if (revision.estado === 'pendiente' && activos > 0) {
    await payload.update({
      collection: 'revisiones',
      id: String(revision.id),
      overrideAccess: true,
      data: { estado: 'en-revision' } as never,
    })
  }
  return true
}

/** Suma un guardado a la sesión del editor que lo hizo, si la hay. */
export async function anotarGuardadoEnLaSesion(
  payload: Payload,
  sesion: unknown,
  usuarioId: string,
): Promise<void> {
  if (typeof sesion !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(sesion)) return
  const { docs } = await payload.find({
    collection: 'sesiones-de-revision',
    where: { sesion: { equals: sesion } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existente = docs[0] as unknown as Registro | undefined
  if (!existente || idDe(existente.usuario) !== usuarioId) return
  await payload.update({
    collection: 'sesiones-de-revision',
    id: String(existente.id),
    overrideAccess: true,
    data: { guardados: Number(existente.guardados ?? 0) + 1 } as never,
  })
}

export interface ResultadoDeValidar {
  /** No se escribió nada: la validación parece rápida y hay que confirmarla. */
  necesitaConfirmacion: boolean
  juicio: JuicioDeLaValidacion
  porcentaje: number
  segundosActivos: number
  /** Con qué profesión firmó. */
  profesion: Profesion
  /** Con esta firma están las dos, y la ficha quedó lista para publicar. */
  completa: boolean
}

/**
 * «Firmar como médico» o «como kinesiólogo» (D-240), lo que antes era «Listo
 * para publicar»: el revisor da la ficha por buena con la firma de su
 * profesión, que dice su cuenta y no él. Con la primera firma la ficha sigue en
 * revisión; con la segunda queda lista, y `listaPor`, `listaEn` y los números
 * «al validar» son los de quien completó: es el momento en que la ficha pasó a
 * poder publicarse, que es lo que siempre midieron. Los de la primera quedan en
 * su fila del historial. Una ficha ya publicada sin firmas también se puede
 * firmar, para ponerle las firmas a lo que se publicó antes de que existieran;
 * no cambia de estado.
 *
 * Primero se juzga con lo que el propio revisor ha dedicado a la ficha —sus
 * sesiones, no las de otros— y, si parece hecha sin leer
 * (`evaluarValidacion`), no se escribe nada hasta que confirme: el editor le
 * enseña por qué y le deja seguir. Confirmada, se marca igual y queda
 * señalada. Es una señal para el administrador, no una prohibición: el
 * revisor puede haberla leído en papel.
 *
 * Exige la ficha completa, como publicar: «lista para publicar» con un campo
 * obligatorio vacío no es una promesa que se pueda cumplir.
 */
export async function validarRevision(
  payload: Payload,
  entrada: {
    esquema: EsquemaDeColeccion
    documentoId: string
    usuarioId: string
    nota?: string
    confirmada: boolean
  },
): Promise<ResultadoDeValidar> {
  const revision = await revisionDe(payload, entrada.esquema.slug, entrada.documentoId, { conOriginal: true })
  if (!revision) throw new Error('Esta ficha no está en revisión.')
  const cuenta = (await payload.findByID({
    collection: 'usuarios',
    id: entrada.usuarioId,
    depth: 0,
    overrideAccess: true,
    select: { profesion: true },
  })) as unknown as Registro
  let firmas = firmasDe(revision)
  const motivo = porQueNoPuedeFirmar(firmas, { id: entrada.usuarioId, profesion: cuenta.profesion })
  if (motivo !== null) throw new Error(motivo)
  const profesion = cuenta.profesion as Profesion

  const documento = depurarDocumento(
    entrada.esquema,
    (await payload.findByID({
      collection: entrada.esquema.slug as never,
      id: entrada.documentoId,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })) as unknown as Registro,
  )
  const problemas = faltantes(entrada.esquema, documento, { profundo: true })
  if (problemas.length > 0) {
    throw new Error(`Antes de darla por lista hay que completarla: ${problemas.join(' ')}`)
  }

  const secciones = palabrasPorSeccion(entrada.esquema, documento)
  const palabras = secciones.reduce((total, s) => total + s.palabras.length, 0)
  const conContenido = secciones.filter((s) => s.palabras.length > 0).map((s) => s.seccion)
  const tiempo = await tiempoDe(payload, entrada.esquema.slug, entrada.documentoId, entrada.usuarioId)
  const vistas = seccionesVistas(tiempo.porSeccion)
  const juicio = evaluarValidacion({
    palabras,
    segundosActivos: tiempo.segundosActivos,
    seccionesConContenido: conContenido,
    vistas,
  })
  const medida = medirEdicion(palabrasPorSeccion(entrada.esquema, revision.original as Registro), secciones)

  if (juicio.rapida && !entrada.confirmada) {
    return {
      necesitaConfirmacion: true,
      juicio,
      porcentaje: medida.porcentaje,
      segundosActivos: tiempo.segundosActivos,
      profesion,
      completa: false,
    }
  }

  // La otra firma vale solo si es del mismo texto. Un guardado que lo cambia ya
  // la borra (`anotarGuardado`); esto cubre lo que no pasó por ahí —una
  // escritura a mano en la base, un guardado que falló a medias—, para que una
  // firma vieja no complete una ficha que su firmante no vio así.
  const huella = huellaDe(documento)
  const otra = laOtra(profesion)
  const otraVigente = firmas[otra] !== null && revision.huellaFirmada === huella
  if (!otraVigente) firmas = { ...firmas, [otra]: null }
  const completa = otraVigente
  const ahora = new Date().toISOString()
  const nota = entrada.nota?.trim().slice(0, 2000) || null
  const vistasConContenido = conContenido.filter((s) => vistas.includes(s)).length
  const conProfesion = (texto: string) => `${firmaComo(profesion).replace(/^c/, 'C')}: ${texto}`
  // La señal y la nota de la primera firma no se pierden con la segunda: se
  // suman, cada una con su profesión delante.
  const sumar = (anterior: unknown, nuevo: string | null) =>
    [otraVigente && typeof anterior === 'string' ? anterior : '', nuevo === null ? '' : conProfesion(nuevo)]
      .filter(Boolean)
      .join('\n') || null
  const campos = CAMPOS_DE_FIRMA[profesion]
  const yaPublicada = revision.estado === 'publicada'
  // Publicada o validada antes de que hubiera firmas, la ficha se queda donde
  // está mientras le falte una: firmarla es completarla, y una primera firma que
  // la bajara a «en revisión» castigaría a quien vino a ponerla.
  const estado: EstadoDeRevision = yaPublicada
    ? 'publicada'
    : completa
      ? 'lista'
      : revision.estado === 'lista'
        ? 'lista'
        : 'en-revision'
  await payload.update({
    collection: 'revisiones',
    id: String(revision.id),
    overrideAccess: true,
    data: {
      ...(otraVigente ? {} : { [CAMPOS_DE_FIRMA[otra].por]: null, [CAMPOS_DE_FIRMA[otra].en]: null }),
      [campos.por]: Number(entrada.usuarioId),
      [campos.en]: ahora,
      huellaFirmada: huella,
      estado,
      ...(completa
        ? {
            listaPor: Number(entrada.usuarioId),
            listaEn: ahora,
            segundosActivosAlValidar: tiempo.segundosActivos,
            segundosAbiertosAlValidar: tiempo.segundosAbiertos,
            porcentajeAlValidar: medida.porcentaje,
            ritmoAlValidar: juicio.ritmo,
            seccionesVistasAlValidar: vistasConContenido,
            seccionesConContenido: conContenido.length,
          }
        : {}),
      validacionRapida: (otraVigente && revision.validacionRapida === true) || juicio.rapida,
      motivosDeAlerta: sumar(revision.motivosDeAlerta, juicio.motivos.length > 0 ? juicio.motivos.join('; ') : null),
      notaDeRevision: sumar(revision.notaDeRevision, nota),
      palabrasActuales: medida.palabrasActuales,
      palabrasQuitadas: medida.palabrasQuitadas,
      palabrasNuevas: medida.palabrasNuevas,
      porcentajeEditado: medida.porcentaje,
      porSeccion: medida.porSeccion,
      historial: historialCon(
        revision,
        entradaDeHistorial(completa && !yaPublicada ? 'lista' : 'firmada', entrada.usuarioId, {
          porcentaje: medida.porcentaje,
          segundosActivos: tiempo.segundosActivos,
          detalle: [
            `${conProfesion(completa ? 'con las dos firmas' : `falta la de ${alguienDe(otra)}`)}.`,
            juicio.rapida ? `Señalada: ${juicio.motivos.join('; ')}.` : '',
            nota ?? '',
          ]
            .filter(Boolean)
            .join(' '),
        }),
      ),
    } as never,
  })
  return {
    necesitaConfirmacion: false,
    juicio,
    porcentaje: medida.porcentaje,
    segundosActivos: tiempo.segundosActivos,
    profesion,
    completa,
  }
}

/** El administrador devuelve una ficha al revisor, con el porqué. */
export async function devolverRevision(
  payload: Payload,
  entrada: { coleccion: string; documentoId: string; usuarioId: string; motivo: string },
): Promise<void> {
  const revision = await revisionDe(payload, entrada.coleccion, entrada.documentoId)
  if (!revision) throw new Error('Esta ficha no está en revisión.')
  if (revision.estado === 'publicada') {
    throw new Error('Está publicada: retírela de publicación antes de devolverla.')
  }
  await payload.update({
    collection: 'revisiones',
    id: String(revision.id),
    overrideAccess: true,
    data: {
      estado: 'devuelta',
      // Devuelta, lo firmado no convenció: las firmas se van con ella, y quien
      // la corrija la vuelve a firmar con la otra profesión (D-240).
      ...SIN_FIRMAS,
      motivoDeDevolucion: entrada.motivo,
      devoluciones: Number(revision.devoluciones ?? 0) + 1,
      historial: historialCon(revision, entradaDeHistorial('devuelta', entrada.usuarioId, { detalle: entrada.motivo })),
    } as never,
  })
}

/** Asigna, o desasigna con `null`, varias fichas a la vez. Devuelve cuántas cambió. */
export async function asignarRevisiones(
  payload: Payload,
  entrada: { fichas: { coleccion: string; documentoId: string }[]; asignadaA: string | null; usuarioId: string },
): Promise<number> {
  let cambiadas = 0
  for (const ficha of entrada.fichas) {
    const revision = await revisionDe(payload, ficha.coleccion, ficha.documentoId)
    if (!revision || idDe(revision.asignadaA) === entrada.asignadaA) continue
    await payload.update({
      collection: 'revisiones',
      id: String(revision.id),
      overrideAccess: true,
      data: {
        asignadaA: entrada.asignadaA === null ? null : Number(entrada.asignadaA),
        historial: historialCon(
          revision,
          entradaDeHistorial('asignada', entrada.usuarioId, {
            detalle: entrada.asignadaA === null ? 'Sin asignar.' : undefined,
          }),
        ),
      } as never,
    })
    cambiadas += 1
  }
  return cambiadas
}

/**
 * Saca una ficha de revisión, o limpia su rastro al borrarla: la fila de la
 * revisión y las sesiones de tiempo que colgaban de ella.
 */
export async function quitarDeRevision(
  payload: Payload,
  coleccion: string,
  documentoId: string,
): Promise<void> {
  if (!esModuloEnRevision(coleccion)) return
  const donde = { and: [{ coleccion: { equals: coleccion } }, { documentoId: { equals: documentoId } }] }
  await payload.delete({ collection: 'sesiones-de-revision', where: donde as never, overrideAccess: true })
  await payload.delete({ collection: 'revisiones', where: donde as never, overrideAccess: true })
}

// ------------------------------------------------------ lo que ve el editor

export interface RevisionParaElEditor {
  estado: EstadoDeRevision
  origen: OrigenDeContenido
  libro: string | null
  capitulo: string | null
  paginas: string | null
  lote: string | null
  modelo: string | null
  asignadaA: { id: string; nombre: string } | null
  listaPor: string | null
  listaEn: string | null
  validacionRapida: boolean
  motivosDeAlerta: string | null
  notaDeRevision: string | null
  motivoDeDevolucion: string | null
  /** Las dos firmas, con el nombre de quien firmó (D-240). */
  firmas: FirmasDeLaFicha
  /** La profesión de quien abre la ficha, que decide qué firma pondría. */
  miProfesion: Profesion | null
  /** Por qué quien abre la ficha no puede firmarla, o `null` si puede. */
  noPuedeFirmar: string | null
  /** Lo que lleva dedicado quien abre la ficha, para enseñárselo. */
  mio: { segundosActivos: number; vistas: string[] }
  /** Solo para el administrador: la medida contra el original. */
  medida: { porcentaje: number; palabrasOriginales: number; palabrasActuales: number } | null
}

const nombreDeCuenta = (cuenta: unknown): string | null => {
  if (!cuenta || typeof cuenta !== 'object') return null
  const registro = cuenta as Registro
  return (
    (typeof registro.nombre === 'string' && registro.nombre.trim()) ||
    (typeof registro.email === 'string' && registro.email) ||
    null
  )
}

/**
 * La revisión de una ficha tal como la enseña su editor, o `null` si no está
 * en revisión. Lo que cruza al navegador es solo esto: ni la versión original
 * ni las sesiones de otros revisores.
 */
export async function revisionParaElEditor(
  payload: Payload,
  coleccion: string,
  documentoId: string,
  usuario: { id: string; esAdmin: boolean; profesion?: unknown },
): Promise<RevisionParaElEditor | null> {
  if (!esModuloEnRevision(coleccion)) return null
  const { docs } = await payload.find({
    collection: 'revisiones',
    where: { and: [{ coleccion: { equals: coleccion } }, { documentoId: { equals: documentoId } }] },
    limit: 1,
    depth: 1,
    overrideAccess: true,
    select: { original: false, historial: false },
  })
  const revision = docs[0] as unknown as Registro | undefined
  if (!revision) return null
  const tiempo = await tiempoDe(payload, coleccion, documentoId, usuario.id)
  const asignada = revision.asignadaA as Registro | null
  const texto = (valor: unknown) => (typeof valor === 'string' && valor.trim() !== '' ? valor : null)
  const firmas = firmasDe(revision)
  return {
    firmas,
    miProfesion: esProfesion(usuario.profesion) ? usuario.profesion : null,
    noPuedeFirmar: porQueNoPuedeFirmar(firmas, { id: usuario.id, profesion: usuario.profesion }),
    estado: revision.estado as EstadoDeRevision,
    origen: (revision.origen as OrigenDeContenido) ?? 'ia',
    libro: texto(revision.libro),
    capitulo: texto(revision.capitulo),
    paginas: texto(revision.paginas),
    lote: texto(revision.lote),
    modelo: texto(revision.modelo),
    asignadaA:
      asignada && typeof asignada === 'object'
        ? { id: String(asignada.id), nombre: nombreDeCuenta(asignada) ?? `#${String(asignada.id)}` }
        : null,
    listaPor: nombreDeCuenta(revision.listaPor),
    listaEn: texto(revision.listaEn),
    validacionRapida: revision.validacionRapida === true,
    motivosDeAlerta: texto(revision.motivosDeAlerta),
    notaDeRevision: texto(revision.notaDeRevision),
    motivoDeDevolucion: texto(revision.motivoDeDevolucion),
    mio: { segundosActivos: tiempo.segundosActivos, vistas: seccionesVistas(tiempo.porSeccion) },
    medida: usuario.esAdmin
      ? {
          porcentaje: Number(revision.porcentajeEditado ?? 0),
          palabrasOriginales: Number(revision.palabrasOriginales ?? 0),
          palabrasActuales: Number(revision.palabrasActuales ?? 0),
        }
      : null,
  }
}

/**
 * Quién dio por buena una ficha, para el pie del PDF.
 *
 * Solo el nombre y el día, que es lo que se imprime: ni el correo de quien
 * validó ni cuánto tardó, que son del administrador. `null` cuando la ficha no
 * entró nunca en revisión —lo escrito a mano antes de la ingesta—, y entonces
 * el PDF dice que no hay auditoría registrada en vez de inventar un nombre.
 *
 * `auditor` queda a `null` mientras nadie la haya validado, o si la cuenta de
 * quien lo hizo se borró: las dos cosas se imprimen distinto y por eso va el
 * `estado` aparte.
 */
export interface AuditorDeLaFicha {
  estado: EstadoDeRevision
  auditor: string | null
  fecha: string | null
  /** Las dos firmas, con nombre y día (D-240). */
  firmas: FirmasDeLaFicha
}

export async function auditorDeLaFicha(
  payload: Payload,
  coleccion: string,
  documentoId: string,
): Promise<AuditorDeLaFicha | null> {
  if (!esModuloEnRevision(coleccion)) return null
  const { docs } = await payload.find({
    collection: 'revisiones',
    where: { and: [{ coleccion: { equals: coleccion } }, { documentoId: { equals: documentoId } }] },
    limit: 1,
    depth: 1,
    overrideAccess: true,
    select: {
      estado: true,
      listaPor: true,
      listaEn: true,
      firmaMedicoPor: true,
      firmaMedicoEn: true,
      firmaKinesiologoPor: true,
      firmaKinesiologoEn: true,
    },
  })
  const revision = docs[0] as unknown as Registro | undefined
  if (!revision) return null
  const cuenta = revision.listaPor
  const nombre =
    cuenta && typeof cuenta === 'object' && typeof (cuenta as Registro).nombre === 'string'
      ? ((cuenta as Registro).nombre as string).trim()
      : ''
  return {
    estado: revision.estado as EstadoDeRevision,
    auditor: nombre === '' ? null : nombre,
    fecha: typeof revision.listaEn === 'string' ? revision.listaEn : null,
    firmas: firmasDe(revision),
  }
}

/**
 * Lo que el modelo dejó dicho para quien revise una ficha, o `null` si no está
 * en revisión (D-144).
 *
 * Va aparte de `revisionParaElEditor` porque lo lee la barra lateral del panel,
 * que no tiene el resto de la revisión ni la necesita: pide solo esto, y solo
 * cruza al navegador lo que se va a pintar.
 */
export interface NotasDeLaFicha {
  notas: string[]
  libro: string | null
  capitulo: string | null
  paginas: string | null
  archivoFuente: string | null
}

export async function notasDeLaFicha(
  payload: Payload,
  coleccion: string,
  documentoId: string,
): Promise<NotasDeLaFicha | null> {
  const revision = await revisionDe(payload, coleccion, documentoId)
  if (!revision) return null
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
  const notas = Array.isArray(revision.notasParaElRevisor)
    ? (revision.notasParaElRevisor as unknown[]).filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    : []
  return {
    notas,
    libro: texto(revision.libro),
    capitulo: texto(revision.capitulo),
    paginas: texto(revision.paginas),
    archivoFuente: texto(revision.archivoFuente),
  }
}
