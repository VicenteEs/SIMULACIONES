import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { adaptadorDe, ejecutorDe, type Consulta } from './sqlDirecto'
import {
  clasificarColumnas,
  tablaDe,
  type ColumnaDeModelo,
  type DondeSeUsa,
  type UsoDelModelo,
} from './usosDeUnModelo'

/**
 * Qué usa un modelo 3D, leído de la base (D-372). La clasificación y el mensaje
 * están en `usosDeUnModelo.ts`, sin base, para poder probarlos solos.
 *
 * Se pregunta con SQL y no con `payload.find`, al revés que en las
 * preparaciones (`documentosQueUsanLaPreparacion`), porque aquí la pregunta
 * sale del catálogo: lo que se busca son las columnas que la base pondría a
 * nulo, y el catálogo las da con su tabla y su columna, no con la ruta de
 * campos que pediría `where`. Traducir de vuelta una tabla de bloques a su ruta
 * es justo lo que no se puede hacer bien: el adaptador no distingue la pestaña
 * (ver el comentario de `documentosQueUsanLaPreparacion`).
 */

const idDe = (valor: unknown, que: string): number => {
  const n = Number(valor)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${que} no es un identificador válido.`)
  return n
}

/**
 * Las columnas que apuntan a `modelos_3d`, con la tabla de su `_parent_id`.
 *
 * `conkey[1]` porque las claves de Payload son de una sola columna. Con el
 * nombre de la tabla (`relname`) y no `regclass::text`, que lleva el esquema y
 * las comillas cuando hacen falta, y entonces no se compararía con nada.
 */
export async function columnasQueApuntanAModelos(payload: Payload, req?: Partial<PayloadRequest>): Promise<ColumnaDeModelo[]> {
  const bd = await ejecutorDe(payload, req)
  const { rows } = await bd.execute(sql`
    select hija.relname as tabla, columna.attname as columna,
      (select destino.relname
         from pg_constraint padre
         join pg_attribute col on col.attrelid = padre.conrelid and col.attnum = padre.conkey[1]
         join pg_class destino on destino.oid = padre.confrelid
        where padre.conrelid = clave.conrelid and padre.contype = 'f' and col.attname = '_parent_id'
        limit 1) as padre
      from pg_constraint clave
      join pg_class hija on hija.oid = clave.conrelid
      join pg_attribute columna on columna.attrelid = clave.conrelid and columna.attnum = clave.conkey[1]
     where clave.contype = 'f' and clave.confrelid = to_regclass('modelos_3d')
     order by 1, 2
  `)
  return rows.map((fila) => ({
    tabla: String(fila.tabla),
    columna: String(fila.columna),
    padre: fila.padre == null ? null : String(fila.padre),
  }))
}

/** Dónde puede estar un modelo: las columnas, ya con su colección y su vía. */
export async function dondeSeUsanLosModelos(
  payload: Payload,
  req?: Partial<PayloadRequest>,
): Promise<{ donde: DondeSeUsa[]; sinClasificar: ColumnaDeModelo[] }> {
  const slugs = payload.config.collections.map((c) => c.slug)
  return clasificarColumnas(await columnasQueApuntanAModelos(payload, req), slugs)
}

const versionesDe = (d: DondeSeUsa): string => (d.via === 'hija-de-version' ? d.padre! : `_${tablaDe(d.coleccion)}_v`)

/** Los documentos que usan el modelo por esta columna. Solo el documento y su última versión. */
function consultaDeUsos(d: DondeSeUsa, modelo: number): Consulta {
  const tabla = sql.identifier(d.tabla)
  const columna = sql.identifier(d.columna)
  switch (d.via) {
    case 'documento':
      return sql`select id from ${tabla} where ${columna} = ${modelo}`
    case 'hija':
      return sql`select distinct _parent_id as id from ${tabla} where ${columna} = ${modelo}`
    case 'version':
      return sql`select distinct parent_id as id from ${tabla} where ${columna} = ${modelo} and latest`
    case 'hija-de-version':
      return sql`
        select distinct v.parent_id as id
          from ${tabla} h join ${sql.identifier(versionesDe(d))} v on v.id = h._parent_id
         where h.${columna} = ${modelo} and v.latest`
  }
}

/**
 * El cambio de una columna, devolviendo de qué documento era cada fila.
 *
 * En las versiones, solo la última: las antiguas son historia (ver la cabecera
 * de `usosDeUnModelo.ts`), y reescribirlas haría decir a la historia algo que no
 * pasó.
 */
function consultaDeReemplazo(d: DondeSeUsa, desde: number, hacia: number): Consulta {
  const tabla = sql.identifier(d.tabla)
  const columna = sql.identifier(d.columna)
  // Los retoques del instrumento son por nombre de nodo del archivo: con otro
  // archivo apuntarían a nodos que pueden no existir. Es lo mismo que hace
  // `enlazarModelo` (`acciones/instrumental.ts`) al subirle un modelo nuevo.
  const extra = d.tabla === 'instrumental' && d.columna === 'modelo_id' ? sql`, ajustes = null` : sql``
  switch (d.via) {
    case 'documento':
      return sql`update ${tabla} set ${columna} = ${hacia}${extra} where ${columna} = ${desde} returning id`
    case 'hija':
      return sql`update ${tabla} set ${columna} = ${hacia} where ${columna} = ${desde} returning _parent_id as id`
    case 'version':
      return sql`update ${tabla} set ${columna} = ${hacia} where ${columna} = ${desde} and latest returning parent_id as id`
    case 'hija-de-version':
      return sql`
        update ${tabla} h set ${columna} = ${hacia}
          from ${sql.identifier(versionesDe(d))} v
         where v.id = h._parent_id and v.latest and h.${columna} = ${desde}
        returning v.parent_id as id`
  }
}

interface ColeccionDelUso {
  titulo: string
  etiqueta: string
  versionada: boolean
}

function coleccionDelUso(payload: Payload, slug: string): ColeccionDelUso {
  const config = payload.config.collections.find((c) => c.slug === slug) as
    | { admin?: { useAsTitle?: string }; labels?: { singular?: unknown }; versions?: unknown }
    | undefined
  const singular = config?.labels?.singular
  const versiones = config?.versions as { drafts?: unknown } | false | undefined
  return {
    titulo: config?.admin?.useAsTitle ?? 'id',
    etiqueta: typeof singular === 'string' ? singular : slug,
    versionada: Boolean(versiones && versiones.drafts),
  }
}

/**
 * Los títulos de los documentos, en una consulta por colección.
 *
 * Con `draft: true` en las que tienen borradores: un caso cuyo último borrador
 * cambió de nombre se reconoce por el nombre que su autor tiene delante en el
 * editor. `overrideAccess` porque la pregunta es «¿se rompe algo?», y una ficha
 * que quien borra no puede ver se rompe igual; qué se le NOMBRA lo decide el
 * mensaje (`puedeNombrar`).
 */
async function conTitulos(payload: Payload, ids: Map<string, Set<number>>): Promise<UsoDelModelo[]> {
  const usos: UsoDelModelo[] = []
  for (const [slug, conjunto] of ids) {
    if (conjunto.size === 0) continue
    const coleccion = coleccionDelUso(payload, slug)
    const { docs } = await payload.find({
      collection: slug as never,
      where: { id: { in: [...conjunto] } } as never,
      depth: 0,
      pagination: false,
      draft: coleccion.versionada,
      overrideAccess: true,
      select: { [coleccion.titulo]: true } as never,
    })
    const titulos = new Map(
      (docs as unknown as Record<string, unknown>[]).map((d) => [Number(d.id), d[coleccion.titulo]] as const),
    )
    for (const id of conjunto) {
      const titulo = titulos.get(id)
      usos.push({
        coleccion: slug,
        id: String(id),
        titulo: typeof titulo === 'string' && titulo.trim() ? titulo : `#${id}`,
        etiqueta: coleccion.etiqueta,
      })
    }
  }
  return usos.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es') || a.titulo.localeCompare(b.titulo, 'es'))
}

const agregar = (ids: Map<string, Set<number>>, coleccion: string, filas: Record<string, unknown>[]) => {
  const conjunto = ids.get(coleccion) ?? new Set<number>()
  for (const fila of filas) if (fila.id != null) conjunto.add(Number(fila.id))
  ids.set(coleccion, conjunto)
}

/** Los documentos que usan el modelo, con su título. Vacío si nada lo usa. */
export async function usosDelModelo(
  payload: Payload,
  modelo: unknown,
  req?: Partial<PayloadRequest>,
): Promise<UsoDelModelo[]> {
  const id = idDe(modelo, 'El modelo')
  const bd = await ejecutorDe(payload, req)
  const { donde } = await dondeSeUsanLosModelos(payload, req)
  const ids = new Map<string, Set<number>>()
  for (const d of donde) agregar(ids, d.coleccion, (await bd.execute(consultaDeUsos(d, id))).rows)
  return conTitulos(payload, ids)
}

/**
 * Cuántos documentos usan cada modelo, para el «sin usar» del desplegable.
 *
 * Una consulta por columna para todos los modelos a la vez, en lugar de
 * `usosDelModelo` por cada uno: el desplegable de un caso puede traer decenas.
 */
export async function modelosEnUso(payload: Payload): Promise<Set<string>> {
  const bd = adaptadorDe(payload).drizzle
  const { donde } = await dondeSeUsanLosModelos(payload)
  const enUso = new Set<string>()
  for (const d of donde) {
    const tabla = sql.identifier(d.tabla)
    const columna = sql.identifier(d.columna)
    const consulta =
      d.via === 'version'
        ? sql`select distinct ${columna} as modelo from ${tabla} where ${columna} is not null and latest`
        : d.via === 'hija-de-version'
          ? sql`select distinct h.${columna} as modelo from ${tabla} h join ${sql.identifier(versionesDe(d))} v on v.id = h._parent_id where h.${columna} is not null and v.latest`
          : sql`select distinct ${columna} as modelo from ${tabla} where ${columna} is not null`
    for (const fila of (await bd.execute(consulta)).rows) enUso.add(String(fila.modelo))
  }
  return enUso
}

/**
 * Cambia un modelo por otro en todo lo que lo usa, de una vez («Reemplazar por…»).
 *
 * Todo en una transacción: a medias, un caso quedaría con el modelo nuevo y su
 * bloque de la ficha con el viejo, y el borrado que viene después lo pondría a
 * nulo. Por SQL, con las mismas columnas que mira el borrado, por lo mismo que
 * la búsqueda: rehacer cada documento con `payload.update` exigiría reescribir
 * sus pilas de bloques enteras, y en uno con borrador pendiente publicaría el
 * borrador.
 *
 * Se mueve `updated_at` de cada documento tocado. No es adorno: el ensayo del
 * despliegue (D-386) trata como error de código que la resolución de referencia
 * cambie de nota en un caso que nadie tocó, y cambiarle el modelo es tocarlo.
 *
 * Lo que no hace, porque no se puede hacer sin el archivo delante: rehacer las
 * piezas del caso. Si el modelo nuevo llama distinto a sus objetos, el editor
 * las rehace al abrir el caso (`repararPiezasConElModelo`) cuando no queda
 * ninguna, y si quedan algunas se las enseña a su autor; el ensayo lo avisa.
 */
export async function reemplazarModelo(payload: Payload, desdeId: unknown, haciaId: unknown): Promise<UsoDelModelo[]> {
  const desde = idDe(desdeId, 'El modelo que se reemplaza')
  const hacia = idDe(haciaId, 'El modelo nuevo')
  if (desde === hacia) throw new Error('El modelo nuevo es el mismo que el que se reemplaza.')
  const { donde, sinClasificar } = await dondeSeUsanLosModelos(payload)
  // Una columna que no se sabe leer se quedaría con el modelo viejo, y el
  // borrado de después la pondría a nulo: justo lo que esto existe para evitar.
  if (sinClasificar.length > 0) {
    throw new Error(
      `No se reemplazó: la base tiene columnas de modelo que no se saben leer (${sinClasificar
        .map((c) => `${c.tabla}.${c.columna}`)
        .join(', ')}).`,
    )
  }
  const ids = new Map<string, Set<number>>()
  await adaptadorDe(payload).drizzle.transaction(async (tx) => {
    for (const d of donde) agregar(ids, d.coleccion, (await tx.execute(consultaDeReemplazo(d, desde, hacia))).rows)
    for (const [slug, conjunto] of ids) {
      if (conjunto.size === 0) continue
      const lista = sql.join([...conjunto].map((id) => sql`${id}`), sql`, `)
      await tx.execute(sql`update ${sql.identifier(tablaDe(slug))} set updated_at = now() where id in (${lista})`)
      if (coleccionDelUso(payload, slug).versionada) {
        await tx.execute(
          sql`update ${sql.identifier(`_${tablaDe(slug)}_v`)} set updated_at = now(), version_updated_at = now() where parent_id in (${lista}) and latest`,
        )
      }
    }
  })
  return conTitulos(payload, ids)
}
