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
  return {
    cuentas,
    tiempoPorDia,
    accionesHoy,
    cuentasActivasHoy: deHoy.filter((t) => t.segundos > 0).length,
    segundosHoy: deHoy.reduce((n, t) => n + t.segundos, 0),
  }
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
