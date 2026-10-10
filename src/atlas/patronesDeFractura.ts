/**
 * De una receta de fractura AO a los cortes que la dibujan (D-161, E4).
 *
 * Una receta es lo que el traumatólogo eligió en el asistente: qué hueso, qué
 * segmento, qué grupo, dónde cae y cuánto ocupa. Este módulo la convierte en una
 * lista de `CorteDePieza` encadenados (`FJ3387`, después `FJ3387#b`, …) que el
 * visor ya sabe partir. Es una función pura y determinista: la misma receta sobre
 * el mismo hueso da los mismos cortes hasta el último decimal, y por eso se puede
 * guardar la receta y regenerar los cortes al abrir, o guardar los cortes y
 * volver a la receta para reeditar.
 *
 * Sin `three`: el taller lo importa de forma estática.
 *
 * ## Cómo se corta cada grupo
 *
 * | Grupo | Cortes |
 * |---|---|
 * | A3 transversa | un plano casi perpendicular al eje (0–15°) |
 * | A2 oblicua | un plano inclinado 30–60° hacia la cara elegida |
 * | B2 cuña íntegra | dos planos que se cruzan en el vértice de la cuña, aplicados uno tras otro |
 * | B3 cuña fragmentada | B2 y otro corte que parte la cuña en dos |
 * | C2 segmentaria íntegra | dos planos paralelos, `extension` separados |
 * | C3 segmentaria fragmentada | C2 y otro corte oblicuo que parte el segmento |
 * | A1 espiroidea | un plano muy oblicuo (55–60°, el máximo que admite el corte), el mismo mecanismo que la oblicua |
| C conminuta focal («martillo») | dos planos que acotan una zona de `extension` y tres que la parten desde dentro: seis fragmentos juntos en un solo punto |
 *
 * `A1` espiroidea es una **aproximación**: la superficie de una espiroidea es una
 * hélice y no un plano (R1 de P-001), y lo que se dibuja es el plano más
 * inclinado que enseña la misma radiografía —el trazo oblicuo largo—. Se probó
 * una versión con dos planos (un corte oblicuo y una pared que contiene el eje,
 * que deja una lengüeta) y se descartó: el fragmento de «todo lo demás» sale como
 * unión de dos trozos cerrados cuyas tapas no casan, y deja de ser un trozo
 * cerrado, que es lo que exige cada fragmento (R3). Lo valida Cristóbal (E4-Q1).
 *
 * El fragmento `a` de un corte es el que queda hacia donde apunta su normal. Los
 * planos de aquí apuntan al lado **distal**, así que `a` es el distal y `b`, el
 * proximal.
 *
 * ## La cuña son dos cortes de un plano
 *
 * Hasta D-168 la cuña se hacía de una vez con los dos planos (`otrosPlanos`): `a`
 * era la cuña y `b` «todo lo demás», una sola pieza que después se partía con un
 * plano transversal. Esa pieza era la unión de dos trozos cerrados, con sus tapas
 * una contra otra sin coincidir triángulo a triángulo, y en un hueso pequeño o
 * achatado (los metacarpianos, las falanges, el radio izquierdo) el corte
 * siguiente la dejaba abierta: ninguno de los huesos pequeños salía bien.
 * Ahora son dos cortes de un solo plano, uno detrás de otro, que dejan los mismos
 * tres fragmentos y todos cerrados por construcción: el plano 1 aparta el distal,
 * y el plano 2 parte lo que queda en la cuña y el proximal.
 */

import type { EjeDelHueso } from '@/lib/planoDeCorte'
import { INCLINACION_MAXIMA, POSICION_MAXIMA, POSICION_MINIMA, planoDelCorte, radioEn } from '@/lib/planoDeCorte'
import { codigoAO, describirFractura, grupoAO, huesoAO, segmentoAO, type GrupoAO, type HuesoAO, type SegmentoAO } from './clasificacionAO'
import { huesoDeLaPieza } from './huesosAO'
import { idDeFragmento, type CorteDePieza, type FracturaDeInstancia, type RecetaDeFractura } from './formato'
import type { SegmentosDelHueso } from './segmentosAO'
import { aPorcentaje } from './segmentosAO'

export type { RecetaDeFractura, FracturaDeInstancia }

/**
 * Dónde cortan las esquirlas de la conminuta focal y cómo se parte el núcleo
 * (D-169). No son gusto: salen de barrer a mano 40 semillas por hueso con la
 * profundidad (0,3–0,65 del radio) y la torsión (0–40°) de las esquirlas, y de
 * contar los trozos que salían abiertos. Es un barrido ruidoso —cambiar un grado
 * cambia qué semillas fallan—, y esta combinación dejó a los seis huesos largos con
 * menos de una semilla de cada diez fallida. Vale lo mismo que un número de
 * lotería: si se toca, hay que repetir el barrido (`tests/unit/fracturasAO.test.ts`).
 */
const FONDO_DE_LA_ESQUIRLA = 0.65
const INCLINACION_DEL_NUCLEO = (60 * Math.PI) / 180

/** Cuánto puede ocupar la porción, en % del largo del hueso. */
export const EXTENSION_MINIMA = 3
export const EXTENSION_MAXIMA = 40

/** A2 es oblicua desde 30°, y A3 transversa por debajo: es la definición de AO. */
export const INCLINACION_OBLICUA_MINIMA = 30
export const INCLINACION_TRANSVERSA_MAXIMA = 15
/** Una espiroidea se dibuja con un corte aún más inclinado que una oblicua. */
export const INCLINACION_ESPIROIDEA_MINIMA = 55

/** La receta con la que nace cada grupo: lo que el asistente propone antes de tocar nada. */
export function recetaPorOmision(
  pieza: string,
  hueso: HuesoAO,
  segmento: SegmentoAO,
  grupo: GrupoAO,
  /**
   * El hueso ya medido. Con él, la porción nace en el centro de su segmento: un
   * extremo de la tibia mide el 12 % del hueso y un centro fijo en el 85 % caería
   * en la diáfisis. Sin él, valen los centros aproximados de siempre.
   */
  medida?: { eje: EjeDelHueso; segmentos: SegmentosDelHueso },
): RecetaDeFractura {
  const g = grupoAO(grupo)
  const patron = g?.patron
  const receta: RecetaDeFractura = {
    pieza,
    hueso,
    segmento,
    grupo,
    porcion: {
      centro: segmento === 1 ? 15 : segmento === 3 ? 85 : 50,
      extension: patron === 'segmentaria-integra' || patron === 'segmentaria-fragmentada' ? 15 : patron === 'conminuta-focal' ? 15 : 8,
    },
    inclinacion: patron === 'oblicua' ? 45 : patron === 'espiroidea' ? 60 : 0,
    giro: 0,
    semilla: 1,
  }
  if (!medida) return receta
  const { min, max } = limitesDelCentro(medida.eje, medida.segmentos, segmento, receta.porcion.extension)
  return { ...receta, porcion: { ...receta.porcion, centro: redondear((min + max) / 2) } }
}

// ------------------------------------------------------------- una receta limpia

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const redondear = (v: number, cifras = 1) => Math.round(v * 10 ** cifras) / 10 ** cifras || 0

/**
 * La receta que se deja guardar, o `null`.
 *
 * Llega del navegador, que es un extremo HTTP: no se corrige en silencio lo que
 * no tiene sentido —un grupo que el segmento no admite, un hueso que no está en la
 * tabla— porque guardaría una fractura distinta de la que se pidió. Lo que sí se
 * acota es un número fuera de rango, que no cambia qué fractura es.
 */
export function normalizarReceta(bruta: unknown): RecetaDeFractura | null {
  if (!bruta || typeof bruta !== 'object') return null
  const r = bruta as Record<string, unknown>
  if (typeof r.pieza !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r.pieza)) return null
  const hueso = typeof r.hueso === 'string' ? huesoAO(r.hueso) : null
  const grupo = typeof r.grupo === 'string' ? grupoAO(r.grupo) : null
  if (!hueso || !grupo || !finito(r.segmento) || !segmentoAO(r.segmento)) return null
  if (!grupo.disponible || !grupo.segmentos.includes(r.segmento as SegmentoAO)) return null
  const porcion = r.porcion && typeof r.porcion === 'object' ? (r.porcion as Record<string, unknown>) : null
  if (!porcion || !finito(porcion.centro) || !finito(porcion.extension)) return null
  if (!finito(r.inclinacion) || !finito(r.giro)) return null
  const semilla = finito(r.semilla) ? Math.abs(Math.trunc(r.semilla)) % 1_000_000 : 1
  return {
    pieza: r.pieza,
    hueso: hueso.id,
    segmento: r.segmento as SegmentoAO,
    grupo: grupo.id,
    porcion: {
      centro: redondear(acotar(porcion.centro, POSICION_MINIMA, POSICION_MAXIMA)),
      extension: redondear(acotar(porcion.extension, EXTENSION_MINIMA, EXTENSION_MAXIMA)),
    },
    inclinacion: redondear(acotar(r.inclinacion, 0, INCLINACION_MAXIMA)),
    giro: redondear(((r.giro % 360) + 360) % 360),
    semilla,
  }
}

// -------------------------------------------------------------- vectores mínimos

type V = [number, number, number]
const suma = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const resta = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const por = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k]
const unitario = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2])
  return l > 0 ? por(a, 1 / l) : [0, 0, 0]
}
const sies = (v: V): V => [redondear(v[0], 6), redondear(v[1], 6), redondear(v[2], 6)]

/** Un punto del eje, a `s` metros del centro. */
const enElEje = (eje: EjeDelHueso, s: number): V => suma(eje.centro, por(eje.direccion, s))

/** La cara hacia la que sube el corte: 0 es delante y 90, fuera. */
function cara(eje: EjeDelHueso, giro: number): V {
  const phi = (giro * Math.PI) / 180
  return unitario(suma(por(eje.delante, Math.cos(phi)), por(eje.fuera, Math.sin(phi))))
}

/** Un número entre 0 y 1 que solo depende de la semilla y de cuál se pide. */
function azar(semilla: number, indice: number): number {
  let t = (semilla * 2654435761 + indice * 40503) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Un plano del eje: a `posicion` % del hueso, inclinado `inclinacion` hacia la cara `giro`. */
function planoEnElEje(eje: EjeDelHueso, posicion: number, inclinacion: number, giro: number) {
  const p = planoDelCorte(eje, { posicion: acotar(posicion, POSICION_MINIMA, POSICION_MAXIMA), inclinacion, giro })
  return { punto: sies(p.punto), normal: sies(p.normal) }
}

// ----------------------------------------------------------------- los patrones

/**
 * Los cortes de una receta sobre un hueso ya medido, en el orden del árbol: la
 * pieza primero y sus fragmentos después. Lista vacía si el grupo no está
 * disponible.
 *
 * `eje` es el de la pieza entera, en su sitio anatómico: los cortes se guardan en
 * ese espacio.
 */
export function cortesDeLaFractura(receta: RecetaDeFractura, eje: EjeDelHueso): CorteDePieza[] {
  const grupo = grupoAO(receta.grupo)
  if (!grupo?.disponible) return []
  const raiz = receta.pieza
  const { centro, extension } = receta.porcion
  const u = eje.direccion
  const largo = eje.distal - eje.proximal

  switch (grupo.patron) {
    case 'transversa': {
      const inclinacion = acotar(receta.inclinacion, 0, INCLINACION_TRANSVERSA_MAXIMA)
      return [{ pieza: raiz, ...planoEnElEje(eje, centro, inclinacion, receta.giro) }]
    }
    case 'oblicua': {
      const inclinacion = acotar(receta.inclinacion, INCLINACION_OBLICUA_MINIMA, INCLINACION_MAXIMA)
      return [{ pieza: raiz, ...planoEnElEje(eje, centro, inclinacion, receta.giro) }]
    }
    case 'cuna-integra':
    case 'cuna-fragmentada': {
      const c = cara(eje, receta.giro)
      const r = Math.max(eje.radio, 1e-3)
      const altura = (extension / 100) * largo
      const s0 = eje.proximal + (centro / 100) * largo
      // El vértice de la cuña queda algo más allá del eje, por el lado contrario a
      // la cara por la que se abre: así la cuña cruza casi todo el hueso, como la
      // mariposa que se ve en una radiografía, y no un piquito de cortical.
      const vertice = suma(enElEje(eje, s0), por(c, -0.5 * r))
      // La base de la cuña, a 1,5 radios del vértice, mide `altura`.
      const tangente = acotar(altura / (3 * r), 0.05, 2)
      const n1 = sies(unitario(resta(por(c, tangente), u)))
      const n2 = sies(unitario(suma(por(c, tangente), u)))
      // El plano 1 mira hacia la cara y hacia lo proximal: lo que queda del otro
      // lado (`#b`) es el fragmento distal. Lo que sí queda a su lado (`#a`) se
      // parte con el plano 2, que mira hacia la cara y hacia lo distal: del lado
      // de su normal (`#a#a`) está la cuña, y del otro (`#a#b`) el proximal.
      const principal = idDeFragmento(raiz, 'a')
      const cuna = idDeFragmento(principal, 'a')
      const cortes: CorteDePieza[] = [
        { pieza: raiz, punto: sies(vertice), normal: n1 },
        { pieza: principal, punto: sies(vertice), normal: n2 },
      ]
      if (grupo.patron === 'cuna-fragmentada') {
        // La cuña se parte en dos por un plano casi transversal que pasa por su
        // mitad, algo torcido según la semilla (hasta 25°) para que no sea una
        // raya perfecta.
        const torcer = ((azar(receta.semilla, 1) - 0.5) * 50 * Math.PI) / 180
        const normal = unitario(suma(por(u, Math.cos(torcer)), por(c, Math.sin(torcer))))
        cortes.push({
          pieza: cuna,
          punto: sies(suma(enElEje(eje, s0), por(c, 0.5 * r))),
          normal: sies(normal),
        })
      }
      return cortes
    }
    case 'segmentaria-integra':
    case 'segmentaria-fragmentada': {
      const inclinacion = acotar(receta.inclinacion, 0, INCLINACION_TRANSVERSA_MAXIMA)
      const mitad = extension / 2
      const arriba = planoEnElEje(eje, centro - mitad, inclinacion, receta.giro)
      const abajo = planoEnElEje(eje, centro + mitad, inclinacion, receta.giro)
      const cortes: CorteDePieza[] = [
        { pieza: raiz, ...arriba },
        // Lo distal al primer trazo se vuelve a partir: queda el distal principal
        // y, entre los dos, el segmento intermedio.
        { pieza: idDeFragmento(raiz, 'a'), ...abajo },
      ]
      if (grupo.patron === 'segmentaria-fragmentada') {
        // El segmento intermedio (`#a#b`) se parte con un plano oblicuo por su mitad.
        const oblicuo = 25 + azar(receta.semilla, 2) * 35
        const giroDelCorte = (receta.giro + 90 + azar(receta.semilla, 3) * 90) % 360
        cortes.push({
          pieza: idDeFragmento(idDeFragmento(raiz, 'a'), 'b'),
          ...planoEnElEje(eje, centro, oblicuo, giroDelCorte),
        })
      }
      return cortes
    }
    case 'conminuta-focal': {
      // Un golpe en un solo punto: cinco cortes, seis fragmentos. Los dos primeros
      // son planos casi transversales a `extension` uno del otro y dejan el trozo
      // intermedio —el foco—. De él saltan dos esquirlas de cortical por lados
      // opuestos (dos planos paralelos al eje, apartados de él, que cortan solo una
      // viruta de la pared) y el núcleo que queda se parte con un plano inclinado.
      //
      // Esa disposición no es casual; es lo que quedó tras tres intentos que dejaban
      // fragmentos abiertos en casi todos los huesos (D-169):
      //  - Planos que atraviesan el foco por el eje, girados entre sí: cortar una
      //    mitad ya tapada por otro plano que pasa por el mismo sitio dejaba el
      //    contorno cruzándose consigo mismo.
      //  - Tres esquirlas a 120°: los planos de dos esquirlas contiguas se cortan
      //    dentro del hueso, y la tercera se cortaba justo sobre la tapa de la
      //    anterior.
      // Dos esquirlas **paralelas** no se cortan nunca, y el plano que parte el
      // núcleo es casi perpendicular a sus tapas, como el segundo corte de una cuña.
      // Cada corte parte **un** trozo cerrado con **un** plano, de modo que todo sale
      // cerrado por construcción (R3).
      const inclinacion = acotar(receta.inclinacion, 0, INCLINACION_TRANSVERSA_MAXIMA)
      const mitad = extension / 2
      const arriba = planoEnElEje(eje, centro - mitad, inclinacion, receta.giro)
      const abajo = planoEnElEje(eje, centro + mitad, inclinacion, receta.giro)
      const distal = idDeFragmento(raiz, 'a')
      const foco = idDeFragmento(distal, 'b')
      const sinLaPrimera = idDeFragmento(foco, 'b')
      const nucleo = idDeFragmento(sinLaPrimera, 'b')
      const s0 = eje.proximal + (centro / 100) * largo
      // El radio **de donde se corta**, no el de las epífisis: en la tibia el máximo
      // es tres veces el de la diáfisis y un plano a medio radio quedaba fuera del hueso.
      const r = Math.max(radioEn(eje, s0), 1e-3)
      const giro1 = receta.giro + (azar(receta.semilla, 4) - 0.5) * 60
      const lado = cara(eje, giro1)
      const centroDelFoco = enElEje(eje, s0)
      // Un poco torcido hacia el eje largo para que la viruta sea cuña y no loncha.
      const t = (30 * Math.PI) / 180
      const n1 = unitario(suma(por(lado, Math.cos(t)), por(u, Math.sin(t))))
      // El núcleo se parte por un plano tumbado 60° hacia el lado de las esquirlas.
      const romper = unitario(suma(por(u, Math.cos(INCLINACION_DEL_NUCLEO)), por(lado, Math.sin(INCLINACION_DEL_NUCLEO))))
      return [
        { pieza: raiz, ...arriba },
        { pieza: distal, ...abajo },
        { pieza: foco, punto: sies(suma(centroDelFoco, por(lado, FONDO_DE_LA_ESQUIRLA * r))), normal: sies(n1) },
        // La del otro lado: la misma normal vuelta del revés, así que es paralela.
        { pieza: sinLaPrimera, punto: sies(resta(centroDelFoco, por(lado, FONDO_DE_LA_ESQUIRLA * r))), normal: sies(por(n1, -1)) },
        { pieza: nucleo, punto: sies(centroDelFoco), normal: sies(romper) },
      ]
    }
    case 'espiroidea': {
      // Muy oblicua por omisión: de 55° en adelante, que es lo que la distingue
      // de una oblicua corriente.
      const inclinacion = acotar(receta.inclinacion, INCLINACION_ESPIROIDEA_MINIMA, INCLINACION_MAXIMA)
      return [{ pieza: raiz, ...planoEnElEje(eje, centro, inclinacion, receta.giro) }]
    }
  }
}

/** Cuántos trozos deja la receta: lo que dice la tabla, y es lo que las pruebas comparan. */
export function fragmentosEsperados(receta: RecetaDeFractura): number {
  return grupoAO(receta.grupo)?.fragmentos ?? 0
}

/**
 * Lo que dice el rótulo que el asistente deja sobre el hueso: «42-A2 · Tibia,
 * diáfisis, oblicua · derecho». Lleva el lado porque las dos tibias pueden tener
 * el mismo código, y el texto es también lo que reconoce el rótulo al quitar la
 * fractura. Cabe en los 80 caracteres que admite un rótulo.
 */
export function etiquetaDeLaFractura(receta: Pick<RecetaDeFractura, 'pieza' | 'hueso' | 'segmento' | 'grupo'>): string | null {
  const texto = describirFractura(receta.hueso, receta.segmento, receta.grupo, receta.pieza)
  const lado = huesoDeLaPieza(receta.pieza)?.lado
  return texto ? (lado ? `${texto} · ${lado}` : texto) : null
}

/** El código y la descripción de una receta, para la etiqueta. */
export function codigoDeLaReceta(receta: RecetaDeFractura): string | null {
  return codigoAO(receta.hueso, receta.segmento, receta.grupo, receta.pieza)
}

// ------------------------------------------------- dónde puede caer la porción

/**
 * Los límites, en % del largo del hueso, entre los que se puede mover el centro de
 * una porción en un segmento: dentro del segmento y con la mitad de la extensión
 * a cada lado, para que la fractura no se salga de él. Nunca fuera de lo que
 * `planoDelCorte` admite.
 */
export function limitesDelCentro(
  eje: EjeDelHueso,
  segmentos: SegmentosDelHueso,
  segmento: SegmentoAO,
  extension: number,
): { min: number; max: number } {
  const tramo = segmento === 1 ? segmentos.proximal : segmento === 3 ? segmentos.distal : segmentos.diafisis
  const mitad = extension / 2
  // Los tramos están en metros desde el centro del hueso; `aPorcentaje` espera lo mismo.
  const min = Math.max(POSICION_MINIMA, aPorcentaje(eje, tramo[0]) + mitad)
  const max = Math.min(POSICION_MAXIMA, aPorcentaje(eje, tramo[1]) - mitad)
  // Un segmento más corto que la porción: se queda en su centro, sin intervalo.
  return min <= max ? { min, max } : { min: (min + max) / 2, max: (min + max) / 2 }
}

/** Lleva una receta a lo que el segmento admite: el centro dentro de sus límites. */
export function ajustarAlSegmento(receta: RecetaDeFractura, eje: EjeDelHueso, segmentos: SegmentosDelHueso): RecetaDeFractura {
  const { min, max } = limitesDelCentro(eje, segmentos, receta.segmento, receta.porcion.extension)
  return { ...receta, porcion: { ...receta.porcion, centro: redondear(acotar(receta.porcion.centro, min, max)) } }
}
