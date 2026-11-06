import type { LecturaClinica } from '@/atlas/lecturaClinica'
import {
  evaluarGesto,
  juicioDelBloqueo,
  pasosSinNadaQueReducir,
  puntajeMaximo,
  puntosDelPaso,
  RESULTADOS,
  topesDelFoco,
  type Gesto,
  type LesionDeEstructura,
  type MedidaDeLaReduccion,
  type PasoQuirurgico,
  type TornillosDelFragmento,
} from './simulador'

/**
 * La nota del recorrido, rehecha en el servidor (D-310).
 *
 * Hasta aquí el puntaje lo calculaba el navegador y el servidor lo guardaba tal cual: `Actividad.ts` lo decía en voz
 * alta —un residente podía escribir el que quisiera con una llamada a su propia fila— y lo aceptaba porque era
 * seguimiento, no una nota. Con el modo evaluación (D-258, D-265) y el panel docente por delante (E9-7 de P-009), deja de
 * bastar.
 *
 * Ahora el navegador manda, con el puntaje, **lo que se hizo en cada paso**: los gestos que evaluó y lo que no sale del
 * gesto —la reducción automática, el bloqueo del foco, la lesión de un vaso o un nervio y la medida de partida—. El
 * servidor los vuelve a pasar por las mismas funciones del motor (`evaluarGesto`, `puntosDelPaso`, `puntajeMaximo`) con
 * la regla de D-059 y guarda su cuenta. Si no coincide con la del navegador, guarda las dos y lo marca.
 *
 * **Lo que esto cierra y lo que no.** Cierra escribir el puntaje a mano: ya no hay número que el servidor se crea sin
 * rehacerlo. No cierra falsificar las medidas, que siguen saliendo del navegador —la escena es suya—: quien mande un
 * gesto inventado con todo dentro de los topes saca la nota entera. Para eso haría falta repetir la simulación en el
 * servidor, y no se hace.
 *
 * **Por qué tres gestos por paso y no todos.** `puntosDelPaso` mira dos banderas y no dos contadores —el segundo fallo
 * del mismo paso no empeora nada (D-059)—, así que para rehacer la cuenta basta, de cada paso, el primer gesto que
 * falló, el primero que dañó y el que lo superó. La consola guarda solo esos (`conIntento`). Todos habrían sido decenas
 * de kB por caso en cada hito, y el recorrido viaja también dentro del avance guardado, que tiene su tope.
 */

/** Lo que se hizo en un paso, tal como lo rehace el servidor. */
export interface GestosDelPaso {
  /** El identificador de la fila del guion (`pasos[].id`). */
  paso: string
  /** En orden: el primero que falló, el primero que dañó y el que superó el paso, los que haya. */
  intentos: Gesto[]
  /** Se eligió la reducción automática en este paso (P-004 E7): no puntúa. */
  automatica?: boolean
  /** La reducción cuando un implante bloqueó el foco fuera de los topes (D-308): la complicación de fijar sin reducir. */
  bloqueo?: MedidaDeLaReduccion
  /** El primer vaso o nervio que se cortó o se perforó en este paso (P-012 E6): la complicación de lesionarlo. */
  lesion?: LesionDeEstructura
}

/** El recorrido entero, para la nota. */
export interface RecorridoDelCaso {
  v: 1
  /**
   * El modo en que se empezó (E4 de P-012). Lo pone la consola al empezar el caso y ya no cambia, porque cambiar de modo
   * es empezar otro recorrido. El servidor guarda este y no el que acompaña a cada resultado: aquel es el de la pantalla
   * en el momento de mandar, y este dice cómo se hizo el recorrido entero. Ausente en los de antes de E4.
   */
  modo?: 'practica' | 'evaluacion'
  /**
   * La medida del trozo recién colocado en su desplazamiento inicial (D-306): de ella salen los pasos que no tienen
   * nada que reducir. `null`, el modelo no trae fragmento; ausente, todavía no se colocó.
   */
  partida?: MedidaDeLaReduccion | null
  /** Un elemento por paso tocado, en el orden en que se tocaron. */
  pasos: GestosDelPaso[]
}

export const RECORRIDO_VACIO: RecorridoDelCaso = { v: 1, pasos: [] }

/** Cuántos gestos se aceptan de un paso. La consola manda tres como mucho; el margen es para no rechazar de más. */
export const MAXIMO_DE_INTENTOS_POR_PASO = 6
/** Lo más que puede ocupar el recorrido, en caracteres: veinte pasos con sus tres gestos caben en unos 40 kB. */
export const TOPE_DEL_RECORRIDO = 120_000

// --------------------------------------------------------------------------------------------- lo que hace la consola

/** De qué clase es un gesto para la nota: el que supera, el que daña, el que falla y el que no cuenta. */
function claseDelIntento(paso: PasoQuirurgico, gesto: Gesto): 'acierto' | 'complicacion' | 'fallo' | null {
  const evaluacion = evaluarGesto(paso, gesto)
  if (evaluacion.avanza) return 'acierto'
  if (evaluacion.complicacion) return 'complicacion'
  // Pulsar sin instrumento no se cobra (`aplicarPaso`): ahí no llegó a tocarse al paciente.
  return evaluacion.resultado === RESULTADOS.SIN_INSTRUMENTO ? null : 'fallo'
}

/** El elemento del paso, nuevo si no estaba, y el recorrido con él cambiado. */
function conElPaso(recorrido: RecorridoDelCaso, paso: string, cambiar: (p: GestosDelPaso) => GestosDelPaso): RecorridoDelCaso {
  const esta = recorrido.pasos.some((p) => p.paso === paso)
  return {
    ...recorrido,
    pasos: esta
      ? recorrido.pasos.map((p) => (p.paso === paso ? cambiar(p) : p))
      : [...recorrido.pasos, cambiar({ paso, intentos: [] })],
  }
}

/**
 * El recorrido con un gesto más de un paso: solo si es el primero de su clase. Uno que no cuenta —sin instrumento— o
 * de una clase que el paso ya tiene no cambia la nota y no se guarda.
 */
export function conIntento(recorrido: RecorridoDelCaso, paso: PasoQuirurgico & { id: string }, gesto: Gesto): RecorridoDelCaso {
  const clase = claseDelIntento(paso, gesto)
  if (!clase) return recorrido
  const previos = recorrido.pasos.find((p) => p.paso === paso.id)?.intentos ?? []
  if (previos.some((g) => claseDelIntento(paso, g) === clase)) return recorrido
  return conElPaso(recorrido, paso.id, (p) => ({ ...p, intentos: [...p.intentos, gestoParaLaNota(gesto)] }))
}

/** El recorrido con la reducción automática marcada en un paso. */
export const conAutomatica = (recorrido: RecorridoDelCaso, paso: string): RecorridoDelCaso =>
  conElPaso(recorrido, paso, (p) => ({ ...p, automatica: true }))

/** El recorrido con el primer bloqueo del foco fuera de los topes de un paso; los siguientes no cambian la nota. */
export const conBloqueo = (recorrido: RecorridoDelCaso, paso: string, medida: MedidaDeLaReduccion): RecorridoDelCaso =>
  conElPaso(recorrido, paso, (p) => (p.bloqueo ? p : { ...p, bloqueo: medidaParaLaNota(medida) }))

/**
 * El recorrido con la primera lesión de un vaso o un nervio en un paso. Las siguientes no cambian la nota —la
 * complicación es una bandera por paso (D-059)— y no se guardan: lo que se guarda es lo que el servidor necesita.
 */
export const conLesion = (recorrido: RecorridoDelCaso, paso: string, lesion: LesionDeEstructura): RecorridoDelCaso =>
  conElPaso(recorrido, paso, (p) =>
    p.lesion ? p : { ...p, lesion: { rol: lesion.rol, nombre: lesion.nombre.slice(0, 200), como: lesion.como } },
  )

/** El recorrido con la medida de partida. */
export const conPartida = (recorrido: RecorridoDelCaso, partida: MedidaDeLaReduccion | null): RecorridoDelCaso => ({
  ...recorrido,
  partida: partida ? medidaParaLaNota(partida) : null,
})

/** Lo de la reducción que mira la nota: las tres cifras y la lectura clínica. */
export function medidaParaLaNota(m: MedidaDeLaReduccion): MedidaDeLaReduccion {
  return {
    desplazamiento: m.desplazamiento,
    diastasis: m.diastasis,
    angulacion: m.angulacion,
    lectura: m.lectura ? lecturaParaLaNota(m.lectura) : null,
  }
}

function lecturaParaLaNota(l: LecturaClinica): LecturaClinica {
  return {
    lateral: l.lateral,
    anteroposterior: l.anteroposterior,
    axial: l.axial,
    valgo: l.valgo,
    recurvatum: l.recurvatum,
    rotacion: l.rotacion,
  }
}

/**
 * Lo del gesto que mira `evaluarGesto`, sin lo demás. Se va el nombre del instrumento, que solo sirve para el mensaje,
 * y todo lo que el objeto de la consola lleve de más: lo que viaja es lo que se va a rehacer.
 */
export function gestoParaLaNota(g: Gesto): Gesto {
  return {
    instrumento: g.instrumento,
    ...(g.trazo !== undefined ? { trazo: g.trazo } : {}),
    ...(g.desplazamiento !== undefined ? { desplazamiento: g.desplazamiento } : {}),
    ...(g.diastasis !== undefined ? { diastasis: g.diastasis } : {}),
    ...(g.angulacion !== undefined ? { angulacion: g.angulacion } : {}),
    lectura: g.lectura ? lecturaParaLaNota(g.lectura) : null,
    ...(g.fuerza !== undefined ? { fuerza: g.fuerza } : {}),
    ...(g.perforacion ? { perforacion: { ...g.perforacion } } : {}),
    ...(g.fijacion
      ? {
          fijacion: {
            placa: g.fijacion.placa,
            tornillos: g.fijacion.tornillos,
            bicorticales: g.fijacion.bicorticales,
            largos: g.fijacion.largos,
            ...(g.fijacion.compresionMm !== undefined ? { compresionMm: g.fijacion.compresionMm } : {}),
            ...(g.fijacion.porFragmento ? { porFragmento: g.fijacion.porFragmento.map((t) => ({ ...t })) } : {}),
          },
        }
      : {}),
    ...(g.plano ? { plano: { ...g.plano } } : {}),
  }
}

// ------------------------------------------------------------------------------------------- lo que hace el servidor

/**
 * La nota que sale de rehacer el recorrido con los pasos del caso.
 *
 * Paso a paso, en el orden del guion: el bloqueo fuera de los topes, la lesión de un vaso o un nervio y cada gesto que
 * dañó encienden la complicación,
 * cada gesto que falló sin dañar enciende el fallo, y el primero que supera el paso cobra lo que diga `puntosDelPaso`
 * con esas banderas, la automática y el «sin nada que reducir» de la partida. Un paso sin gesto que lo supere no suma.
 * Un paso del recorrido que el caso ya no tiene no cuenta: lo que vale es el guion que hay hoy.
 */
export function notaDelRecorrido(
  pasos: readonly (PasoQuirurgico & { id: string })[],
  recorrido: RecorridoDelCaso,
): { puntaje: number; puntajeMaximo: number } {
  const sinNada = recorrido.partida === undefined ? new Set<string>() : pasosSinNadaQueReducir(pasos, recorrido.partida)
  const hechos = new Map(recorrido.pasos.map((p) => [p.paso, p]))
  let puntaje = 0
  pasos.forEach((paso, indice) => {
    const hecho = hechos.get(paso.id)
    if (!hecho) return
    let fallo = false
    let complicacion =
      (!!hecho.bloqueo && juicioDelBloqueo(hecho.bloqueo, topesDelFoco(pasos, indice)) !== null) || !!hecho.lesion
    for (const gesto of hecho.intentos) {
      const clase = claseDelIntento(paso, gesto)
      if (clase === 'acierto') {
        puntaje += puntosDelPaso(paso, {
          fallo,
          complicacion,
          reduccionAutomatica: hecho.automatica === true,
          sinNadaQueReducir: sinNada.has(paso.id),
        })
        return
      }
      if (clase === 'complicacion') complicacion = true
      else if (clase === 'fallo') fallo = true
    }
  })
  return { puntaje, puntajeMaximo: puntajeMaximo(pasos, sinNada) }
}

/** Una nota: el numerador y su denominador, que van juntos o mienten por separado. */
export interface NotaDelCaso {
  puntaje: number
  puntajeMaximo: number
}

/** Lo que dice la comprobación de la nota, como lo guarda `Actividad.comprobacionDeLaNota`. */
export type ComprobacionDeLaNota = 'coincide' | 'no-coincide' | 'sin-comprobar'

/**
 * Lo que se guarda de la nota (D-310): la del servidor si pudo rehacerla, y la del navegador al lado si no coinciden.
 * Sin la del servidor se guarda la del navegador, «sin comprobar»: es lo que hay, y la marca dice cuánto fiarse.
 *
 * Se comparan con una millonésima de margen porque los puntos de un paso pueden ser decimales (7,5, ver
 * `exigirPuntos`), y una suma de decimales hecha en otro orden puede diferir en el último bit sin que nadie haya tocado
 * nada.
 */
export function comprobacionDeLaNota(
  delServidor: NotaDelCaso | null,
  delNavegador: NotaDelCaso,
): NotaDelCaso & { comprobacion: ComprobacionDeLaNota; delNavegador: NotaDelCaso | null } {
  if (!delServidor) return { ...delNavegador, comprobacion: 'sin-comprobar', delNavegador: null }
  const igual = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const coincide = igual(delServidor.puntaje, delNavegador.puntaje) && igual(delServidor.puntajeMaximo, delNavegador.puntajeMaximo)
  return {
    puntaje: delServidor.puntaje,
    puntajeMaximo: delServidor.puntajeMaximo,
    comprobacion: coincide ? 'coincide' : 'no-coincide',
    delNavegador: coincide ? null : { puntaje: delNavegador.puntaje, puntajeMaximo: delNavegador.puntajeMaximo },
  }
}

// --------------------------------------------------------------------------------------------- lo que llega por HTTP

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const entero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000
const textoCorto = (v: unknown): v is string => typeof v === 'string' && v.length <= 200

/**
 * Un número que solo se copia si es finito. Lo que no lo sea se queda fuera, y `evaluarGesto` lee la falta como lo
 * peor —una reducción sin cifra no está dentro de ningún tope—: un dato roto nunca aprueba.
 */
const numeroOpcional = (v: unknown) => (finito(v) ? v : undefined)

function lecturaValida(v: unknown): LecturaClinica | null {
  if (!esObjeto(v)) return null
  const claves = ['lateral', 'anteroposterior', 'axial', 'valgo', 'recurvatum', 'rotacion'] as const
  if (!claves.every((c) => finito(v[c]))) return null
  return Object.fromEntries(claves.map((c) => [c, v[c]])) as unknown as LecturaClinica
}

function medidaValida(v: unknown, que: string): MedidaDeLaReduccion {
  if (!esObjeto(v)) throw new Error(`${que} no llegó como corresponde.`)
  return {
    desplazamiento: numeroOpcional(v.desplazamiento),
    diastasis: numeroOpcional(v.diastasis),
    angulacion: numeroOpcional(v.angulacion),
    lectura: lecturaValida(v.lectura),
  }
}

function porFragmentoValido(v: unknown): TornillosDelFragmento[] | undefined {
  if (!Array.isArray(v) || v.length > 10) return undefined
  const lista = v.filter(
    (t): t is TornillosDelFragmento =>
      esObjeto(t) && textoCorto(t.nodo) && textoCorto(t.nombre) && entero(t.tornillos) && entero(t.bloqueados),
  )
  // Uno roto deja la lista entera fuera, y no a medias: con un fragmento de menos, la placa «no cruzaría la fractura».
  return lista.length === v.length ? lista.map((t) => ({ nodo: t.nodo, nombre: t.nombre, tornillos: t.tornillos, bloqueados: t.bloqueados })) : undefined
}

/**
 * La lesión de un paso, o un error. Se rechaza entera y no se arregla: una lesión rota que se quedase fuera devolvería
 * los puntos de un paso que el navegador ya dio por complicado, y las dos notas dejarían de coincidir sin que nadie
 * supiera por qué.
 */
function lesionValida(v: unknown, que: string): LesionDeEstructura {
  if (
    !esObjeto(v) ||
    (v.rol !== 'vaso' && v.rol !== 'nervio') ||
    !textoCorto(v.nombre) ||
    v.nombre === '' ||
    (v.como !== 'corte' && v.como !== 'perforacion')
  ) {
    throw new Error(`${que} no llegó como corresponde.`)
  }
  return { rol: v.rol, nombre: v.nombre, como: v.como }
}

/** Un gesto del recorrido, rehecho campo a campo: solo lo que el motor sabe leer y solo si tiene la forma que espera. */
function gestoValido(v: unknown, que: string): Gesto {
  if (!esObjeto(v)) throw new Error(`${que} no llegó como corresponde.`)
  const gesto: Gesto = {
    instrumento: textoCorto(v.instrumento) && v.instrumento !== '' ? v.instrumento : null,
    trazo: numeroOpcional(v.trazo),
    desplazamiento: numeroOpcional(v.desplazamiento),
    diastasis: numeroOpcional(v.diastasis),
    angulacion: numeroOpcional(v.angulacion),
    lectura: lecturaValida(v.lectura),
    fuerza: numeroOpcional(v.fuerza),
  }
  const p = v.perforacion
  if (esObjeto(p) && finito(p.diametroMm) && finito(p.anguloConElEje) && typeof p.bicortical === 'boolean' && finito(p.sePasoMm)) {
    gesto.perforacion = { diametroMm: p.diametroMm, anguloConElEje: p.anguloConElEje, bicortical: p.bicortical, sePasoMm: p.sePasoMm }
  }
  const f = v.fijacion
  if (esObjeto(f) && typeof f.placa === 'boolean' && entero(f.tornillos) && entero(f.bicorticales) && entero(f.largos)) {
    const porFragmento = porFragmentoValido(f.porFragmento)
    gesto.fijacion = {
      placa: f.placa,
      tornillos: f.tornillos,
      bicorticales: f.bicorticales,
      largos: f.largos,
      ...(finito(f.compresionMm) ? { compresionMm: f.compresionMm } : {}),
      ...(porFragmento ? { porFragmento } : {}),
    }
  }
  const pl = v.plano
  if (esObjeto(pl) && typeof pl.cortado === 'boolean' && finito(pl.retraidoMm)) {
    gesto.plano = {
      nodo: textoCorto(pl.nodo) ? pl.nodo : null,
      accion: pl.accion === 'cortar' || pl.accion === 'separar' ? pl.accion : null,
      cortado: pl.cortado,
      retraidoMm: pl.retraidoMm,
    }
  }
  return gesto
}

/**
 * El recorrido que llega del navegador, rehecho entero y comprobado, o un error que dice qué falla. Se rehace y no se
 * copia: a `evaluarGesto` solo le llega lo que sabe leer, con la forma que espera.
 */
export function recorridoValido(valor: unknown): RecorridoDelCaso {
  if (!esObjeto(valor) || valor.v !== 1) throw new Error('El recorrido del caso no llegó como corresponde.')
  if (JSON.stringify(valor).length > TOPE_DEL_RECORRIDO) throw new Error('El recorrido del caso ocupa demasiado.')
  if (!Array.isArray(valor.pasos) || valor.pasos.length > 500) throw new Error('Los pasos del recorrido tienen que llegar en una lista.')
  const modo = valor.modo
  if (modo !== undefined && modo !== 'practica' && modo !== 'evaluacion') {
    throw new Error('El modo del recorrido tiene que ser práctica o evaluación.')
  }
  const pasos = valor.pasos.map((bruto, i): GestosDelPaso => {
    const que = `El paso ${i + 1} del recorrido`
    if (!esObjeto(bruto) || !textoCorto(bruto.paso) || bruto.paso === '') throw new Error(`${que} no nombra su paso.`)
    if (!Array.isArray(bruto.intentos) || bruto.intentos.length > MAXIMO_DE_INTENTOS_POR_PASO) {
      throw new Error(`${que} trae sus gestos mal o demasiados.`)
    }
    return {
      paso: bruto.paso,
      intentos: bruto.intentos.map((g, j) => gestoValido(g, `El gesto ${j + 1} del paso ${i + 1} del recorrido`)),
      ...(bruto.automatica === true ? { automatica: true } : {}),
      ...(bruto.bloqueo !== undefined && bruto.bloqueo !== null ? { bloqueo: medidaValida(bruto.bloqueo, `El bloqueo del paso ${i + 1} del recorrido`) } : {}),
      ...(bruto.lesion !== undefined && bruto.lesion !== null ? { lesion: lesionValida(bruto.lesion, `La lesión del paso ${i + 1} del recorrido`) } : {}),
    }
  })
  // En evaluación la consola no ofrece la reducción automática (E4 de P-012). Un recorrido que dice las dos cosas no
  // salió de ella: no se rehace, y la fila queda «sin comprobar», que es lo que el docente tiene que ver. Rehacerlo
  // daría una nota que coincide —la automática vale cero igual— sobre un recorrido que no pudo pasar.
  if (modo === 'evaluacion' && pasos.some((p) => p.automatica)) {
    throw new Error('Un recorrido en evaluación no puede traer la reducción automática.')
  }
  const recorrido: RecorridoDelCaso = { v: 1, ...(modo ? { modo } : {}), pasos }
  if (valor.partida === null) recorrido.partida = null
  else if (valor.partida !== undefined) recorrido.partida = medidaValida(valor.partida, 'La medida de partida')
  return recorrido
}
