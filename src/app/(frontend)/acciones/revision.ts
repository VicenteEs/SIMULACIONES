'use server'

/**
 * Acciones de la revisión del contenido (D-142).
 *
 * Las del revisor —el latido de tiempo y «Listo para publicar»— piden poder
 * editar el módulo de la ficha, igual que guardarla. Las del administrador
 * —devolver, asignar, enviar a revisión o sacar de ella— piden administrador:
 * son las que gobiernan a los revisores, y un editor no se asigna trabajo ni
 * se devuelve el suyo.
 *
 * La cuenta la hace `src/lib/revisionServidor.ts`; aquí solo se comprueba
 * quién llama y se limpia lo que llega, que viene del navegador.
 */

import { revalidatePath } from 'next/cache'
import { accion, exigirAdmin, exigirEdicionDe, type Respuesta } from '@/lib/guardias'
import { esquemaDe } from '@/admin/esquema'
import { exigirIdentificador, textoOpcional } from '@/lib/validacion'
import { cambioDesde, marcaDe, MENSAJE_DE_CONFLICTO } from '@/admin/concurrencia'
import { ORIGENES_DE_CONTENIDO, type OrigenDeContenido } from '@/lib/revision'
import {
  anotarLatido,
  anotarPublicacion,
  asignarRevisiones,
  devolverRevision,
  esModuloEnRevision,
  notasDeLaFicha as leerNotasDeLaFicha,
  quitarDeRevision,
  type NotasDeLaFicha,
  registrarParaRevision,
  revisionDe,
  validarRevision,
  type ResultadoDeValidar,
} from '@/lib/revisionServidor'

const RUTAS = ['/admin-panel', '/admin-panel/revision', '/admin-panel/auditoria']

const revalidar = (coleccion?: string, id?: string) => {
  for (const ruta of RUTAS) revalidatePath(ruta)
  if (coleccion) revalidatePath(`/admin-panel/contenido/${coleccion}`)
  if (coleccion && id) revalidatePath(`/admin-panel/contenido/${coleccion}/${id}`)
}

/** El módulo de una ficha en revisión, o se rechaza la llamada. */
function moduloValidado(coleccion: unknown): string {
  if (!esModuloEnRevision(coleccion)) throw new Error('Solo las fichas de los cinco módulos entran en revisión.')
  return coleccion
}

/** Un identificador de sesión de las que inventa el editor (`crypto.randomUUID`). */
function sesionValidada(sesion: unknown): string {
  if (typeof sesion !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(sesion)) {
    throw new Error('La sesión de revisión no es válida.')
  }
  return sesion
}

/**
 * Lo que el editor ha medido desde el latido anterior (ver
 * `useSeguimientoDeRevision`). Responde si la ficha estaba en revisión: el
 * editor deja de latir si no.
 */
export async function latidoDeRevision(
  coleccion: unknown,
  id: unknown,
  sesion: unknown,
  medido: unknown,
): Promise<Respuesta<{ enRevision: boolean }>> {
  return accion(async () => {
    const slug = moduloValidado(coleccion)
    const { payload, usuarioId } = await exigirEdicionDe(slug)
    const datos = (medido && typeof medido === 'object' ? medido : {}) as Record<string, unknown>
    const enRevision = await anotarLatido(payload, {
      esquema: esquemaDe(slug),
      documentoId: exigirIdentificador(id, 'La ficha'),
      usuarioId,
      sesion: sesionValidada(sesion),
      abiertos: datos.abiertos,
      activos: datos.activos,
      porSeccion: datos.porSeccion,
      ediciones: datos.ediciones,
    })
    return { enRevision }
  })
}

/**
 * «Listo para publicar».
 *
 * `marcaAlAbrir` es la del formulario, como al guardar: validar una ficha que
 * otra persona cambió entretanto sería firmar un texto que quien firma no ha
 * visto. Sin `confirmada`, una validación que parece rápida vuelve sin escribir
 * nada y con el porqué (`necesitaConfirmacion`).
 */
export async function marcarListaParaPublicar(
  coleccion: unknown,
  id: unknown,
  marcaAlAbrir: unknown,
  nota: unknown,
  confirmada: unknown,
): Promise<Respuesta<ResultadoDeValidar> & { conflicto?: boolean }> {
  let choque = false
  const respuesta = await accion(async () => {
    const slug = moduloValidado(coleccion)
    const { payload, usuarioId } = await exigirEdicionDe(slug)
    const esquema = esquemaDe(slug)
    const documentoId = exigirIdentificador(id, 'La ficha')
    if (typeof marcaAlAbrir === 'string') {
      const actual = await payload.findByID({
        collection: slug as never,
        id: documentoId,
        depth: 0,
        draft: true,
        overrideAccess: true,
      })
      if (cambioDesde(marcaAlAbrir, marcaDe(actual))) {
        choque = true
        throw new Error(MENSAJE_DE_CONFLICTO)
      }
    }
    const resultado = await validarRevision(payload, {
      esquema,
      documentoId,
      usuarioId,
      nota: textoOpcional(nota, 'La nota', 2000),
      confirmada: confirmada === true,
    })
    if (!resultado.necesitaConfirmacion) revalidar(slug, documentoId)
    return resultado
  })
  return choque ? { ...respuesta, conflicto: true } : respuesta
}

/**
 * Las notas que dejó el modelo para quien revisa esta ficha (D-144).
 *
 * Las lee la barra lateral del panel cada vez que se abre una ficha. Pide poder
 * editar el módulo, como el resto de lo que hace el revisor. Devuelve `null` si
 * la ficha no está en revisión, y entonces la barra no pinta nada.
 */
export async function notasDeLaFicha(
  coleccion: unknown,
  id: unknown,
): Promise<Respuesta<NotasDeLaFicha | null>> {
  return accion(async () => {
    const slug = moduloValidado(coleccion)
    const { payload } = await exigirEdicionDe(slug)
    return leerNotasDeLaFicha(payload, slug, exigirIdentificador(id, 'La ficha'))
  })
}

/** El administrador devuelve una ficha al revisor. El motivo es obligatorio: sin él no hay nada que corregir. */
export async function devolverAlRevisor(
  coleccion: unknown,
  id: unknown,
  motivo: unknown,
): Promise<Respuesta> {
  return accion(async () => {
    const slug = moduloValidado(coleccion)
    const { payload, usuarioId } = await exigirAdmin()
    const documentoId = exigirIdentificador(id, 'La ficha')
    const texto = textoOpcional(motivo, 'El motivo', 2000)
    if (!texto) throw new Error('Diga qué hay que revisar: el revisor lo verá al abrir la ficha.')
    await devolverRevision(payload, { coleccion: slug, documentoId, usuarioId, motivo: texto })
    revalidar(slug, documentoId)
    return null
  })
}

/**
 * Asigna varias fichas a un revisor, o las deja sin asignar (`revisor` nulo).
 * Solo a cuentas activas que puedan editar: asignarle trabajo a un lector, o a
 * una cuenta desactivada, lo dejaría sin hacer para siempre.
 */
export async function asignarRevisor(
  fichas: unknown,
  revisor: unknown,
): Promise<Respuesta<{ cambiadas: number }>> {
  return accion(async () => {
    const { payload, usuarioId } = await exigirAdmin()
    if (!Array.isArray(fichas) || fichas.length === 0) throw new Error('No se eligió ninguna ficha.')
    if (fichas.length > 1000) throw new Error('Demasiadas fichas de una vez: asigne de mil en mil.')
    const limpias = fichas.map((ficha) => {
      const registro = (ficha ?? {}) as Record<string, unknown>
      return {
        coleccion: moduloValidado(registro.coleccion),
        documentoId: exigirIdentificador(registro.id, 'La ficha'),
      }
    })
    let asignadaA: string | null = null
    if (revisor !== null && revisor !== '' && revisor !== undefined) {
      asignadaA = exigirIdentificador(revisor, 'El revisor')
      const cuenta = (await payload
        .findByID({ collection: 'usuarios', id: asignadaA, depth: 0, overrideAccess: true })
        .catch(() => null)) as Record<string, unknown> | null
      if (!cuenta || cuenta.activo !== true || (cuenta.rol !== 'editor' && cuenta.rol !== 'admin')) {
        throw new Error('Solo se puede asignar a una cuenta activa de editor o de administrador.')
      }
    }
    const cambiadas = await asignarRevisiones(payload, { fichas: limpias, asignadaA, usuarioId })
    revalidar()
    return { cambiadas }
  })
}

/**
 * Mete en revisión una ficha que ya existe, tomando lo que tiene ahora como su
 * versión original. Es la entrada a mano; la de la ingesta es la misma función
 * llamada desde el guion que cargue los libros.
 */
export async function enviarARevision(
  coleccion: unknown,
  id: unknown,
  datos: unknown,
): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const slug = moduloValidado(coleccion)
    const { payload, usuarioId } = await exigirAdmin()
    const documentoId = exigirIdentificador(id, 'La ficha')
    const d = (datos && typeof datos === 'object' ? datos : {}) as Record<string, unknown>
    const origen = ORIGENES_DE_CONTENIDO.some((o) => o.value === d.origen)
      ? (d.origen as OrigenDeContenido)
      : 'ia'
    const asignadaA =
      d.asignadaA === null || d.asignadaA === undefined || d.asignadaA === ''
        ? null
        : exigirIdentificador(d.asignadaA, 'El revisor')
    const creada = await registrarParaRevision(payload, {
      coleccion: slug,
      documentoId,
      usuarioId,
      origen,
      libro: textoOpcional(d.libro, 'El libro', 300),
      capitulo: textoOpcional(d.capitulo, 'El capítulo', 200),
      paginas: textoOpcional(d.paginas, 'Las páginas', 100),
      lote: textoOpcional(d.lote, 'El lote', 120),
      modelo: textoOpcional(d.modelo, 'El modelo', 120),
      asignadaA,
    })
    revalidar(slug, documentoId)
    return creada
  })
}

/** Saca una ficha de revisión: se borran su revisión y sus sesiones, y vuelve a publicarse como cualquier otra. */
export async function sacarDeRevision(coleccion: unknown, id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const slug = moduloValidado(coleccion)
    const { payload } = await exigirAdmin()
    const documentoId = exigirIdentificador(id, 'La ficha')
    await quitarDeRevision(payload, slug, documentoId)
    revalidar(slug, documentoId)
    return null
  })
}

/**
 * Publica de una vez las fichas elegidas que estén validadas (D-142).
 *
 * Es el final del trabajo de cada día con cientos de fichas: el administrador
 * mira en la auditoría lo que está listo y sin señales, y lo publica junto. Las
 * que no estén validadas se saltan y se cuentan: publicar sin validar es un
 * gesto que se hace de una en una, desde la ficha, y con la pregunta delante.
 * Se escribe como el «Publicar» del listado (`cambiarPublicacion`): `_status`
 * con `draft: false`, que publica el último borrador.
 *
 * Una ficha que falla no para a las demás, y se cuenta. Antes el primer fallo
 * salía por `accion()` como un error a secas: las publicadas hasta ahí quedaban
 * publicadas, la pantalla decía que no se había podido y no se refrescaba nada,
 * así que el administrador no sabía cuáles ya leían los residentes. Lo que
 * llega mal formado sí se rechaza entero, y antes de escribir nada.
 */
export async function publicarValidadas(
  fichas: unknown,
): Promise<
  Respuesta<{
    publicadas: number
    saltadas: number
    fallidas: { coleccion: string; id: string; motivo: string }[]
  }>
> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    if (!Array.isArray(fichas) || fichas.length === 0) throw new Error('No se eligió ninguna ficha.')
    if (fichas.length > 500) throw new Error('Demasiadas fichas de una vez: publique de quinientas en quinientas.')
    const limpias = fichas.map((ficha) => {
      const registro = (ficha ?? {}) as Record<string, unknown>
      return {
        slug: moduloValidado(registro.coleccion),
        documentoId: exigirIdentificador(registro.id, 'La ficha'),
      }
    })
    let publicadas = 0
    let saltadas = 0
    const fallidas: { coleccion: string; id: string; motivo: string }[] = []
    const tocadas = new Set<string>()
    try {
      for (const { slug, documentoId } of limpias) {
        // Publicada pero sin anotar no es lo mismo que sin publicar: los
        // residentes ya la leen, y decir que falló mandaría a publicarla otra vez.
        let publicada = false
        try {
          const revision = await revisionDe(payload, slug, documentoId)
          if (!revision || revision.estado !== 'lista') {
            saltadas += 1
            continue
          }
          await payload.update({
            collection: slug as never,
            id: documentoId,
            data: { _status: 'published' } as never,
            draft: false,
            user: usuario as never,
          })
          publicada = true
          publicadas += 1
          tocadas.add(slug)
          await anotarPublicacion(payload, { coleccion: slug, documentoId, usuarioId, publicar: true })
        } catch (error) {
          console.error(`[revision] no se pudo publicar ${slug} #${documentoId}:`, error)
          const detalle = error instanceof Error && error.message ? error.message : 'Error inesperado.'
          fallidas.push({
            coleccion: slug,
            id: documentoId,
            motivo: publicada ? `Se publicó, pero la revisión no lo anotó: ${detalle}` : detalle,
          })
        }
      }
    } finally {
      for (const slug of tocadas) revalidar(slug)
      if (tocadas.size === 0) revalidar()
    }
    return { publicadas, saltadas, fallidas }
  })
}

/** Las cuentas a las que se puede asignar una revisión: editores y administradores activos. */
export async function revisoresPosibles(): Promise<Respuesta<{ id: string; nombre: string; rol: string }[]>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const { docs } = await payload.find({
      collection: 'usuarios',
      where: { and: [{ activo: { equals: true } }, { rol: { in: ['editor', 'admin'] } }] },
      limit: 500,
      depth: 0,
      sort: 'nombre',
      overrideAccess: true,
      select: { nombre: true, email: true, rol: true },
    })
    return (docs as unknown as Record<string, unknown>[]).map((cuenta) => ({
      id: String(cuenta.id),
      nombre: String(cuenta.nombre || cuenta.email || `#${String(cuenta.id)}`),
      rol: String(cuenta.rol),
    }))
  })
}
