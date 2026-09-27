/**
 * La auditoría de la revisión, armada a partir de las filas crudas (D-142).
 *
 * Pura a propósito: entran las revisiones, las sesiones de tiempo y las cuentas
 * tal como las devuelve la base, y salen las tablas y los recuentos que pintan
 * la pantalla «Auditoría» y que llenan la planilla. Las dos tienen que decir
 * exactamente lo mismo —quien descarga la planilla para filtrarla está
 * comprobando la pantalla—, y la forma de que no se separen es que salgan de
 * la misma función. Se prueba sin base.
 */

import {
  RITMO_MAXIMO_DE_LECTURA,
  accionEnPalabras,
  estadoEnPalabras,
  origenEnPalabras,
  type EstadoDeRevision,
} from './revision'

type Registro = Record<string, unknown>

const idDe = (valor: unknown): string | null => {
  if (typeof valor === 'number' || typeof valor === 'string') return String(valor)
  if (valor && typeof valor === 'object' && 'id' in valor) return idDe((valor as { id: unknown }).id)
  return null
}
const numero = (valor: unknown): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : Number(valor) || 0
const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '')
const fechaO = (valor: unknown): string | null =>
  typeof valor === 'string' && !Number.isNaN(Date.parse(valor)) ? valor : null
const minutos = (segundos: number): number => Math.round((segundos / 60) * 10) / 10
const media = (valores: number[]): number | null =>
  valores.length === 0 ? null : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10

export interface Cuenta {
  id: string
  nombre: string
  correo: string
  rol: string
  activo: boolean
}

export interface FilaDeContenido {
  coleccion: string
  documentoId: string
  titulo: string
  origen: string
  libro: string
  capitulo: string
  paginas: string
  lote: string
  modelo: string
  estado: EstadoDeRevision
  asignada: string
  asignadaId: string | null
  validador: string
  validadorId: string | null
  validadaEn: string | null
  publicadaEn: string | null
  porcentaje: number
  palabrasOriginales: number
  palabrasActuales: number
  palabrasQuitadas: number
  palabrasNuevas: number
  /** De todas las cuentas que la abrieron. */
  minutosActivos: number
  minutosAbiertos: number
  /** Del que la validó, en el momento de validarla. */
  minutosActivosDelValidador: number | null
  ritmoDelValidador: number | null
  seccionesRevisadas: number | null
  seccionesConContenido: number | null
  senalada: boolean
  motivos: string
  nota: string
  devoluciones: number
  publicadaSinValidar: boolean
  ultimaEdicion: string | null
  registradaEn: string | null
  porSeccion: { seccion: string; original: number; actual: number; porcentaje: number }[]
}

export interface FilaDeRevisor {
  id: string
  nombre: string
  correo: string
  rol: string
  asignadas: number
  /** Asignadas que todavía no están listas ni publicadas. */
  pendientes: number
  validadas: number
  senaladas: number
  /** Veces que el administrador devolvió una ficha que este revisor había validado. */
  devueltas: number
  fichasAbiertas: number
  minutosActivos: number
  minutosAbiertos: number
  /** Minutos activos del revisor en cada ficha que validó, de media. */
  minutosPorValidada: number | null
  ritmoMedio: number | null
  porcentajeMedio: number | null
  ultimaActividad: string | null
}

export interface FilaDeSesion {
  revisor: string
  coleccion: string
  documentoId: string
  titulo: string
  inicio: string | null
  ultimoLatido: string | null
  minutosAbiertos: number
  minutosActivos: number
  ediciones: number
  guardados: number
  secciones: string
}

export interface FilaDeHistorial {
  fecha: string
  coleccion: string
  documentoId: string
  titulo: string
  accion: string
  usuario: string
  detalle: string
  porcentaje: number | null
  minutosActivos: number | null
}

export interface Auditoria {
  contenidos: FilaDeContenido[]
  revisores: FilaDeRevisor[]
  sesiones: FilaDeSesion[]
  historial: FilaDeHistorial[]
  totales: {
    fichas: number
    porEstado: Record<EstadoDeRevision, number>
    porcentajeMedioDeLasValidadas: number | null
    minutosMediosPorValidada: number | null
    senaladas: number
    publicadasSinValidar: number
    minutosActivos: number
  }
}

const ESTADOS: EstadoDeRevision[] = ['pendiente', 'en-revision', 'lista', 'publicada', 'devuelta']

/**
 * Arma la auditoría entera.
 *
 * `cuentas` trae a quien haya que nombrar: si una relación apunta a una cuenta
 * que ya no está, se nombra «cuenta borrada» en vez de dejar el hueco.
 */
export function armarAuditoria(entrada: {
  revisiones: readonly Registro[]
  sesiones: readonly Registro[]
  cuentas: readonly Cuenta[]
}): Auditoria {
  const cuentas = new Map(entrada.cuentas.map((c) => [c.id, c]))
  const nombreDe = (id: string | null): string =>
    id === null ? '' : (cuentas.get(id)?.nombre ?? 'cuenta borrada')

  // El tiempo de cada ficha, de todos, y de cada revisor en total.
  const clave = (coleccion: unknown, documentoId: unknown) => `${texto(coleccion)}/${texto(documentoId)}`
  const tiempoPorFicha = new Map<string, { activos: number; abiertos: number }>()
  const porRevisor = new Map<string, { activos: number; abiertos: number; fichas: Set<string>; ultima: string | null }>()
  const titulos = new Map<string, string>()
  for (const r of entrada.revisiones) titulos.set(clave(r.coleccion, r.documentoId), texto(r.titulo))

  const sesiones: FilaDeSesion[] = []
  for (const s of entrada.sesiones) {
    const k = clave(s.coleccion, s.documentoId)
    const activos = numero(s.segundosActivos)
    const abiertos = numero(s.segundosAbiertos)
    const ficha = tiempoPorFicha.get(k) ?? { activos: 0, abiertos: 0 }
    ficha.activos += activos
    ficha.abiertos += abiertos
    tiempoPorFicha.set(k, ficha)
    const usuario = idDe(s.usuario)
    const ultimo = fechaO(s.ultimoLatido)
    if (usuario !== null) {
      const suyo = porRevisor.get(usuario) ?? { activos: 0, abiertos: 0, fichas: new Set<string>(), ultima: null }
      suyo.activos += activos
      suyo.abiertos += abiertos
      suyo.fichas.add(k)
      if (ultimo && (!suyo.ultima || ultimo > suyo.ultima)) suyo.ultima = ultimo
      porRevisor.set(usuario, suyo)
    }
    const porSeccion = (s.porSeccion ?? {}) as Record<string, unknown>
    sesiones.push({
      revisor: usuario === null ? 'cuenta borrada' : nombreDe(usuario),
      coleccion: texto(s.coleccion),
      documentoId: texto(s.documentoId),
      titulo: titulos.get(k) ?? '',
      inicio: fechaO(s.inicio),
      ultimoLatido: ultimo,
      minutosAbiertos: minutos(abiertos),
      minutosActivos: minutos(activos),
      ediciones: numero(s.ediciones),
      guardados: numero(s.guardados),
      secciones: Object.entries(porSeccion)
        .filter(([, segundos]) => numero(segundos) > 0)
        .map(([seccion, segundos]) => `${seccion} (${Math.round(numero(segundos))} s)`)
        .join('; '),
    })
  }

  const contenidos: FilaDeContenido[] = []
  const historial: FilaDeHistorial[] = []
  const devueltasPorValidador = new Map<string, number>()
  for (const r of entrada.revisiones) {
    const k = clave(r.coleccion, r.documentoId)
    const tiempo = tiempoPorFicha.get(k) ?? { activos: 0, abiertos: 0 }
    const asignadaId = idDe(r.asignadaA)
    const validadorId = idDe(r.listaPor)
    const validada = fechaO(r.listaEn) !== null
    contenidos.push({
      coleccion: texto(r.coleccion),
      documentoId: texto(r.documentoId),
      titulo: texto(r.titulo) || `#${texto(r.documentoId)}`,
      origen: origenEnPalabras(r.origen),
      libro: texto(r.libro),
      capitulo: texto(r.capitulo),
      paginas: texto(r.paginas),
      lote: texto(r.lote),
      modelo: texto(r.modelo),
      estado: (ESTADOS.includes(r.estado as EstadoDeRevision) ? r.estado : 'pendiente') as EstadoDeRevision,
      asignada: nombreDe(asignadaId),
      asignadaId,
      validador: nombreDe(validadorId),
      validadorId,
      validadaEn: fechaO(r.listaEn),
      publicadaEn: fechaO(r.publicadaEn),
      porcentaje: numero(r.porcentajeEditado),
      palabrasOriginales: numero(r.palabrasOriginales),
      palabrasActuales: numero(r.palabrasActuales),
      palabrasQuitadas: numero(r.palabrasQuitadas),
      palabrasNuevas: numero(r.palabrasNuevas),
      minutosActivos: minutos(tiempo.activos),
      minutosAbiertos: minutos(tiempo.abiertos),
      minutosActivosDelValidador: validada ? minutos(numero(r.segundosActivosAlValidar)) : null,
      ritmoDelValidador: validada && r.ritmoAlValidar !== null && r.ritmoAlValidar !== undefined ? numero(r.ritmoAlValidar) : null,
      seccionesRevisadas: validada ? numero(r.seccionesVistasAlValidar) : null,
      seccionesConContenido: validada ? numero(r.seccionesConContenido) : null,
      senalada: r.validacionRapida === true,
      motivos: texto(r.motivosDeAlerta),
      nota: texto(r.notaDeRevision),
      devoluciones: numero(r.devoluciones),
      publicadaSinValidar: r.publicadaSinValidar === true,
      ultimaEdicion: fechaO(r.ultimaEdicion),
      registradaEn: fechaO(r.createdAt),
      porSeccion: Array.isArray(r.porSeccion)
        ? (r.porSeccion as Registro[]).map((s) => ({
            seccion: texto(s.seccion),
            original: numero(s.original),
            actual: numero(s.actual),
            porcentaje: numero(s.porcentaje),
          }))
        : [],
    })

    // El historial, en orden. Una devolución se le cuenta a quien validó la
    // ficha por última vez antes de ella: es su validación la que no convenció.
    let ultimoValidador: string | null = null
    for (const h of Array.isArray(r.historial) ? (r.historial as Registro[]) : []) {
      const quien = idDe(h.usuario)
      if (h.accion === 'lista') ultimoValidador = quien
      if (h.accion === 'devuelta' && ultimoValidador !== null) {
        devueltasPorValidador.set(ultimoValidador, (devueltasPorValidador.get(ultimoValidador) ?? 0) + 1)
      }
      historial.push({
        fecha: fechaO(h.fecha) ?? '',
        coleccion: texto(r.coleccion),
        documentoId: texto(r.documentoId),
        titulo: texto(r.titulo),
        accion: accionEnPalabras(h.accion),
        usuario: quien === null ? '' : nombreDe(quien),
        detalle: texto(h.detalle),
        porcentaje: h.porcentaje === null || h.porcentaje === undefined ? null : numero(h.porcentaje),
        minutosActivos:
          h.segundosActivos === null || h.segundosActivos === undefined ? null : minutos(numero(h.segundosActivos)),
      })
    }
  }
  historial.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))

  // Los revisores: toda cuenta que haya abierto, validado o tenga asignada
  // alguna ficha. Un revisor con fichas asignadas y ni un segundo de revisión es
  // justo lo que hay que ver, así que entra aunque no tenga sesiones.
  const ids = new Set<string>([
    ...porRevisor.keys(),
    ...contenidos.flatMap((c) => [c.asignadaId, c.validadorId].filter((id): id is string => id !== null)),
  ])
  const revisores: FilaDeRevisor[] = [...ids].map((id) => {
    const cuenta = cuentas.get(id)
    const tiempo = porRevisor.get(id)
    const suyas = contenidos.filter((c) => c.validadorId === id && c.validadaEn !== null)
    const asignadas = contenidos.filter((c) => c.asignadaId === id)
    return {
      id,
      nombre: cuenta?.nombre ?? 'cuenta borrada',
      correo: cuenta?.correo ?? '',
      rol: cuenta?.rol ?? '',
      asignadas: asignadas.length,
      pendientes: asignadas.filter((c) => c.estado !== 'lista' && c.estado !== 'publicada').length,
      validadas: suyas.length,
      senaladas: suyas.filter((c) => c.senalada).length,
      devueltas: devueltasPorValidador.get(id) ?? 0,
      fichasAbiertas: tiempo?.fichas.size ?? 0,
      minutosActivos: minutos(tiempo?.activos ?? 0),
      minutosAbiertos: minutos(tiempo?.abiertos ?? 0),
      minutosPorValidada: media(suyas.map((c) => c.minutosActivosDelValidador ?? 0)),
      ritmoMedio: media(suyas.map((c) => c.ritmoDelValidador).filter((r): r is number => r !== null)),
      porcentajeMedio: media(suyas.map((c) => c.porcentaje)),
      ultimaActividad: tiempo?.ultima ?? null,
    }
  })
  revisores.sort((a, b) => b.minutosActivos - a.minutosActivos || a.nombre.localeCompare(b.nombre, 'es'))

  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoDeRevision, number>
  for (const c of contenidos) porEstado[c.estado] += 1
  const validadas = contenidos.filter((c) => c.validadaEn !== null)

  return {
    contenidos,
    revisores,
    sesiones,
    historial,
    totales: {
      fichas: contenidos.length,
      porEstado,
      porcentajeMedioDeLasValidadas: media(validadas.map((c) => c.porcentaje)),
      minutosMediosPorValidada: media(validadas.map((c) => c.minutosActivosDelValidador ?? 0)),
      senaladas: contenidos.filter((c) => c.senalada).length,
      publicadasSinValidar: contenidos.filter((c) => c.publicadaSinValidar).length,
      minutosActivos: minutos([...tiempoPorFicha.values()].reduce((t, f) => t + f.activos, 0)),
    },
  }
}

// ------------------------------------------------------------------ filtros

export interface FiltrosDeAuditoria {
  modulo?: string
  lote?: string
  /** Una cuenta: las fichas que tiene asignadas, que validó o que abrió. */
  revisor?: string
  estado?: string
}

/**
 * Las filas crudas que caen en los filtros, antes de armar: así los recuentos,
 * los gráficos y las tablas de los revisores salen de la misma porción.
 *
 * Las sesiones que quedan son las de las fichas que quedan, de quien sea: el
 * tiempo total de una ficha es de todos los que la abrieron, también cuando se
 * filtra por uno.
 */
export function filtrarEntrada<T extends { revisiones: readonly Registro[]; sesiones: readonly Registro[] }>(
  entrada: T,
  filtros: FiltrosDeAuditoria,
): T {
  const { modulo, lote, revisor, estado } = filtros
  if (!modulo && !lote && !revisor && !estado) return entrada
  const clave = (coleccion: unknown, documentoId: unknown) => `${texto(coleccion)}/${texto(documentoId)}`
  const abiertasPorElRevisor = revisor
    ? new Set(entrada.sesiones.filter((s) => idDe(s.usuario) === revisor).map((s) => clave(s.coleccion, s.documentoId)))
    : null
  const revisiones = entrada.revisiones.filter(
    (r) =>
      (!modulo || r.coleccion === modulo) &&
      (!lote || r.lote === lote) &&
      (!estado || r.estado === estado) &&
      (!revisor ||
        idDe(r.asignadaA) === revisor ||
        idDe(r.listaPor) === revisor ||
        (abiertasPorElRevisor?.has(clave(r.coleccion, r.documentoId)) ?? false)),
  )
  const quedan = new Set(revisiones.map((r) => clave(r.coleccion, r.documentoId)))
  return {
    ...entrada,
    revisiones,
    sesiones: entrada.sesiones.filter((s) => quedan.has(clave(s.coleccion, s.documentoId))),
  }
}

// ------------------------------------------------------------ para los gráficos

/**
 * Tramos del porcentaje editado, de menos a más. El primero es «nada», un texto
 * que nadie tocó, y va aparte a propósito: es la cifra que más dice de una
 * revisión hecha por encima.
 */
export const TRAMOS_DE_EDICION = [
  { etiqueta: '0 %', hasta: 0 },
  { etiqueta: 'hasta 5 %', hasta: 5 },
  { etiqueta: '5–15 %', hasta: 15 },
  { etiqueta: '15–30 %', hasta: 30 },
  { etiqueta: '30–50 %', hasta: 50 },
  { etiqueta: 'más de 50 %', hasta: 100 },
] as const

/** Cuántas fichas caen en cada tramo de edición. */
export function reparto(porcentajes: readonly number[]): number[] {
  const cuentas = TRAMOS_DE_EDICION.map(() => 0)
  for (const p of porcentajes) {
    if (!(p > 0)) {
      cuentas[0] += 1
      continue
    }
    const tramo = TRAMOS_DE_EDICION.findIndex((t, k) => k > 0 && p <= t.hasta)
    cuentas[tramo === -1 ? cuentas.length - 1 : tramo] += 1
  }
  return cuentas
}

/** El lunes de la semana de una fecha, en hora local, como `aaaa-mm-dd`. */
export function lunesDe(fecha: Date): string {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  const dia = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dia)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Las últimas `cuantas` semanas, de la más antigua a la actual, con cuántas fechas cae en cada una. */
export function porSemana(fechas: readonly string[], cuantas: number, hoy: Date = new Date()): { lunes: string; total: number }[] {
  const semanas: string[] = []
  for (let i = cuantas - 1; i >= 0; i -= 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i * 7)
    semanas.push(lunesDe(d))
  }
  const cuenta = new Map(semanas.map((s) => [s, 0]))
  for (const f of fechas) {
    const t = Date.parse(f)
    if (Number.isNaN(t)) continue
    const s = lunesDe(new Date(t))
    if (cuenta.has(s)) cuenta.set(s, (cuenta.get(s) ?? 0) + 1)
  }
  return semanas.map((lunes) => ({ lunes, total: cuenta.get(lunes) ?? 0 }))
}

/** Si un ritmo de revisión está por encima de lo que se lee con atención. */
export const ritmoSospechoso = (ritmo: number | null): boolean =>
  ritmo !== null && ritmo > RITMO_MAXIMO_DE_LECTURA

export { estadoEnPalabras }
