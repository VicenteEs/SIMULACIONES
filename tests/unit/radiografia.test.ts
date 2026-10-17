import { describe, expect, it } from 'vitest'
import {
  AJUSTES_DE_LA_IMAGEN_POR_OMISION,
  ANGULO_DE_LA_PROYECCION,
  BRILLO_MAXIMO,
  CONTRASTE_MAXIMO,
  CONTRASTE_MINIMO,
  FACTOR_DE_LA_TOMA,
  FILTROS_DE_FLUOROSCOPIA,
  KV_INICIAL,
  KV_MAXIMO,
  KV_MINIMO,
  aFluoroscopia,
  aporteDeLaSuperficie,
  claridadDeLaMateria,
  densidadDelPapel,
  densidadDelSistema,
  DENSIDAD_POR_SISTEMA,
  factorDeKv,
  limitarAjustes,
  PROYECCIONES_DE_FLUOROSCOPIA,
} from '@/lib/radiografia'

/**
 * Radiografía y fluoroscopia: la misma física mostrada al revés.
 *
 * Lo que se fija aquí es lo que el traumatólogo corrigió: en la radiografía el
 * hueso es lo más blanco y no se ven vasos ni nervios; en la fluoroscopia lo más
 * denso es lo más negro, dentro de un círculo.
 */
describe('densidades', () => {
  it('el hueso es lo más denso del cuerpo y el pulmón lo menos', () => {
    const valores = Object.values(DENSIDAD_POR_SISTEMA).filter((v): v is number => v !== null)
    expect(Math.max(...valores)).toBe(DENSIDAD_POR_SISTEMA.skeletal)
    expect(Math.min(...valores)).toBe(DENSIDAD_POR_SISTEMA.respiratory)
  })

  it('los vasos, los nervios y los linfáticos no se ven', () => {
    for (const sistema of ['arterial', 'venous', 'nervous', 'lymphatic']) {
      expect(densidadDelSistema(sistema), sistema).toBeNull()
    }
  })

  it('un sistema que no se conoce se trata como tejido blando, ni invisible ni hueso', () => {
    const d = densidadDelSistema('inventado')
    expect(d).not.toBeNull()
    expect(d as number).toBeGreaterThan(0.1)
    expect(d as number).toBeLessThan(0.5)
  })

  it('en el simulador el metal absorbe más que el hueso, y el hueso más que lo blando', () => {
    expect(densidadDelPapel('implante')).toBeGreaterThan(densidadDelPapel('hueso'))
    expect(densidadDelPapel('hueso')).toBeGreaterThan(densidadDelPapel('musculo'))
    expect(densidadDelPapel('musculo')).toBeGreaterThan(densidadDelPapel('piel'))
    expect(densidadDelPapel('fragmento')).toBe(densidadDelPapel('hueso'))
  })

  it('una superficie rasante suma más que una de frente, y más densidad suma más', () => {
    expect(aporteDeLaSuperficie(1, 1)).toBeGreaterThan(aporteDeLaSuperficie(1, 0))
    expect(aporteDeLaSuperficie(1, 0.5)).toBeGreaterThan(aporteDeLaSuperficie(0.3, 0.5))
    expect(aporteDeLaSuperficie(0, 1)).toBe(0)
    // Un valor fuera de rango no se sale de la curva.
    expect(aporteDeLaSuperficie(1, 5)).toBe(aporteDeLaSuperficie(1, 1))
    expect(aporteDeLaSuperficie(1, -2)).toBe(aporteDeLaSuperficie(1, 0))
  })
})

describe('aFluoroscopia', () => {
  const ancho = 64
  const alto = 64
  const rellenar = (r: number, g: number, b: number) => {
    const p = new Uint8ClampedArray(ancho * alto * 4)
    for (let i = 0; i < ancho * alto; i++) {
      p[i * 4] = r
      p[i * 4 + 1] = g
      p[i * 4 + 2] = b
      p[i * 4 + 3] = 255
    }
    return p
  }
  const en = (img: Uint8ClampedArray, x: number, y: number) => img[(y * ancho + x) * 4]

  it('recorta un círculo: las esquinas son negras', () => {
    const img = aFluoroscopia(rellenar(0, 0, 0), ancho, alto, { ruido: 0 })
    expect(en(img, 0, 0)).toBe(0)
    expect(en(img, ancho - 1, alto - 1)).toBe(0)
    expect(en(img, ancho / 2, alto / 2)).toBeGreaterThan(150)
  })

  it('sin materia el fondo es gris claro, y lo denso sale oscuro (el negativo de la radiografía)', () => {
    const vacio = aFluoroscopia(rellenar(0, 0, 0), ancho, alto, { ruido: 0 })
    const hueso = aFluoroscopia(rellenar(255, 255, 255), ancho, alto, { ruido: 0 })
    const centro = (img: Uint8ClampedArray) => en(img, ancho / 2, alto / 2)
    expect(centro(vacio)).toBeGreaterThan(190)
    expect(centro(hueso)).toBeLessThan(60)
    expect(centro(hueso)).toBeLessThan(centro(vacio))
  })

  it('los grises intermedios quedan entre los dos extremos', () => {
    const medio = aFluoroscopia(rellenar(110, 110, 110), ancho, alto, { ruido: 0 })
    const v = en(medio, ancho / 2, alto / 2)
    expect(v).toBeGreaterThan(60)
    expect(v).toBeLessThan(190)
  })

  it('la fila de abajo de lo que entrega WebGL queda abajo en la imagen', () => {
    // Fila 0 de WebGL (abajo) con materia, el resto vacío: en la imagen, la materia debe verse abajo.
    const p = rellenar(0, 0, 0)
    for (let x = 0; x < ancho; x++) {
      const i = (0 * ancho + x) * 4
      p[i] = p[i + 1] = p[i + 2] = 255
    }
    const img = aFluoroscopia(p, ancho, alto, { ruido: 0 })
    // Cerca del centro horizontal y casi en el borde inferior, que sigue dentro del círculo.
    const abajo = en(img, ancho / 2, alto - 2)
    const arriba = en(img, ancho / 2, 2)
    expect(abajo).toBeLessThan(arriba)
  })

  it('el ruido es repetible con la misma semilla y cambia con otra', () => {
    const a = aFluoroscopia(rellenar(60, 60, 60), ancho, alto, { ruido: 1, semilla: 3 })
    const b = aFluoroscopia(rellenar(60, 60, 60), ancho, alto, { ruido: 1, semilla: 3 })
    const c = aFluoroscopia(rellenar(60, 60, 60), ancho, alto, { ruido: 1, semilla: 4 })
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
  })
})

describe('los ajustes de la imagen (P-003, E2)', () => {
  const lado = 64
  const centro = lado / 2
  /** Una toma lisa de un solo tono. */
  const plana = (v: number) => {
    const p = new Uint8ClampedArray(lado * lado * 4)
    for (let i = 0; i < lado * lado; i++) p.set([v, v, v, 255], i * 4)
    return p
  }
  /** La mitad izquierda con un tono y la derecha con otro: un borde recto en el medio. */
  const conBorde = (izquierda: number, derecha: number) => {
    const p = new Uint8ClampedArray(lado * lado * 4)
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const v = x < lado / 2 ? izquierda : derecha
        p.set([v, v, v, 255], (y * lado + x) * 4)
      }
    }
    return p
  }
  const valor = (img: Uint8ClampedArray, x = centro, y = centro) => img[(y * lado + x) * 4]
  const sinRuido = { ruido: 0 }

  it('con los ajustes de siempre la imagen es la de antes', () => {
    // 70 kV, contraste 1, brillo 0 y sin filtro: pasar los ajustes por omisión no cambia ni un píxel.
    const base = aFluoroscopia(plana(110), lado, lado, sinRuido)
    const explicitos = aFluoroscopia(plana(110), lado, lado, { ...sinRuido, ...AJUSTES_DE_LA_IMAGEN_POR_OMISION })
    expect(Array.from(explicitos)).toEqual(Array.from(base))
    // Y la toma a media ganancia revelada con el factor de la toma es la de ganancia entera.
    const mitad = aFluoroscopia(plana(55), lado, lado, { ...sinRuido, ganancia: FACTOR_DE_LA_TOMA })
    const entera = aFluoroscopia(plana(110), lado, lado, { ...sinRuido, ganancia: 1 })
    expect(Math.abs(valor(mitad) - valor(entera))).toBeLessThanOrEqual(1)
  })

  it('más materia nunca sale más clara, sean cuales sean los ajustes (respeta las densidades)', () => {
    // La propiedad que importa: cambiar los mandos reparte los grises de otra manera, pero no invierte el orden.
    for (const kv of [KV_MINIMO, 60, KV_INICIAL, 90, KV_MAXIMO]) {
      for (const contraste of [CONTRASTE_MINIMO, 1, CONTRASTE_MAXIMO]) {
        for (const brillo of [-BRILLO_MAXIMO, 0, BRILLO_MAXIMO]) {
          let anterior = Infinity
          for (let crudo = 0; crudo <= 1; crudo += 0.05) {
            const c = claridadDeLaMateria(crudo, FACTOR_DE_LA_TOMA, { kv, contraste, brillo, filtro: 'ninguno' })
            expect(c, `kv ${kv} · contraste ${contraste} · brillo ${brillo} · crudo ${crudo.toFixed(2)}`).toBeLessThanOrEqual(anterior + 1e-9)
            anterior = c
          }
        }
      }
    }
  })

  it('con pocos kilovoltios todo se ve más opaco y con muchos, más penetrado', () => {
    const en = (kv: number) => valor(aFluoroscopia(plana(60), lado, lado, { ...sinRuido, ganancia: FACTOR_DE_LA_TOMA, kv }))
    expect(en(KV_MINIMO)).toBeLessThan(en(KV_INICIAL))
    expect(en(KV_INICIAL)).toBeLessThan(en(KV_MAXIMO))
  })

  it('con muchos kilovoltios se distingue lo que con pocos se confunde', () => {
    // Dos materias densas, 0,55 y 0,75 de la toma. A 50 kV las dos pasan del tope y salen igual de negras; a 120 kV
    // cada una sale con su gris. Es lo que un arco enseña al subir la penetración: lo que hay dentro del hueso.
    const separacion = (kv: number) => {
      const poco = valor(aFluoroscopia(plana(140), lado, lado, { ...sinRuido, ganancia: FACTOR_DE_LA_TOMA, kv }))
      const mucho = valor(aFluoroscopia(plana(191), lado, lado, { ...sinRuido, ganancia: FACTOR_DE_LA_TOMA, kv }))
      return poco - mucho
    }
    expect(separacion(KV_MINIMO)).toBe(0)
    expect(separacion(KV_MAXIMO)).toBeGreaterThan(15)
  })

  it('el contraste separa los grises y el brillo los sube o los baja', () => {
    const dos = (contraste: number, brillo = 0) => {
      const a = valor(aFluoroscopia(plana(102), lado, lado, { ...sinRuido, contraste, brillo })) // materia 0,4
      const b = valor(aFluoroscopia(plana(153), lado, lado, { ...sinRuido, contraste, brillo })) // materia 0,6
      return { a, b, diferencia: a - b }
    }
    expect(dos(2).diferencia).toBeGreaterThan(dos(1).diferencia)
    expect(dos(CONTRASTE_MINIMO).diferencia).toBeLessThan(dos(1).diferencia)
    expect(dos(1, 0.2).a).toBeGreaterThan(dos(1, 0).a)
    expect(dos(1, -0.2).a).toBeLessThan(dos(1, 0).a)
  })

  it('el positivo invierte la imagen: lo denso, blanco, y el vacío, negro', () => {
    const neg = (v: number) => valor(aFluoroscopia(plana(v), lado, lado, { ...sinRuido, filtro: 'ninguno' }))
    const pos = (v: number) => valor(aFluoroscopia(plana(v), lado, lado, { ...sinRuido, filtro: 'positivo' }))
    expect(pos(255)).toBeGreaterThan(pos(0))
    expect(pos(255)).toBeGreaterThan(190)
    expect(pos(0)).toBeLessThan(60)
    // Y es exactamente el reverso del negativo en el mismo punto.
    expect(neg(255) + pos(255)).toBeGreaterThan(200)
    expect(neg(0)).toBeGreaterThan(neg(255))
  })

  it('realzar bordes no toca lo liso y hace saltar el contorno', () => {
    const liso = aFluoroscopia(plana(110), lado, lado, { ...sinRuido, filtro: 'bordes' })
    const lisoSin = aFluoroscopia(plana(110), lado, lado, sinRuido)
    expect(valor(liso)).toBe(valor(lisoSin))

    // A la izquierda hay poca materia (se ve clara) y a la derecha mucha (se ve oscura): el salto entre los dos píxeles
    // pegados al borde es mayor con el realce, que aclara el lado claro y oscurece el oscuro.
    const sin = aFluoroscopia(conBorde(60, 200), lado, lado, sinRuido)
    const con = aFluoroscopia(conBorde(60, 200), lado, lado, { ...sinRuido, filtro: 'bordes' })
    const x = lado / 2
    const salto = (img: Uint8ClampedArray) => valor(img, x - 1) - valor(img, x)
    expect(salto(con)).toBeGreaterThan(salto(sin))
    // Lejos del borde no cambia.
    expect(valor(con, 8)).toBe(valor(sin, 8))
    expect(valor(con, lado - 9)).toBe(valor(sin, lado - 9))
  })

  it('el círculo recorta con cualquier filtro', () => {
    for (const filtro of ['ninguno', 'bordes', 'positivo'] as const) {
      const img = aFluoroscopia(plana(200), lado, lado, { ...sinRuido, filtro })
      expect(valor(img, 0, 0), filtro).toBe(0)
      expect(valor(img, lado - 1, lado - 1), filtro).toBe(0)
    }
  })

  it('lo que no es válido vuelve al valor de siempre y lo demás se recorta', () => {
    expect(limitarAjustes(null)).toEqual(AJUSTES_DE_LA_IMAGEN_POR_OMISION)
    expect(limitarAjustes({ kv: Number.NaN, contraste: Infinity, brillo: 'mucho' as unknown as number, filtro: 'inventado' as never })).toEqual(
      AJUSTES_DE_LA_IMAGEN_POR_OMISION,
    )
    expect(limitarAjustes({ kv: 10, contraste: 9, brillo: -5 })).toEqual({
      kv: KV_MINIMO,
      contraste: CONTRASTE_MAXIMO,
      brillo: -BRILLO_MAXIMO,
      filtro: 'ninguno',
    })
    expect(limitarAjustes({ kv: 999 }).kv).toBe(KV_MAXIMO)
    expect(limitarAjustes({ filtro: 'bordes' }).filtro).toBe('bordes')
  })

  it('los tres filtros están declarados, con su ayuda', () => {
    expect(FILTROS_DE_FLUOROSCOPIA.map((f) => f.valor)).toEqual(['ninguno', 'bordes', 'positivo'])
    for (const f of FILTROS_DE_FLUOROSCOPIA) expect(f.ayuda.length, f.valor).toBeGreaterThan(10)
  })

  it('los kilovoltios de siempre no cambian nada y los extremos cambian en el sentido que dicen', () => {
    expect(factorDeKv(KV_INICIAL)).toBe(1)
    expect(factorDeKv(KV_MINIMO)).toBeGreaterThan(1)
    expect(factorDeKv(KV_MAXIMO)).toBeLessThan(1)
    expect(factorDeKv(Number.NaN)).toBe(1)
  })
})

describe('las tres proyecciones del arco', () => {
  it('son AP, lateral y oblicua, de frente a de lado', () => {
    expect(PROYECCIONES_DE_FLUOROSCOPIA.map((p) => p.valor)).toEqual(['ap', 'lateral', 'oblicua'])
    expect(ANGULO_DE_LA_PROYECCION.ap).toBe(0)
    expect(ANGULO_DE_LA_PROYECCION.lateral).toBe(90)
    expect(ANGULO_DE_LA_PROYECCION.oblicua).toBe(45)
  })
})
