/**
 * Lo que lee la pantalla del registro de acciones, y su planilla (D-145).
 *
 * Una sola lectura arma las dos, como en la auditoría (D-142): la planilla que
 * se descarga tiene que decir lo mismo que la pantalla de la que sale.
 */
import type { Payload, Where } from 'payload'
import type { HojaDePlanilla } from './planilla'
import { capacidadesPorRol, etiquetaDeRolEnRegistro, ROLES } from './permisos'
import { accionDelRegistroEnPalabras, diaLocal, duracionCorta } from './registro'
import { claveDeDia, contarEn, sumarEn, type Casilla } from './series'

type Registro = Record<string, unknown>

export const POR_PAGINA = 100
/** Filas del registro que entran en la planilla: más que esto se descarga por partes, con el filtro de fechas. */
export const TECHO_DE_LA_PLANILLA = 50_000

export interface FiltrosDelRegistro {
  usuario?: string
  accion?: string
  coleccion?: string
  desde?: string
  hasta?: string
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** El filtro de la consulta; las fechas son días locales completos. */
export function dondeDelRegistro(f: FiltrosDelRegistro): Where {
  const y: Where[] = []
  if (f.usuario && /^\d+$/.test(f.usuario)) y.push({ usuario: { equals: Number(f.usuario) } })
  if (f.accion) y.push({ accion: { equals: f.accion } })
  if (f.coleccion) y.push({ coleccion: { equals: f.coleccion } })
  if (esFecha(f.desde)) y.push({ fecha: { greater_than_equal: new Date(`${f.desde}T00:00:00`).toISOString() } })
  if (esFecha(f.hasta)) {
    const fin = new Date(`${f.hasta}T00:00:00`)
    fin.setDate(fin.getDate() + 1)
    y.push({ fecha: { less_than: fin.toISOString() } })
  }
  return y.length > 0 ? { and: y } : {}
}

export interface FilaDelRegistro {
  id: string
  fecha: string
  usuarioId: string | null
  nombre: string
  correo: string
  rol: string
  accion: string
  coleccion: string
  documentoId: string
  titulo: string
  detalle: string
  origen: string
  modulosVisibles: string[]
  modulosEditables: string[]
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function filaDelRegistro(d: Registro): FilaDelRegistro {
  const permisos = (d.permisos ?? {}) as Registro
  const usuario = d.usuario
  return {
    id: String(d.id),
    fecha: texto(d.fecha),
    usuarioId: usuario === null || usuario === undefined ? null : String(typeof usuario === 'object' ? (usuario as Registro).id : usuario),
    nombre: texto(d.usuarioNombre),
    correo: texto(d.usuarioCorreo),
    rol: texto(d.rol),
    accion: texto(d.accion),
    coleccion: texto(d.coleccion),
    documentoId: texto(d.documentoId),
    titulo: texto(d.titulo),
    detalle: texto(d.detalle),
    origen: texto(d.origen),
    modulosVisibles: lista(permisos.modulosVisibles),
    modulosEditables: lista(permisos.modulosEditables),
  }
}

export async function leerRegistro(
  payload: Payload,
  filtros: FiltrosDelRegistro,
  pagina: number,
): Promise<{ filas: FilaDelRegistro[]; total: number; paginas: number }> {
  const r = await payload.find({
    collection: 'registro-de-acciones',
    where: dondeDelRegistro(filtros),
    sort: '-fecha',
    limit: POR_PAGINA,
    page: Math.max(1, pagina),
    depth: 0,
    overrideAccess: true,
  })
  return { filas: (r.docs as unknown as Registro[]).map(filaDelRegistro), total: r.totalDocs, paginas: r.totalPages }
}

export interface CuentaConActividad {
  id: string
  nombre: string
  correo: string
  rol: string
  activo: boolean
  pendiente: boolean
  modulosVisibles: string[]
  modulosEditables: string[]
  ultimoAcceso: string | null
  segundosHoy: number
  segundos7d: number
  segundos30d: number
  diasActivos30d: number
  sesiones30d: number
  acciones30d: number
}

export interface TiempoPorDia {
  usuarioId: string
  dia: string
  segundos: number
  latidos: number
  ultimaRuta: string
}

export interface ResumenDelRegistro {
  cuentas: CuentaConActividad[]
  tiempoPorDia: TiempoPorDia[]
  accionesHoy: number
  cuentasActivasHoy: number
  segundosHoy: number
}

const haceDias = (n: number, desde = new Date()): string => {
  const f = new Date(desde)
  f.setDate(f.getDate() - n)
  return diaLocal(f)
}

export async function leerResumenDeCuentas(payload: Payload, ahora: Date = new Date()): Promise<ResumenDelRegistro> {
  const hoy = diaLocal(ahora)
  const hace7 = haceDias(6, ahora)
  const hace30 = haceDias(29, ahora)
  const inicio30 = new Date(`${hace30}T00:00:00`).toISOString()
  const inicioHoy = new Date(`${hoy}T00:00:00`).toISOString()

  const usuarios = (
    await payload.find({
      collection: 'usuarios',
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      sort: 'nombre',
      select: {
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        pendiente: true,
        modulosVisibles: true,
        modulosEditables: true,
        ultimoAcceso: true,
      },
    })
  ).docs as unknown as Registro[]

  const tiempos = (
    await payload.find({
      collection: 'tiempo-activo',
      where: { dia: { greater_than_equal: hace30 } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      sort: '-dia',
    })
  ).docs as unknown as Registro[]

  const tiempoPorDia: TiempoPorDia[] = tiempos.map((t) => ({
    usuarioId: String(typeof t.usuario === 'object' && t.usuario ? (t.usuario as Registro).id : t.usuario),
    dia: texto(t.dia),
    segundos: Number(t.segundos ?? 0),
    latidos: Number(t.latidos ?? 0),
    ultimaRuta: texto(t.ultimaRuta),
  }))

  // Los inicios de sesión y las acciones de los últimos 30 días, de una vez y
  // contados aquí. Eran dos `count` por cuenta y en serie: con quinientas
  // cuentas, mil consultas una detrás de otra en cada visita a la pantalla y en
  // cada planilla. Se piden solo las dos columnas que hacen falta.
  const actos = (
    await payload.find({
      collection: 'registro-de-acciones',
      where: { and: [{ fecha: { greater_than_equal: inicio30 } }, { usuario: { exists: true } }] },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { usuario: true, accion: true },
    })
  ).docs as unknown as Registro[]
  const sesionesPorCuenta = new Map<string, number>()
  const accionesPorCuenta = new Map<string, number>()
  for (const acto of actos) {
    const usuario = acto.usuario
    if (usuario === null || usuario === undefined) continue
    const id = String(typeof usuario === 'object' ? (usuario as Registro).id : usuario)
    const cuenta =
      acto.accion === 'sesion-iniciada'
        ? sesionesPorCuenta
        : acto.accion === 'sesion-cerrada'
          ? null
          : accionesPorCuenta
    if (cuenta) cuenta.set(id, (cuenta.get(id) ?? 0) + 1)
  }

  // Y el tiempo, repartido por cuenta una sola vez en lugar de filtrar la
  // lista entera para cada una.
  const tiempoDeCada = new Map<string, TiempoPorDia[]>()
  for (const t of tiempoPorDia) {
    const lista = tiempoDeCada.get(t.usuarioId)
    if (lista) lista.push(t)
    else tiempoDeCada.set(t.usuarioId, [t])
  }

  const cuentas: CuentaConActividad[] = []
  for (const u of usuarios) {
    const id = String(u.id)
    const suyos = tiempoDeCada.get(id) ?? []
    const suma = (desde: string) => suyos.filter((t) => t.dia >= desde).reduce((n, t) => n + t.segundos, 0)
    cuentas.push({
      id,
      nombre: texto(u.nombre) || texto(u.email),
      correo: texto(u.email),
      rol: texto(u.rol),
      activo: u.activo === true,
      pendiente: u.pendiente === true,
      modulosVisibles: lista(u.modulosVisibles),
      modulosEditables: lista(u.modulosEditables),
      ultimoAcceso: texto(u.ultimoAcceso) || null,
      segundosHoy: suma(hoy),
      segundos7d: suma(hace7),
      segundos30d: suma(hace30),
      diasActivos30d: suyos.filter((t) => t.segundos > 0).length,
      sesiones30d: sesionesPorCuenta.get(id) ?? 0,
      acciones30d: accionesPorCuenta.get(id) ?? 0,
    })
  }

  const accionesHoy = (
    await payload.count({ collection: 'registro-de-acciones', where: { fecha: { greater_than_equal: inicioHoy } }, overrideAccess: true })
  ).totalDocs
  const deHoy = tiempoPorDia.filter((t) => t.dia === hoy)
  // «Cuentas activas» son cuentas que existen: la fila de tiempo de una cuenta borrada se queda con el usuario a nulo (el
  // tiempo trabajado no deja de haber ocurrido), y contada como una cuenta activa inflaba la cifra con gente que ya no está.
  // Su tiempo sí suma en «tiempo activo hoy», que es el de todo el trabajo hecho. Y una persona cuenta una vez aunque haya
  // dos filas (no debería: hay un índice único por cuenta y día).
  const cuentasQueExisten = new Set(cuentas.map((c) => c.id))
  return {
    cuentas,
    tiempoPorDia,
    accionesHoy,
    cuentasActivasHoy: new Set(
      deHoy.filter((t) => t.segundos > 0 && cuentasQueExisten.has(t.usuarioId)).map((t) => t.usuarioId),
    ).size,
    segundosHoy: deHoy.reduce((n, t) => n + t.segundos, 0),
  }
}

// ------------------------------------------------------------- tablero

/**
 * El tiempo activo de cada día de `dias`: los minutos sumados entre todas las
 * cuentas y cuántas cuentas tuvieron alguno (P-007 E5, D-238).
 *
 * Con las mismas reglas que las cifras de hoy de `leerResumenDeCuentas`, para
 * que el último punto de cada línea sea la cifra que tiene al lado: los minutos
 * cuentan también los de cuentas ya borradas —el trabajo ocurrió—, y las
 * cuentas, solo las que existen y una vez por día.
 */
export function tiempoPorCasilla(
  tiempoPorDia: readonly TiempoPorDia[],
  dias: readonly Casilla[],
  cuentasQueExisten: ReadonlySet<string>,
): { minutos: number[]; cuentas: number[] } {
  const minutos = sumarEn(
    dias,
    tiempoPorDia.map((t) => [t.dia, t.segundos / 60] as const),
  ).map((m) => Math.round(m))
  const porDia = new Map(dias.map((d) => [d.clave, new Set<string>()]))
  for (const t of tiempoPorDia) {
    if (t.segundos > 0 && cuentasQueExisten.has(t.usuarioId)) porDia.get(t.dia)?.add(t.usuarioId)
  }
  return { minutos, cuentas: dias.map((d) => porDia.get(d.clave)?.size ?? 0) }
}

/**
 * Los grupos de «Qué se hace», en el orden de la leyenda.
 *
 * Seis como mucho, porque es lo que una dona deja distinguir (`Dona`); el
 * registro tiene una docena de acciones y por separado los sectores finos no se
 * leían. Se agrupan por lo que la persona estaba haciendo y no por el verbo:
 * abrir un caso del simulador es una lectura de `cirugias`, pero quien mira
 * quiere saber cuánto se usa el simulador, no cuántas lecturas hay de una
 * colección más.
 */
export const TIPOS_DE_ACCION = [
  { clave: 'leer', etiqueta: 'Leer fichas' },
  { clave: 'simulador', etiqueta: 'Simulador' },
  { clave: 'comentar', etiqueta: 'Comentar' },
  { clave: 'editar', etiqueta: 'Editar y publicar' },
  { clave: 'sesion', etiqueta: 'Entrar y salir' },
  { clave: 'administrar', etiqueta: 'Administrar' },
] as const

export type TipoDeAccion = (typeof TIPOS_DE_ACCION)[number]['clave']

/**
 * A qué grupo de «Qué se hace» pertenece un acto del registro.
 *
 * Lo de las cuentas es administrar aunque el verbo sea «creó»: dar de alta a
 * un residente no es editar contenido. Lo que no se reconoce —una acción que
 * llegue después que esta lista— va a «Administrar» y no se pierde del total.
 */
export function tipoDeAccion(accion: unknown, coleccion: unknown): TipoDeAccion {
  if (accion === 'lectura') return coleccion === 'cirugias' ? 'simulador' : 'leer'
  if (accion === 'sesion-iniciada' || accion === 'sesion-cerrada') return 'sesion'
  if (coleccion === 'usuarios') return 'administrar'
  if (coleccion === 'comentarios') return 'comentar'
  if (['creo', 'modifico', 'elimino', 'publico', 'retiro'].includes(String(accion))) return 'editar'
  return 'administrar'
}

/**
 * Los actos de los días de `dias`: cuántos hubo cada día, de todos, y de qué
 * tipo fueron los de los últimos `ultimos` días, solo de las cuentas.
 *
 * Por día cuentan todos, como «Acciones hoy», que es la cifra que la línea
 * acompaña. En el reparto por tipo no entra lo que el servidor anota por su
 * cuenta (`origen`: «sistema», «importación»): una ingesta de libros deja miles
 * de «creó» en una tarde, y la dona diría que la plataforma se usa para editar
 * cuando la pregunta es qué hacen las personas. Un acto de una cuenta que
 * después se borró sí entra: no tiene `origen`, lo hizo alguien.
 */
export function resumirActos(
  actos: readonly Record<string, unknown>[],
  dias: readonly Casilla[],
  ultimos = 7,
): { porDia: number[]; porTipo: Record<TipoDeAccion, number> } {
  const recientes = new Set(dias.slice(-ultimos).map((d) => d.clave))
  const porTipo = Object.fromEntries(TIPOS_DE_ACCION.map((t) => [t.clave, 0])) as Record<TipoDeAccion, number>
  for (const acto of actos) {
    if (texto(acto.origen) !== '' || !recientes.has(claveDeDia(acto.fecha) ?? '')) continue
    porTipo[tipoDeAccion(acto.accion, acto.coleccion)] += 1
  }
  return { porDia: contarEn(dias, actos.map((a) => claveDeDia(a.fecha))), porTipo }
}

// ------------------------------------------------------------- planilla

const minutos = (segundos: number) => Math.round((segundos / 60) * 10) / 10

export async function hojasDelRegistro(payload: Payload): Promise<HojaDePlanilla[]> {
  const resumen = await leerResumenDeCuentas(payload)
  const r = await payload.find({
    collection: 'registro-de-acciones',
    sort: '-fecha',
    limit: TECHO_DE_LA_PLANILLA,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const filas = (r.docs as unknown as Registro[]).map(filaDelRegistro)
  const modulos = (l: string[]) => (l.length === 0 ? 'todos' : l.join(', '))
  const nombreDe = new Map(resumen.cuentas.map((c) => [c.id, c.nombre]))

  return [
    {
      nombre: 'Registro',
      columnas: [
        { titulo: 'Fecha y hora', tipo: 'fecha', ancho: 20 },
        { titulo: 'Cuenta', tipo: 'texto', ancho: 28 },
        { titulo: 'Correo', tipo: 'texto', ancho: 30 },
        { titulo: 'Rol (entonces)', tipo: 'texto', ancho: 20 },
        { titulo: 'Módulos que veía', tipo: 'texto', ancho: 24 },
        { titulo: 'Módulos que editaba', tipo: 'texto', ancho: 24 },
        { titulo: 'Acción', tipo: 'texto', ancho: 22 },
        { titulo: 'Módulo o colección', tipo: 'texto', ancho: 20 },
        { titulo: 'Documento', tipo: 'texto', ancho: 10 },
        { titulo: 'Título', tipo: 'texto', ancho: 40 },
        { titulo: 'Detalle', tipo: 'texto', ancho: 50 },
        { titulo: 'Origen (si no fue una cuenta)', tipo: 'texto', ancho: 16 },
      ],
      filas: filas.map((f) => [
        f.fecha,
        f.nombre || '—',
        f.correo,
        etiquetaDeRolEnRegistro(f.rol),
        modulos(f.modulosVisibles),
        modulos(f.modulosEditables),
        accionDelRegistroEnPalabras(f.accion),
        f.coleccion,
        f.documentoId,
        f.titulo,
        f.detalle,
        f.origen,
      ]),
    },
    {
      nombre: 'Cuentas',
      columnas: [
        { titulo: 'Cuenta', tipo: 'texto', ancho: 28 },
        { titulo: 'Correo', tipo: 'texto', ancho: 30 },
        { titulo: 'Rol', tipo: 'texto', ancho: 20 },
        { titulo: 'Activa', tipo: 'texto', ancho: 8 },
        { titulo: 'Módulos que ve', tipo: 'texto', ancho: 24 },
        { titulo: 'Módulos que edita', tipo: 'texto', ancho: 24 },
        { titulo: 'Último acceso', tipo: 'fecha', ancho: 20 },
        { titulo: 'Minutos activos hoy', tipo: 'decimal' },
        { titulo: 'Minutos activos, 7 días', tipo: 'decimal' },
        { titulo: 'Minutos activos, 30 días', tipo: 'decimal' },
        { titulo: 'Días con actividad (30)', tipo: 'entero' },
        { titulo: 'Inicios de sesión (30)', tipo: 'entero' },
        { titulo: 'Acciones (30)', tipo: 'entero' },
      ],
      filas: resumen.cuentas.map((c) => [
        c.nombre,
        c.correo,
        etiquetaDeRolEnRegistro(c.rol),
        c.activo ? 'Sí' : 'No',
        modulos(c.modulosVisibles),
        modulos(c.modulosEditables),
        c.ultimoAcceso,
        minutos(c.segundosHoy),
        minutos(c.segundos7d),
        minutos(c.segundos30d),
        c.diasActivos30d,
        c.sesiones30d,
        c.acciones30d,
      ]),
    },
    {
      nombre: 'Tiempo activo por día',
      columnas: [
        { titulo: 'Día', tipo: 'texto', ancho: 12 },
        { titulo: 'Cuenta', tipo: 'texto', ancho: 28 },
        { titulo: 'Minutos activos', tipo: 'decimal' },
        { titulo: 'Tiempo', tipo: 'texto', ancho: 12 },
        { titulo: 'Latidos', tipo: 'entero' },
        { titulo: 'Última página', tipo: 'texto', ancho: 40 },
      ],
      filas: resumen.tiempoPorDia.map((t) => [
        t.dia,
        nombreDe.get(t.usuarioId) ?? `#${t.usuarioId}`,
        minutos(t.segundos),
        duracionCorta(t.segundos),
        t.latidos,
        t.ultimaRuta,
      ]),
    },
    {
      nombre: 'Permisos por rol',
      columnas: [
        { titulo: 'Qué puede hacer', tipo: 'texto', ancho: 60 },
        ...ROLES.map((x) => ({ titulo: x.label, tipo: 'texto' as const, ancho: 18 })),
        { titulo: 'Regla en el código', tipo: 'texto', ancho: 50 },
      ],
      filas: capacidadesPorRol().map((c) => [
        c.etiqueta,
        c.admin ? 'Sí' : 'No',
        c.editor ? 'Sí' : 'No',
        c.lector ? 'Sí' : 'No',
        c.fuente,
      ]),
    },
  ]
}
