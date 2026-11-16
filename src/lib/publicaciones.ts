import type { PayloadRequest } from 'payload'

/**
 * Registro de publicaciones.
 *
 * Cuando se publica contenido sube la versión de su módulo, y los navegadores
 * conectados la reciben por el flujo de `/api/cambios`.
 *
 * Se guarda **por módulo** y no en un solo contador, y el motivo es de acceso,
 * no de comodidad. Una cuenta puede tener `modulosVisibles` restringido; si el
 * aviso dijera «hay contenido nuevo» ante cualquier publicación, un lector que
 * solo ve la biblioteca de patologías se enteraría de que se publicó algo en
 * cirugías, y al recargar no encontraría nada. Y si además el aviso nombra el
 * módulo, la fuga deja de ser sutil. Con el estado por módulo, cada quien
 * recibe la versión de lo suyo (decisión D-020).
 *
 * ## Dónde vive
 *
 * Vivió en la memoria del proceso: era efímero, y con un solo proceso bastaba.
 * Desde D-393 la aplicación corre en varios, y el flujo de una pestaña queda
 * abierto con uno cualquiera de ellos: si la publicación la atendió otro, ese
 * flujo no se enteraría nunca. La bitácora llegó a prometer para ese día el
 * LISTEN/NOTIFY de PostgreSQL; resultó más sencillo guardarla en la tabla
 * `publicaciones` (`tablasInternas.ts`), una fila por módulo, y que cada
 * proceso la relea cada pocos segundos. El flujo ya mandaba algo cada quince.
 *
 * La versión son los milisegundos del instante en que se publicó. Así crece
 * sola, es la misma para todos los procesos y sobrevive a un reinicio.
 *
 * Bajo Vitest (`NODE_ENV=test`) se guarda en memoria, como antes: las pruebas
 * de los ganchos no levantan una base. La de la base se prueba aparte
 * (`tests/integration/estadoCompartido.test.ts`).
 */

export interface Publicacion {
  /** Número de orden, para saber cuál fue la última. */
  version: number
  modulo: string
  titulo: string
}

export interface EstadoPublicaciones {
  /** Versión de lo que esta cuenta puede ver. Cero si no ha visto nada. */
  version: number
  /** Módulo de la última publicación visible, o null. */
  modulo: string | null
  /** Título de esa publicación, o null. */
  titulo: string | null
}

export interface RegistroDePublicaciones {
  registrar(modulo: string, titulo: string, req?: Partial<PayloadRequest>): Promise<void>
  /** La última publicación de cada módulo. */
  ultimas(): Promise<Publicacion[]>
}

/**
 * Lo último publicado que esta cuenta puede ver.
 *
 * `puedeVer` decide módulo a módulo. Sin él se devuelve todo, que es lo que
 * corresponde a un administrador.
 *
 * La versión es el **máximo** de las visibles y no su suma: crece si y solo si
 * se publica en un módulo que esta cuenta ve, que es justo la condición para
 * que le merezca la pena recargar.
 */
export function ultimaVisible(publicaciones: Publicacion[], puedeVer?: (modulo: string) => boolean): EstadoPublicaciones {
  let ultima: Publicacion | null = null
  for (const publicacion of publicaciones) {
    if (puedeVer && !puedeVer(publicacion.modulo)) continue
    if (!ultima || publicacion.version > ultima.version) ultima = publicacion
  }
  return {
    version: ultima?.version ?? 0,
    modulo: ultima?.modulo ?? null,
    titulo: ultima?.titulo ?? null,
  }
}

// ------------------------------------------------------------- en memoria

interface EstadoEnMemoria {
  version: number
  porModulo: Map<string, Publicacion>
}

// En globalThis para sobrevivir a las recargas del modo desarrollo, que
// reevalúan los módulos y perderían el contador en cada cambio de archivo.
const enMemoria = (): EstadoEnMemoria => {
  const global = globalThis as unknown as { __publicaciones?: EstadoEnMemoria }
  return (global.__publicaciones ??= { version: 0, porModulo: new Map() })
}

export const registroEnMemoria = (): RegistroDePublicaciones => ({
  async registrar(modulo, titulo) {
    const estado = enMemoria()
    estado.version += 1
    estado.porModulo.set(modulo, { version: estado.version, modulo, titulo })
  },
  async ultimas() {
    return [...enMemoria().porModulo.values()]
  },
})

// --------------------------------------------------------------- en la base

/**
 * Cuánto se fía un proceso de lo que leyó. Cada pestaña abierta pregunta cada
 * quince segundos; con cientos abiertas, releer la tabla en cada pregunta serían
 * decenas de consultas por segundo para enterarse de algo que pasa unas pocas
 * veces al día. Cinco segundos de retraso en el aviso no los nota nadie.
 */
const SEGUNDOS_DE_CONFIANZA = 5

export function registroEnLaBase(conseguirPayload: () => Promise<import('payload').Payload>): RegistroDePublicaciones {
  let leido: { cuando: number; filas: Promise<Publicacion[]> } | null = null

  return {
    async registrar(modulo, titulo, req) {
      const [{ sql }, { ejecutorDe }] = await Promise.all([import('@payloadcms/db-postgres'), import('./sqlDirecto')])
      const payload = req?.payload ?? (await conseguirPayload())
      // En la transacción de la publicación: si se deshace, el aviso no sale.
      const bd = await ejecutorDe(payload, req)
      // `greatest` por si dos publicaciones del mismo módulo caen en el mismo
      // milisegundo, o el reloj retrocede: la versión de un módulo solo sube.
      await bd.execute(sql`
        insert into publicaciones as p (modulo, version, titulo) values (${modulo}, ${Date.now()}, ${titulo})
        on conflict (modulo) do update
           set version = greatest(p.version + 1, excluded.version), titulo = excluded.titulo`)
      leido = null
    },

    async ultimas() {
      const ahora = Date.now()
      if (!leido || ahora - leido.cuando > SEGUNDOS_DE_CONFIANZA * 1000) {
        const filas = (async () => {
          const [{ sql }, { adaptadorDe }] = await Promise.all([import('@payloadcms/db-postgres'), import('./sqlDirecto')])
          const { rows } = await adaptadorDe(await conseguirPayload()).drizzle.execute(
            sql`select modulo, version, titulo from publicaciones`,
          )
          return rows.map((f) => ({ modulo: String(f.modulo), version: Number(f.version), titulo: String(f.titulo) }))
        })()
        leido = { cuando: ahora, filas }
        // Una lectura fallida no se queda guardada cinco segundos.
        filas.catch(() => {
          if (leido?.filas === filas) leido = null
        })
      }
      return leido.filas
    },
  }
}

async function payloadDeLaAplicacion() {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
  return getPayload({ config })
}

const REGISTRO = Symbol.for('traumahub.registroDePublicaciones')

/** El registro de esta ejecución: la base en el servidor, la memoria en las pruebas. */
export function registroDePublicaciones(): RegistroDePublicaciones {
  const global = globalThis as unknown as { [REGISTRO]?: RegistroDePublicaciones }
  return (global[REGISTRO] ??=
    process.env.NODE_ENV === 'test' ? registroEnMemoria() : registroEnLaBase(payloadDeLaAplicacion))
}

export function registrarPublicacion(modulo: string, titulo: string, req?: Partial<PayloadRequest>): Promise<void> {
  return registroDePublicaciones().registrar(modulo, titulo, req)
}

export async function versionActual(puedeVer?: (modulo: string) => boolean): Promise<EstadoPublicaciones> {
  return ultimaVisible(await registroDePublicaciones().ultimas(), puedeVer)
}

/** Solo para las pruebas: deja el registro en memoria como recién arrancado. */
export function olvidarPublicaciones(): void {
  const estado = enMemoria()
  estado.version = 0
  estado.porModulo.clear()
}
