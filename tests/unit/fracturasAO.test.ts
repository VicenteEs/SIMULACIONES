import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import {
  GRUPOS_AO,
  HUESOS_AO,
  codigoAO,
  describirFractura,
  gruposDe,
  tiposDe,
} from '@/atlas/clasificacionAO'
import { PIEZAS_FRACTURABLES, huesoDeLaPieza, piezaDelHueso, piezasDelHueso } from '@/atlas/huesosAO'
import {
  EXTENSION_MAXIMA,
  cortesDeLaFractura,
  fragmentosEsperados,
  limitesDelCentro,
  normalizarReceta,
  recetaPorOmision,
  type RecetaDeFractura,
} from '@/atlas/patronesDeFractura'
import { aPorcentaje, dePorcentaje, perfilDeAnchura, segmentoEnQueCae, segmentosDeHeim } from '@/atlas/segmentosAO'
import {
  hojasDe,
  idDeFragmento,
  planosDeUnCorte,
  type CatalogoDelAtlas,
  type CorteDePieza,
} from '@/atlas/formato'
import { partirMalla, partirPorVariosPlanos, type MallaIndexada } from '@/lib/osteotomia'
import { ejeDelHueso, type EjeDelHueso } from '@/lib/planoDeCorte'

/**
 * El asistente «Fractura» (D-161, E4): la tabla AO, los huesos, los segmentos de
 * Heim y los patrones, con la tibia y el fémur del atlas de verdad.
 *
 * Lo que se promete de cada patrón son tres cosas medibles, no un dibujo bonito:
 * cuántos fragmentos deja, que cada uno es un sólido cerrado y que entre todos
 * suman el volumen del hueso.
 */

// ------------------------------------------------------------------ el atlas

const ATLAS = join(process.cwd(), 'public', 'atlas')
const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas
const paquetes = new Map<number, Buffer>()

function leerPieza(id: string): MallaIndexada {
  const pieza = catalogo.piezas.find((p) => p.id === id)!
  if (!paquetes.has(pieza.paquete)) {
    paquetes.set(pieza.paquete, gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[pieza.paquete].archivo))))
  }
  const crudo = paquetes.get(pieza.paquete)!
  const bufer = crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength)
  return {
    posiciones: new Float32Array(new Float32Array(bufer, pieza.pos, pieza.vertices * 3)),
    normales: new Int16Array(new Int16Array(bufer, pieza.nor, pieza.vertices * 3)),
    indices: new Uint32Array(new Uint32Array(bufer, pieza.idx, pieza.indices)),
  }
}

// ------------------------------------------------------------------ medidas

function volumen(malla: MallaIndexada): number {
  const { posiciones: p, indices } = malla
  let v = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    v +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6
  }
  return v
}

/** Cada arista la comparten dos triángulos, soldando por posición a la micra. */
function cerrada(malla: MallaIndexada): boolean {
  const { posiciones: p, indices } = malla
  const micras = (x: number) => Math.round(x * 1e6)
  const clave = (v: number) => `${micras(p[v * 3])},${micras(p[v * 3 + 1])},${micras(p[v * 3 + 2])}`
  const aristas = new Map<string, number>()
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [clave(indices[t]), clave(indices[t + 1]), clave(indices[t + 2])]
    for (let k = 0; k < 3; k += 1) {
      const a = tri[k]
      const b = tri[(k + 1) % 3]
      if (a === b) continue
      const s = a < b ? `${a}|${b}` : `${b}|${a}`
      aristas.set(s, (aristas.get(s) ?? 0) + 1)
    }
  }
  return aristas.size > 0 && [...aristas.values()].every((n) => n === 2)
}

/**
 * Aplica una lista de cortes encadenados a una malla, como hace el visor, y
 * devuelve las hojas del árbol por su identificador.
 */
function aplicar(entera: MallaIndexada, raiz: string, cortes: readonly CorteDePieza[]): Map<string, MallaIndexada> {
  const mallas = new Map<string, MallaIndexada>([[raiz, entera]])
  for (const corte of cortes) {
    const origen = mallas.get(corte.pieza)
    if (!origen) throw new Error(`El corte parte «${corte.pieza}», que no existe todavía.`)
    let a: MallaIndexada
    let b: MallaIndexada
    if (corte.otrosPlanos && corte.otrosPlanos.length > 0) {
      const r = partirPorVariosPlanos(origen, planosDeUnCorte(corte))
      if (!r.dentro || !r.fuera) throw new Error(`El corte de «${corte.pieza}» no atraviesa la pieza.`)
      ;[a, b] = [r.dentro, r.fuera]
    } else {
      const r = partirMalla(origen, { punto: corte.punto, normal: corte.normal })
      ;[a, b] = [r.haciaLaNormal, r.contraLaNormal]
    }
    if (a.indices.length === 0 || b.indices.length === 0) {
      throw new Error(`El corte de «${corte.pieza}» deja un lado vacío.`)
    }
    mallas.delete(corte.pieza)
    mallas.set(idDeFragmento(corte.pieza, 'a'), a)
    mallas.set(idDeFragmento(corte.pieza, 'b'), b)
  }
  return mallas
}

// ----------------------------------------------------------------- la tabla

describe('la tabla AO', () => {
  it('el código se lee hueso, segmento, tipo y grupo', () => {
    expect(codigoAO('tibia', 2, 'A2')).toBe('42-A2')
    expect(codigoAO('femur', 2, 'B2')).toBe('32-B2')
    expect(codigoAO('humero', 2, 'C2')).toBe('12-C2')
    // El radio y el cúbito llevan su letra después del segmento.
    expect(codigoAO('radio', 2, 'A3')).toBe('22R-A3')
    expect(codigoAO('cubito', 2, 'A3')).toBe('22U-A3')
    expect(codigoAO('peroneo', 2, 'A3')).toBe('42F-A3')
  })

  it('no inventa códigos: un grupo que el segmento no admite no tiene', () => {
    // La cuña y la segmentaria son de diáfisis; en la v1 el extremo solo es simple.
    expect(codigoAO('tibia', 1, 'B2')).toBeNull()
    expect(codigoAO('tibia', 3, 'C2')).toBeNull()
    expect(codigoAO('rodilla', 2, 'A2')).toBeNull()
    expect(codigoAO('tibia', 2, 'Z9')).toBeNull()
  })

  it('en la diáfisis hay los tres tipos y en los extremos, solo el simple', () => {
    expect(tiposDe(2).map((t) => t.id)).toEqual(['A', 'B', 'C'])
    expect(tiposDe(1).map((t) => t.id)).toEqual(['A'])
    expect(tiposDe(3).map((t) => t.id)).toEqual(['A'])
  })

  it('los grupos de cada tipo en la diáfisis son los de 2018', () => {
    expect(gruposDe(2, 'A').map((g) => g.id)).toEqual(['A1', 'A2', 'A3'])
    expect(gruposDe(2, 'B').map((g) => g.id)).toEqual(['B2', 'B3'])
    expect(gruposDe(2, 'C').map((g) => g.id)).toEqual(['C2', 'C3'])
    // En un extremo: la oblicua y la transversa; la espiroidea solo en la diáfisis.
    expect(gruposDe(1, 'A').map((g) => g.id)).toEqual(['A2', 'A3'])
  })

  it('la espiroidea se construye, aproximada, y solo en la diáfisis (D-168)', () => {
    const a1 = GRUPOS_AO.find((g) => g.id === 'A1')!
    expect(a1.disponible).toBe(true)
    expect(a1.segmentos).toEqual([2])
    expect(GRUPOS_AO.filter((g) => g.disponible).map((g) => g.id)).toEqual(['A1', 'A2', 'A3', 'B2', 'B3', 'C2', 'C3'])
  })

  it('el código de la clavícula lleva punto («15.2-A2») y los de mano y pie se avisan provisionales', () => {
    expect(codigoAO('clavicula', 2, 'A2')).toBe('15.2-A2')
    expect(codigoAO('clavicula', 1, 'A3')).toBe('15.1-A3')
    expect(describirFractura('clavicula', 3, 'A2')).toBe('15.3-A2 · Clavícula, lateral, oblicua')
    expect(describirFractura('metacarpiano', 2, 'A3')).toBe('72M-A3 · Metacarpiano, diáfisis, transversa')
    expect(HUESOS_AO.filter((h) => h.provisional).map((h) => h.id)).toEqual([
      'metacarpiano',
      'falange_mano',
      'metatarsiano',
      'falange_pie',
    ])
    // Los de siempre conservan su código.
    expect(codigoAO('radio', 2, 'A3')).toBe('22R-A3')
    expect(codigoAO('humero', 2, 'B2')).toBe('12-B2')
  })

  it('la etiqueta dice el código y qué es, en palabras', () => {
    expect(describirFractura('tibia', 2, 'A2')).toBe('42-A2 · Tibia, diáfisis, oblicua')
    expect(describirFractura('femur', 2, 'C3')).toBe('32-C3 · Fémur, diáfisis, segmentaria fragmentada')
    expect(describirFractura('tibia', 1, 'B2')).toBeNull()
  })
})

describe('los huesos y las piezas del atlas', () => {
  it('cada identificador de la tabla existe en el catálogo y se llama como el hueso', () => {
    const nombres: Record<string, RegExp> = {
      humero: /^(Left |Right )?humerus$/i,
      radio: /^(Left |Right )?radius$/i,
      cubito: /^(Left |Right )?ulna$/i,
      femur: /^(Left |Right )?femur$/i,
      tibia: /^(Left |Right )?tibia$/i,
      peroneo: /^(Left |Right )?fibula$/i,
      clavicula: /^(Left |Right )?clavicle$/i,
      metacarpiano: /^(Left |Right )(first|second|third|fourth|fifth) metacarpal bone$/i,
      metatarsiano: /^(Left |Right )(first|second|third|fourth|fifth) metatarsal bone$/i,
      falange_mano: /^(Proximal|Middle|Distal) phalanx of (left|right) (thumb|index finger|middle finger|ring finger|little finger)$/i,
      falange_pie: /^(Proximal|Middle|Distal) phalanx of (left|right) (big toe|second toe|third toe|fourth toe|little toe)$/i,
    }
    for (const hueso of HUESOS_AO) {
      for (const lado of ['derecho', 'izquierdo'] as const) {
        const ids = piezasDelHueso(hueso.id, lado)
        expect(ids.length, `${hueso.nombre} ${lado}`).toBeGreaterThan(0)
        for (const id of ids) {
          const pieza = catalogo.piezas.find((p) => p.id === id)
          expect(pieza, `${hueso.nombre} ${lado} (${id})`).toBeDefined()
          expect(pieza!.nombre, id).toMatch(nombres[hueso.id])
          expect(pieza!.sistema, id).toBe('skeletal')
          // Y el lado coincide con lo que dice el nombre, para los que lo traen.
          expect(/\bright\b/i.test(pieza!.nombre) ? 'derecho' : /\bleft\b/i.test(pieza!.nombre) ? 'izquierdo' : lado, id).toBe(lado)
        }
        // El derecho del paciente está en x negativa: con la media de las cajas de todas sus piezas.
        const xs = ids.map((id) => {
          const p = catalogo.piezas.find((q) => q.id === id)!
          return (p.caja[0][0] + p.caja[1][0]) / 2
        })
        const media = xs.reduce((a, b) => a + b, 0) / xs.length
        expect(lado === 'derecho' ? media < 0 : media > 0, `${hueso.nombre} del lado ${lado}`).toBe(true)
      }
    }
    // piezaDelHueso sigue entregando la primera: es lo que usaban las pruebas de los huesos largos.
    expect(piezaDelHueso('tibia', 'derecho')).toBe('FJ3387')
  })

  it('once huesos por dos lados, sin repetir ninguna pieza', () => {
    expect(HUESOS_AO).toHaveLength(11)
    const total = HUESOS_AO.reduce(
      (n, h) => n + piezasDelHueso(h.id, 'derecho').length + piezasDelHueso(h.id, 'izquierdo').length,
      0,
    )
    // 6 largos y la clavícula (14) + 10 metacarpianos + 10 metatarsianos + 28 falanges de la mano + 28 del pie.
    expect(total).toBe(90)
    // Con el mapa del mismo tamaño no se repite ningún identificador.
    expect(PIEZAS_FRACTURABLES.size).toBe(total)
  })

  it('de cualquiera de las falanges y metacarpianos sale su hueso y su lado', () => {
    expect(huesoDeLaPieza('FJ3350')).toEqual({ hueso: 'metacarpiano', lado: 'derecho' })
    expect(huesoDeLaPieza('FJ3252#a')).toEqual({ hueso: 'metacarpiano', lado: 'izquierdo' })
    expect(huesoDeLaPieza('FJ3318')).toEqual({ hueso: 'falange_mano', lado: 'izquierdo' })
    expect(huesoDeLaPieza('FJ3310')).toEqual({ hueso: 'falange_pie', lado: 'derecho' })
    expect(huesoDeLaPieza('FJ3362')).toEqual({ hueso: 'clavicula', lado: 'derecho' })
    // Rótula, escápula, astrágalo y calcáneo siguen fuera: se revisan con el traumatólogo.
    for (const fuera of ['FJ3381', 'FJ3275', 'FJ3384', 'FJ3385', 'FJ3360']) expect(huesoDeLaPieza(fuera)).toBeNull()
  })

  it('de un fragmento sale el hueso de su pieza', () => {
    expect(huesoDeLaPieza('FJ3387')).toEqual({ hueso: 'tibia', lado: 'derecho' })
    expect(huesoDeLaPieza('FJ3387#a#b')).toEqual({ hueso: 'tibia', lado: 'derecho' })
    expect(huesoDeLaPieza('FJ0000')).toBeNull()
  })
})

// ------------------------------------------------------------------- Heim

describe('los segmentos por la regla del cuadrado de Heim', () => {
  for (const [nombre, id] of [
    ['la tibia derecha', 'FJ3387'],
    ['el fémur derecho', 'FJ3365'],
    ['el húmero derecho', 'FJ3368'],
  ] as const) {
    describe(nombre, () => {
      const malla = leerPieza(id)
      const eje = ejeDelHueso(malla.posiciones, malla.indices)!
      const s = segmentosDeHeim(malla.posiciones, eje)
      const largo = eje.distal - eje.proximal

      it('los tres segmentos se siguen sin huecos ni solapes y cubren el hueso', () => {
        expect(s.proximal[0]).toBeCloseTo(eje.proximal, 9)
        expect(s.proximal[1]).toBeCloseTo(s.diafisis[0], 9)
        expect(s.diafisis[1]).toBeCloseTo(s.distal[0], 9)
        expect(s.distal[1]).toBeCloseTo(eje.distal, 9)
      })

      it('cada extremo mide entre el 8 y el 33 % del hueso, y la diáfisis es lo que queda, la mayor parte', () => {
        for (const lado of [s.ladoProximal, s.ladoDistal]) {
          expect(lado / largo).toBeGreaterThanOrEqual(0.08 - 1e-9)
          expect(lado / largo).toBeLessThanOrEqual(1 / 3 + 1e-9)
        }
        expect((s.diafisis[1] - s.diafisis[0]) / largo).toBeGreaterThan(0.2)
      })

      it('el lado del cuadrado es lo más ancho de su epífisis, o el tope', () => {
        const perfil = perfilDeAnchura(malla.posiciones, eje)
        const zona = Math.round(perfil.length / 3)
        const masAncho = Math.max(...perfil.slice(0, zona))
        expect(s.ladoProximal).toBeLessThanOrEqual(Math.max(masAncho, 0.08 * largo) + 1e-9)
      })

      it('la mitad del hueso cae en la diáfisis, y los extremos en su segmento', () => {
        const medio = (s.diafisis[0] + s.diafisis[1]) / 2
        expect(segmentoEnQueCae(medio, s)).toBe(2)
        expect(segmentoEnQueCae(s.proximal[0] + 1e-6, s)).toBe(1)
        expect(segmentoEnQueCae(s.distal[1] - 1e-6, s)).toBe(3)
      })
    })
  }

  it('el porcentaje y la coordenada son inversos', () => {
    const eje = ejeDelHueso(leerPieza('FJ3387').posiciones, leerPieza('FJ3387').indices)!
    expect(aPorcentaje(eje, eje.proximal)).toBeCloseTo(0, 9)
    expect(aPorcentaje(eje, eje.distal)).toBeCloseTo(100, 9)
    expect(dePorcentaje(eje, aPorcentaje(eje, 0.012))).toBeCloseTo(0.012, 9)
  })
})

// ------------------------------------------------------------- las recetas

describe('una receta que llega de fuera', () => {
  const buena = recetaPorOmision('FJ3387', 'tibia', 2, 'A2')

  it('una receta bien formada se deja pasar', () => {
    expect(normalizarReceta(buena)).toEqual(buena)
  })

  it('los números fuera de rango se acotan, y lo que no es una fractura se rechaza', () => {
    const limpia = normalizarReceta({ ...buena, porcion: { centro: 120, extension: 99 }, inclinacion: 90, giro: -90 })!
    expect(limpia.porcion.centro).toBe(95)
    expect(limpia.porcion.extension).toBe(EXTENSION_MAXIMA)
    expect(limpia.inclinacion).toBe(60)
    expect(limpia.giro).toBe(270)
    for (const mala of [
      null,
      'tibia',
      { ...buena, pieza: 'con espacios' },
      { ...buena, hueso: 'rodilla' },
      { ...buena, grupo: 'Z9' },
      { ...buena, grupo: 'A1', segmento: 1 }, // la espiroidea no se ofrece en un extremo
      { ...buena, segmento: 1, grupo: 'B2' }, // la cuña no se ofrece en un extremo
      { ...buena, porcion: null },
      { ...buena, inclinacion: Number.NaN },
    ]) {
      expect(normalizarReceta(mala), JSON.stringify(mala)).toBeNull()
    }
  })

  it('la semilla es un entero pequeño y estable', () => {
    expect(normalizarReceta({ ...buena, semilla: 12.9 })!.semilla).toBe(12)
    expect(normalizarReceta({ ...buena, semilla: -3 })!.semilla).toBe(3)
    expect(normalizarReceta({ ...buena, semilla: 'x' })!.semilla).toBe(1)
  })

  it('cada grupo disponible nace con una receta que él mismo acepta', () => {
    for (const grupo of GRUPOS_AO.filter((g) => g.disponible)) {
      const segmento = grupo.segmentos.includes(2) ? 2 : grupo.segmentos[0]
      const receta = recetaPorOmision('FJ3387', 'tibia', segmento, grupo.id)
      expect(normalizarReceta(receta), grupo.id).toEqual(receta)
    }
  })
})

// -------------------------------------------------------------- los patrones

describe('los patrones de fractura sobre los huesos del atlas', () => {
  const casos = [
    ['la tibia derecha', 'FJ3387', 'tibia'],
    ['el fémur derecho', 'FJ3365', 'femur'],
    ['el húmero derecho', 'FJ3368', 'humero'],
    ['el radio derecho', 'FJ3349', 'radio'],
    ['el cúbito derecho', 'FJ3391', 'cubito'],
    ['el peroné derecho', 'FJ3366', 'peroneo'],
    ['la tibia izquierda', 'FJ3282', 'tibia'],
    // Los huesos pequeños (D-168): la misma tabla, con huesos de un centímetro.
    ['la clavícula derecha', 'FJ3362', 'clavicula'],
    ['el primer metacarpiano derecho', 'FJ3350', 'metacarpiano'],
    ['el tercer metatarsiano izquierdo', 'FJ3247', 'metatarsiano'],
    ['la falange proximal del índice derecho', 'FJ3322', 'falange_mano'],
    ['la falange distal del pulgar derecho', 'FJ3198', 'falange_mano'],
    ['la falange proximal del tercer dedo del pie derecho', 'FJ3320', 'falange_pie'],
  ] as const

  for (const [nombre, id, hueso] of casos) {
    describe(nombre, () => {
      const entera = leerPieza(id)
      const eje: EjeDelHueso = ejeDelHueso(entera.posiciones, entera.indices)!
      const volumenTotal = volumen(entera)

      const grupos = GRUPOS_AO.filter((g) => g.disponible && g.segmentos.includes(2))
      it.each(grupos.map((g) => [g.id, g.nombre, g.fragmentos] as const))(
        '%s (%s) deja %i fragmentos cerrados que suman el hueso',
        (grupo, _nombre, esperados) => {
          // La semilla cambia dónde cae el corte de dentro de la cuña fragmentada: con
          // la 7 de los huesos largos, una falange de 40 mm deja la cuña fuera del
          // plano. Para los pequeños se usa la de siempre, la 1, que es también la
          // de `SABIDO_QUE_NO_SALE`.
          const grande = ['humero', 'radio', 'cubito', 'femur', 'tibia', 'peroneo'].includes(hueso)
          const receta: RecetaDeFractura = { ...recetaPorOmision(id, hueso, 2, grupo), semilla: grande ? 7 : 1 }
          expect(fragmentosEsperados(receta)).toBe(esperados)
          const cortes = cortesDeLaFractura(receta, eje)
          expect(cortes.length).toBeGreaterThan(0)

          const hojas = aplicar(entera, id, cortes)
          expect(hojas.size).toBe(esperados)
          // Las hojas que dice el formato son las mismas que salieron de partir.
          expect([...hojas.keys()].sort()).toEqual(hojasDe(cortes, id).sort())

          let suma = 0
          for (const [clave, malla] of hojas) {
            expect(cerrada(malla), `«${clave}» cerrada`).toBe(true)
            const v = volumen(malla)
            expect(v, `«${clave}» con volumen`).toBeGreaterThan(0)
            suma += v
          }
          // Los cortes no pierden ni inventan hueso: ±1 %.
          expect(suma / volumenTotal).toBeGreaterThan(0.99)
          expect(suma / volumenTotal).toBeLessThan(1.01)
        },
      )

      it('el mismo hueso y la misma receta dan los mismos cortes: es determinista', () => {
        const receta = { ...recetaPorOmision(id, hueso, 2, 'C3'), semilla: 99 }
        expect(cortesDeLaFractura(receta, eje)).toEqual(cortesDeLaFractura(receta, eje))
        // Otra semilla, otros detalles del corte de dentro; los mismos fragmentos.
        const otra = cortesDeLaFractura({ ...receta, semilla: 100 }, eje)
        expect(otra).toHaveLength(3)
        expect(otra[2]).not.toEqual(cortesDeLaFractura(receta, eje)[2])
      })

      it('la oblicua se inclina de verdad, y la transversa, casi nada', () => {
        const oblicua = cortesDeLaFractura(recetaPorOmision(id, hueso, 2, 'A2'), eje)[0]
        const transversa = cortesDeLaFractura(recetaPorOmision(id, hueso, 2, 'A3'), eje)[0]
        const angulo = (n: readonly number[]) => {
          const cos = n[0] * eje.direccion[0] + n[1] * eje.direccion[1] + n[2] * eje.direccion[2]
          return (Math.acos(Math.min(1, cos)) * 180) / Math.PI
        }
        expect(angulo(oblicua.normal)).toBeGreaterThanOrEqual(30 - 1e-6)
        expect(angulo(transversa.normal)).toBeLessThanOrEqual(15 + 1e-6)
      })

      it('la segmentaria ocupa la extensión que se pidió', () => {
        const receta = { ...recetaPorOmision(id, hueso, 2, 'C2'), porcion: { centro: 50, extension: 20 } }
        const [arriba, abajo] = cortesDeLaFractura(receta, eje)
        const largo = eje.distal - eje.proximal
        const separacion =
          (abajo.punto[0] - arriba.punto[0]) * eje.direccion[0] +
          (abajo.punto[1] - arriba.punto[1]) * eje.direccion[1] +
          (abajo.punto[2] - arriba.punto[2]) * eje.direccion[2]
        expect(separacion / largo).toBeCloseTo(0.2, 2)
      })
    })
  }

  it('A3 y A2 también funcionan en los extremos, dentro de su segmento', () => {
    const entera = leerPieza('FJ3387')
    const eje = ejeDelHueso(entera.posiciones, entera.indices)!
    const segmentos = segmentosDeHeim(entera.posiciones, eje)
    for (const segmento of [1, 3] as const) {
      for (const grupo of ['A2', 'A3'] as const) {
        const base = recetaPorOmision('FJ3387', 'tibia', segmento, grupo, { eje, segmentos })
        const { min, max } = limitesDelCentro(eje, segmentos, segmento, base.porcion.extension)
        expect(base.porcion.centro).toBeGreaterThanOrEqual(min - 1e-9)
        expect(base.porcion.centro).toBeLessThanOrEqual(max + 1e-9)
        const hojas = aplicar(entera, 'FJ3387', cortesDeLaFractura(base, eje))
        expect(hojas.size).toBe(2)
        for (const malla of hojas.values()) expect(cerrada(malla)).toBe(true)
      }
    }
  })

  it('la espiroidea es un solo plano muy oblicuo, nunca menos de 55°', () => {
    const entera = leerPieza('FJ3387')
    const eje = ejeDelHueso(entera.posiciones, entera.indices)!
    const receta = recetaPorOmision('FJ3387', 'tibia', 2, 'A1')
    expect(receta.inclinacion).toBe(60)
    const cortes = cortesDeLaFractura(receta, eje)
    expect(cortes).toHaveLength(1)
    // Una receta que pide menos se sube: si no, sería una oblicua con otro nombre.
    const floja = cortesDeLaFractura({ ...receta, inclinacion: 20 }, eje)
    const grados = (c: (typeof cortes)[number]) =>
      (Math.acos(Math.abs(c.normal[0] * eje.direccion[0] + c.normal[1] * eje.direccion[1] + c.normal[2] * eje.direccion[2])) * 180) / Math.PI
    expect(grados(floja[0])).toBeGreaterThanOrEqual(54.9)
    expect(grados(cortes[0])).toBeGreaterThan(grados(cortesDeLaFractura(recetaPorOmision('FJ3387', 'tibia', 2, 'A2'), eje)[0]))
  })

  it('el centro se limita al segmento, con la mitad de la extensión a cada lado', () => {
    const entera = leerPieza('FJ3387')
    const eje = ejeDelHueso(entera.posiciones, entera.indices)!
    const segmentos = segmentosDeHeim(entera.posiciones, eje)
    const { min, max } = limitesDelCentro(eje, segmentos, 2, 20)
    expect(min).toBeCloseTo(aPorcentaje(eje, segmentos.diafisis[0]) + 10, 6)
    expect(max).toBeCloseTo(aPorcentaje(eje, segmentos.diafisis[1]) - 10, 6)
    expect(min).toBeLessThan(max)
  })
})


// ------------------------------------------------- todas las piezas, una por una

/**
 * Lo que se sabe que no sale bien, pieza por pieza (E4-Q1, D-168).
 *
 * Con las 90 piezas del asistente se comprobó cada patrón: casi todos salen en
 * tres fragmentos cerrados que suman el hueso. En unas pocas falanges y huesos
 * del pie —de 30 mm, con cortes de 4 mm de grosor— el patrón sale con la malla
 * abierta por algún sitio (`abierta`) o el plano no llega a cortar (`error`).
 * No se esconde: queda escrito aquí, y la prueba falla tanto si algo nuevo se
 * rompe como si algo viejo se arregla, para que la lista no mienta en ningún
 * sentido. La pantalla lo dice en la nota del hueso (`HuesoDeLaTabla.nota`).
 */
const SABIDO_QUE_NO_SALE: Record<string, string> = {
  FJ3240: 'C3|abierta',
  FJ3250: 'C2|abierta,C3|abierta',
  FJ3327: 'B2|abierta,B3|abierta',
  FJ3326: 'B3|error',
  FJ3323: 'B3|error',
  FJ3306: 'B3|error',
  FJ3292: 'B3|error',
  FJ3316: 'B3|error',
  FJ3299: 'B3|error',
  FJ3291: 'B3|error',
  FJ3187: 'B3|abierta',
  FJ3310: 'B2|abierta,B3|abierta,C3|abierta',
  FJ3324: 'C3|abierta',
  FJ3301: 'C2|abierta,C3|abierta',
  FJ3305: 'B3|abierta,C3|abierta',
  FJ3191: 'C3|abierta',
  FJ3329: 'B3|abierta',
  FJ3328: 'B2|abierta,B3|abierta,C3|abierta',
  FJ3312: 'C3|abierta',
  FJ3293: 'C3|abierta',
  FJ3298: 'B2|abierta,B3|abierta,C3|abierta',
  FJ3182: 'C3|abierta',
  FJ3180: 'C2|abierta,C3|abierta',
  FJ3185: 'C3|abierta',
}

describe('todas las piezas que el asistente sabe fracturar', () => {
  it('cada patrón de la diáfisis sale bien en cada pieza, salvo lo que está escrito arriba', () => {
    const encontrado: Record<string, string> = {}
    for (const [id, { hueso }] of PIEZAS_FRACTURABLES) {
      const entera = leerPieza(id)
      const eje = ejeDelHueso(entera.posiciones, entera.indices)
      expect(eje, `${id} tiene eje`).not.toBeNull()
      const fallos: string[] = []
      for (const grupo of GRUPOS_AO.filter((g) => g.disponible && g.segmentos.includes(2))) {
        try {
          const receta = recetaPorOmision(id, hueso, 2, grupo.id)
          const hojas = aplicar(entera, id, cortesDeLaFractura(receta, eje!))
          if (hojas.size !== grupo.fragmentos) fallos.push(`${grupo.id}|${hojas.size}`)
          else if (![...hojas.values()].every(cerrada)) fallos.push(`${grupo.id}|abierta`)
        } catch {
          fallos.push(`${grupo.id}|error`)
        }
      }
      if (fallos.length > 0) encontrado[id] = fallos.join(',')
    }
    expect(encontrado).toEqual(SABIDO_QUE_NO_SALE)
    // Con la cobertura medida es unas diez veces más lenta: los 5 s de siempre no alcanzan.
  }, 120_000)
})
