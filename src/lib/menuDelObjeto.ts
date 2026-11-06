/**
 * El menú de lo que está puesto en el paciente (P-013, pedidos 7 y 14 de Cristóbal).
 *
 * - 7: «que al pinchar el que está puesto en el paciente se despliegue su propio menú, y no tener que ir a buscarlo en el
 *   listado para manipularlo».
 * - 14: «la gracia de "instrumental en uso" es que al pinchar alguno de esos te permita jugar con las opciones. Si es el
 *   Farabeuf, que sea "mover en este mismo plano", "profundizar", "retirar del campo", etc. Siempre debe aparecer la de
 *   retirar. Si seleccionamos los implantes, que ofrezca "retirar" o "cambiar". Al cambiar, ofrecer longitudes (placa en
 *   orificios, tornillo en mm)».
 *
 * Son el mismo menú visto desde dos sitios: el objeto en la escena (7) y su fila en «En uso» (14). Aquí se decide qué
 * ofrece cada cosa, sin three ni React; la consola lo pinta y hace lo que se elige con los mandos que ya existían.
 *
 * «Cambiar» no cambia el implante en su sitio: lo retira y pone en la mano el de la medida elegida, a un clic del orificio
 * donde estaba. Es lo que pasa en pabellón —se saca, la arsenalera pasa el otro y se pone—, y el tornillo nuevo entra con
 * el gesto de siempre (pedido 13 de P-004), que es parte de lo que se evalúa.
 */

import type { SerieDeLargos } from './fijacion'

export type PlanoDelObjeto = 'piel' | 'fascia' | 'musculo' | 'hueso'

/** Lo que hay puesto, como lo ve el menú. */
export type ObjetoPuesto =
  | {
      tipo: 'separador'
      id: number
      nombre: string
      plano: PlanoDelObjeto
      /** El Hohmann: se apoya en el hueso y no cambia de plano. */
      palanca: boolean
      aperturaMm: number
      maximoMm: number
      instrumentoId: string
    }
  | { tipo: 'pinza-de-piel'; id: number; alturaMm: number }
  | { tipo: 'pinza-de-reduccion'; id: number; nombre: string; pieza: string }
  | { tipo: 'placa'; nombre: string; fijada: boolean; agujeros: number; tornillos: number }
  | {
      tipo: 'tornillo'
      /** La clave con que lo guarda la escena: el agujero de la placa, o un número negativo. */
      id: number
      /** El agujero de la placa (desde 0), o `null` si va por la trayectoria o por el clavo. */
      agujero: number | null
      libre: boolean
      deClavo: string | null
      largoMm: number
      diametroMm: number
      bloqueado: boolean
    }
  | { tipo: 'aguja'; numero: number; total: number }
  | { tipo: 'clavo'; nombre: string }
  | { tipo: 'injerto' }

/** Lo que se puede hacer con él. */
export type AccionDelObjeto =
  | { id: 'mover'; etiqueta: string; ayuda: string }
  /** A qué plano blando llevarlo: al hueso solo va el Hohmann, que no cambia de plano. */
  | { id: 'plano'; etiqueta: string; plano: Exclude<PlanoDelObjeto, 'hueso'> }
  | { id: 'apertura'; etiqueta: string; valorMm: number; maximoMm: number }
  | { id: 'levantar'; etiqueta: string; valorMm: number; maximoMm: number }
  | { id: 'soltar-la-fijacion'; etiqueta: string }
  | { id: 'cambiar'; etiqueta: string; unidad: 'mm' | 'agujeros'; opciones: readonly OpcionDeCambio[] }
  | { id: 'quitar-el-enclavado'; etiqueta: string }
  | { id: 'retirar-todas'; etiqueta: string }
  | { id: 'retirar'; etiqueta: string; pregunta: string | null }

export interface OpcionDeCambio {
  valor: number
  etiqueta: string
  actual: boolean
  /** La que dice el medidor, si se midió. */
  sugerida: boolean
}

/** Lo que el menú necesita saber de fuera del objeto. */
export interface ContextoDelMenu {
  /** Los planos que tienen herida abierta: un separador solo se lleva a uno de ellos. */
  planosConHerida: readonly PlanoDelObjeto[]
  /** La serie de largos del tornillo, para ofrecer otros. */
  serieDelTornillo?: SerieDeLargos | null
  /** El largo que pidió el medidor en ese orificio, si se midió. */
  sugeridoMm?: number | null
  /** Las cantidades de agujeros que se pueden pedir para la placa; vacío si su sistema no se conoce. */
  agujerosPosibles?: readonly number[]
  /** La altura máxima a que una pinza levanta la piel. */
  alturaMaximaDeLaPinzaMm?: number
}

const PROFUNDIDAD: Readonly<Record<PlanoDelObjeto, number>> = { piel: 0, fascia: 1, musculo: 2, hueso: 3 }
const EN_EL_PLANO: Readonly<Record<PlanoDelObjeto, string>> = {
  piel: 'a la piel',
  fascia: 'a la fascia',
  musculo: 'al músculo',
  hueso: 'al hueso',
}

/** El nombre con que el menú lo encabeza y la lista «En uso» lo muestra. */
export function nombreDelObjeto(o: ObjetoPuesto): string {
  switch (o.tipo) {
    case 'separador':
      return o.nombre
    case 'pinza-de-piel':
      return `Pinza de piel ${o.id}`
    case 'pinza-de-reduccion':
      return o.nombre
    case 'placa':
      return o.nombre
    case 'tornillo': {
      const donde = o.deClavo ? `de bloqueo ${o.deClavo}` : o.libre ? 'de la trayectoria' : `del agujero ${(o.agujero ?? 0) + 1}`
      return `Tornillo ${donde} · ${String(o.diametroMm).replace('.', ',')} × ${o.largoMm} mm`
    }
    case 'aguja':
      return `Aguja de Kirschner ${o.numero}`
    case 'clavo':
      return o.nombre
    case 'injerto':
      return 'Injerto óseo'
  }
}

/**
 * Los largos que se ofrecen para cambiar un tornillo: los de su serie alrededor del que tiene, cuatro a cada lado, y el
 * que pidió el medidor aunque quede fuera. Más de nueve no caben en una fila y obligan a leer; el que se busca casi
 * siempre está a dos pasos del puesto.
 */
export function largosParaCambiar(actualMm: number, serie: SerieDeLargos, sugeridoMm?: number | null): OpcionDeCambio[] {
  const valores = new Set<number>()
  for (let i = -4; i <= 4; i++) {
    const v = actualMm + i * serie.pasoMm
    if (v >= serie.minimoMm - 1e-6 && v <= serie.maximoMm + 1e-6) valores.add(Math.round(v * 10) / 10)
  }
  if (sugeridoMm && sugeridoMm >= serie.minimoMm && sugeridoMm <= serie.maximoMm) valores.add(sugeridoMm)
  return [...valores]
    .sort((a, b) => a - b)
    .map((valor) => ({
      valor,
      etiqueta: `${String(valor).replace('.', ',')} mm`,
      actual: Math.abs(valor - actualMm) < 1e-6,
      sugerida: !!sugeridoMm && Math.abs(valor - sugeridoMm) < 1e-6,
    }))
}

/**
 * Lo que ofrece cada cosa puesta, en el orden en que se lee. **«Retirar» va siempre, y al final** (Cristóbal: «siempre
 * debe aparecer la de retirar»): al final para que la mano lo encuentre siempre en el mismo sitio, y no arriba, donde un
 * clic de más saca lo que se quería ajustar.
 */
export function accionesDelObjeto(o: ObjetoPuesto, c: ContextoDelMenu): AccionDelObjeto[] {
  const acciones: AccionDelObjeto[] = []
  switch (o.tipo) {
    case 'separador': {
      acciones.push({
        id: 'mover',
        etiqueta: 'Mover en este mismo plano',
        ayuda: 'Queda en la mano, con su apertura; un clic junto al borde lo deja. Esc lo devuelve.',
      })
      if (!o.palanca) {
        // El que está más hondo primero: «profundizar» es lo que más se pide al ir llegando al hueso.
        const otros = c.planosConHerida
          .filter((p): p is Exclude<PlanoDelObjeto, 'hueso'> => p !== o.plano && p !== 'hueso')
          .sort((a, b) => PROFUNDIDAD[b] - PROFUNDIDAD[a])
        for (const plano of otros) {
          const verbo = PROFUNDIDAD[plano] > PROFUNDIDAD[o.plano] ? 'Profundizar' : 'Subir'
          acciones.push({ id: 'plano', etiqueta: `${verbo}: ${EN_EL_PLANO[plano]}`, plano })
        }
      }
      acciones.push({ id: 'apertura', etiqueta: o.palanca ? 'Palanca' : 'Apertura', valorMm: o.aperturaMm, maximoMm: o.maximoMm })
      acciones.push({ id: 'retirar', etiqueta: 'Retirar del campo', pregunta: null })
      break
    }
    case 'pinza-de-piel':
      acciones.push({ id: 'levantar', etiqueta: 'Levantar la piel', valorMm: o.alturaMm, maximoMm: c.alturaMaximaDeLaPinzaMm ?? 10 })
      acciones.push({ id: 'retirar', etiqueta: 'Retirar (soltar la piel)', pregunta: null })
      break
    case 'pinza-de-reduccion':
      acciones.push({ id: 'retirar', etiqueta: 'Retirar (soltar la pinza)', pregunta: null })
      break
    case 'placa': {
      if (o.fijada && o.tornillos === 0) acciones.push({ id: 'soltar-la-fijacion', etiqueta: 'Soltar la fijación para moverla' })
      const posibles = c.agujerosPosibles ?? []
      if (posibles.length > 0) {
        acciones.push({
          id: 'cambiar',
          etiqueta: 'Cambiar por otra de',
          unidad: 'agujeros',
          opciones: posibles.map((n) => ({ valor: n, etiqueta: `${n}`, actual: n === o.agujeros, sugerida: false })),
        })
      }
      acciones.push({
        id: 'retirar',
        etiqueta: 'Retirar la placa',
        pregunta: o.tornillos > 0 ? `Se quitan también ${o.tornillos === 1 ? 'su tornillo' : `sus ${o.tornillos} tornillos`}.` : null,
      })
      break
    }
    case 'tornillo': {
      if (c.serieDelTornillo) {
        acciones.push({ id: 'cambiar', etiqueta: 'Cambiar por otro de', unidad: 'mm', opciones: largosParaCambiar(o.largoMm, c.serieDelTornillo, c.sugeridoMm) })
      }
      acciones.push({ id: 'retirar', etiqueta: 'Retirar el tornillo', pregunta: null })
      break
    }
    case 'aguja':
      if (o.total > 1) acciones.push({ id: 'retirar-todas', etiqueta: `Retirar las ${o.total} agujas` })
      acciones.push({ id: 'retirar', etiqueta: 'Retirar esta aguja', pregunta: null })
      break
    case 'clavo':
      acciones.push({ id: 'quitar-el-enclavado', etiqueta: 'Quitar todo el enclavado (guía, arco y clavo)' })
      acciones.push({ id: 'retirar', etiqueta: 'Retirar el clavo', pregunta: null })
      break
    case 'injerto':
      acciones.push({ id: 'retirar', etiqueta: 'Retirar el injerto', pregunta: null })
      break
  }
  return acciones
}

/**
 * Lo que la consola sabe de lo puesto, por los avisos del lienzo. Va con formas mínimas y no con los tipos del lienzo para
 * que esto se pruebe sin three: cada campo es lo que ya trae su estado (`EstadoDeLosSeparadores`, `EstadoDeLaFijacion`…).
 */
export interface LoPuestoEnLaConsola {
  separadores?: {
    lista: readonly { id: number; nombre: string; tipo: string; plano: PlanoDelObjeto; aperturaMm: number; maximoMm: number; instrumentoId: string }[]
  } | null
  pellizcos?: { lista: readonly { id: number; alturaMm: number }[] } | null
  pinzasDeReduccion?: { pinzas: readonly { id: number; nombre: string; pieza: string }[] } | null
  fijacion?: {
    placa: { nombre: string; agujeros: number; fijada?: boolean } | null
    tornillos: readonly { agujero: number; libre?: boolean; deClavo?: string; largoMm: number; diametroMm: number; bloqueado: boolean }[]
  } | null
  alambres?: { lista: readonly { numero: number }[] } | null
  clavo?: { diametroMm: number; largoMm: number } | null
  injerto?: object | null
}

/**
 * Lo que hay puesto, en el orden en que se mira el campo: lo que separa y sostiene, lo que fija, y lo que rellena. Es la
 * lista «En uso» y de ella sale el objeto del menú abierto, para que el menú diga siempre lo de ahora (la apertura que
 * cambia mientras se arrastra el deslizador) y se cierre solo si lo que muestra deja de estar.
 *
 * La separación roma no entra: son las ramas de la tijera abiertas en el plano, no un instrumento que se deja puesto.
 */
export function objetosPuestos(p: LoPuestoEnLaConsola): ObjetoPuesto[] {
  const lista: ObjetoPuesto[] = []
  for (const s of p.separadores?.lista ?? []) {
    if (s.tipo === 'roma') continue
    lista.push({
      tipo: 'separador',
      id: s.id,
      nombre: s.nombre,
      plano: s.plano,
      palanca: s.tipo === 'palanca',
      aperturaMm: s.aperturaMm,
      maximoMm: s.maximoMm,
      instrumentoId: s.instrumentoId,
    })
  }
  for (const q of p.pellizcos?.lista ?? []) lista.push({ tipo: 'pinza-de-piel', id: q.id, alturaMm: q.alturaMm })
  for (const q of p.pinzasDeReduccion?.pinzas ?? []) lista.push({ tipo: 'pinza-de-reduccion', id: q.id, nombre: q.nombre, pieza: q.pieza })
  const f = p.fijacion
  // Todos los tornillos cuentan para la placa: «Retirar la placa» los saca todos (`quitarImplantes(true)`), también los de la
  // trayectoria, y la pregunta tiene que decir los que de verdad se van.
  if (f?.placa) lista.push({ tipo: 'placa', nombre: f.placa.nombre, fijada: !!f.placa.fijada, agujeros: f.placa.agujeros, tornillos: f.tornillos.length })
  for (const t of f?.tornillos ?? []) {
    lista.push({
      tipo: 'tornillo',
      id: t.agujero,
      agujero: t.libre || t.deClavo ? null : t.agujero,
      libre: !!t.libre,
      deClavo: t.deClavo ?? null,
      largoMm: t.largoMm,
      diametroMm: t.diametroMm,
      bloqueado: t.bloqueado,
    })
  }
  const agujas = p.alambres?.lista ?? []
  for (const a of agujas) lista.push({ tipo: 'aguja', numero: a.numero, total: agujas.length })
  if (p.clavo) {
    const coma = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
    lista.push({ tipo: 'clavo', nombre: `Clavo endomedular · Ø ${coma(p.clavo.diametroMm)} × ${Math.round(p.clavo.largoMm)} mm` })
  }
  if (p.injerto) lista.push({ tipo: 'injerto' })
  return lista
}

/** La clave estable de un objeto puesto: para la lista «En uso» y para saber si el menú abierto sigue existiendo. */
export function claveDelObjeto(o: ObjetoPuesto): string {
  switch (o.tipo) {
    case 'separador':
    case 'pinza-de-piel':
    case 'pinza-de-reduccion':
    case 'tornillo':
      return `${o.tipo}:${o.id}`
    case 'aguja':
      return `aguja:${o.numero}`
    default:
      return o.tipo
  }
}
