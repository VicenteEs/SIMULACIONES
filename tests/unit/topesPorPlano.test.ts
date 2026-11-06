import { describe, expect, it } from 'vitest'
import type { LecturaClinica } from '@/atlas/lecturaClinica'
import {
  evaluarGesto,
  pasosSinNadaQueReducir,
  puntajeMaximo,
  puntosDelPaso,
  reduccionFueraDeLosTopes,
  RESULTADOS,
  TOPES_POR_TECNICA,
  topesDeReduccion,
  topesEnTexto,
  type Gesto,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { listaDelPaso } from '@/lib/listaDelPaso'
import { medidasDeLaLectura } from '@/lib/reduccion'
import {
  motivoSinNadaQueReducir,
  revisarLaReduccionDelCaso,
  SIN_FRAGMENTO_QUE_REDUCIR,
  SIN_REFERENCIA_DE_LA_REDUCCION,
} from '@/lib/reduccionDelCaso'
import { faltantes } from '@/admin/depurar'
import { esquemaDe } from '@/admin/esquema'

/**
 * Un tope por plano, y un paso de reducción que no se regala (D-305 y D-306, E1 de P-012).
 *
 * Antes un solo tope de 5° valía para el varo, el recurvatum y la rotación juntos, cuando en una diáfisis de tibia se
 * aceptan 5° de varo y 10° de recurvatum; y un paso cuyo trozo ya empezaba en su sitio se aprobaba sin mover nada, con
 * todos sus puntos. Aquí se prueban las dos técnicas con sus topes, que lo escrito a mano mande, que un caso de antes se
 * mida como se medía, y las dos mitades de la regla del paso sin nada que reducir: la de la consola, con la medida de
 * partida, y la de publicar, con lo que guarda la fila.
 */

const lectura = (parcial: Partial<LecturaClinica>): LecturaClinica => ({
  lateral: 0,
  anteroposterior: 0,
  axial: 0,
  valgo: 0,
  recurvatum: 0,
  rotacion: 0,
  ...parcial,
})

/** Un gesto de reducción con la lectura ya partida por planos, como lo arma la consola (D-303). */
const gestoCon = (l: LecturaClinica, angulacion: number): Gesto => ({
  instrumento: 'pinza',
  ...medidasDeLaLectura(l, angulacion),
})

const reduccion = (extra: Partial<PasoQuirurgico> = {}): PasoQuirurgico => ({ objetivo: 'reduccion', instrumento: 'pinza', ...extra })

describe('los topes de cada técnica', () => {
  it('alineación: los criterios de Trafton para la diáfisis, sin techo para la traslación', () => {
    expect(topesDeReduccion(reduccion({ tecnicaDeReduccion: 'alineacion' }))).toEqual({
      desplazamiento: 5,
      diastasis: 5,
      angulacion: 5,
      coronal: 5,
      sagital: 10,
      rotacion: 10,
      acortamiento: 10,
    })
  })

  it('anatómica: 2° en cada plano y 2 mm, aunque la fila traiga el 5 que pone la base', () => {
    // `toleranciaDesplazamiento` y `toleranciaDiastasis` llevan `DEFAULT 5`: un 5 ahí no prueba que nadie lo eligiera.
    const topes = topesDeReduccion(reduccion({ tecnicaDeReduccion: 'anatomica', toleranciaDesplazamiento: 5, toleranciaDiastasis: 5 }))
    expect(topes).toMatchObject({ desplazamiento: 2, diastasis: 2, coronal: 2, sagital: 2, rotacion: 2, acortamiento: 2 })
    // Lo tecleado más estricto que la técnica, manda.
    expect(topesDeReduccion(reduccion({ tecnicaDeReduccion: 'anatomica', toleranciaDesplazamiento: 1 })).desplazamiento).toBe(1)
  })

  it('un tope por plano escrito manda sobre la técnica', () => {
    const topes = topesDeReduccion(reduccion({ tecnicaDeReduccion: 'alineacion', toleranciaCoronal: 3, toleranciaAcortamiento: 15 }))
    expect(topes.coronal).toBe(3)
    expect(topes.sagital).toBe(10)
    expect(topes.acortamiento).toBe(15)
  })

  it('con un solo plano pedido y sin técnica, los otros dos toman el tope de la angulación: sin tope se regalarían', () => {
    const topes = topesDeReduccion(reduccion({ toleranciaSagital: 10, toleranciaAngulacion: 4 }))
    expect(topes).toMatchObject({ coronal: 4, sagital: 10, rotacion: 4 })
  })

  it('la tabla tiene las cifras que dice la bitácora', () => {
    expect(TOPES_POR_TECNICA.alineacion).toEqual({ coronal: 5, sagital: 10, rotacion: 10, acortamiento: 10 })
    expect(TOPES_POR_TECNICA.anatomica).toEqual({ coronal: 2, sagital: 2, rotacion: 2, acortamiento: 2, desplazamiento: 2, diastasis: 2 })
  })

  it('la instrucción los dice; un caso de antes lee lo mismo que leía', () => {
    expect(topesEnTexto(topesDeReduccion(reduccion()))).toBe('5 mm de desplazamiento, 5 mm de diástasis y 5° de angulación')
    expect(topesEnTexto(topesDeReduccion(reduccion({ tecnicaDeReduccion: 'alineacion' })))).toBe(
      '5 mm de desplazamiento, 5 mm de diástasis, 10 mm de acortamiento, 5° en el plano coronal, 10° en el sagital y 10° de rotación',
    )
  })
})

describe('el juicio plano a plano', () => {
  // 4° de varo, 8° de recurvatum y 3° de rotación: 9,4° de giro total, que el tope único de 5° rechazaba.
  const alineadoEnLosTres = gestoCon(lectura({ valgo: -4, recurvatum: 8, rotacion: 3, axial: -1 }), 9.4)

  it('con la técnica de alineación, se acepta lo que Trafton acepta', () => {
    const paso = reduccion({ tecnicaDeReduccion: 'alineacion' })
    expect(reduccionFueraDeLosTopes(alineadoEnLosTres, topesDeReduccion(paso))).toEqual([])
    expect(evaluarGesto(paso, alineadoEnLosTres).avanza).toBe(true)
  })

  it('un caso de antes, sin técnica, se sigue juzgando con el giro total', () => {
    const paso = reduccion()
    const fuera = reduccionFueraDeLosTopes(alineadoEnLosTres, topesDeReduccion(paso))
    expect(fuera).toEqual(['9,4° de angulación (hasta 5°)'])
    const r = evaluarGesto(paso, alineadoEnLosTres)
    expect(r.avanza).toBe(false)
    expect(r.resultado).toBe(RESULTADOS.REDUCCION_INSUFICIENTE)
    expect(r.mensaje).toContain('9,4° de angulación (hasta 5°)')
  })

  it('dice qué plano se pasa, sin varo ni valgo: el motor no sabe de qué lado es la pierna', () => {
    const paso = reduccion({ tecnicaDeReduccion: 'alineacion' })
    const fuera = reduccionFueraDeLosTopes(gestoCon(lectura({ valgo: 7, recurvatum: 10.4 }), 12.5), topesDeReduccion(paso))
    // Con un decimal: «10° (hasta 10°)» no explicaría por qué no pasa un 10,4.
    expect(fuera).toEqual(['7° en el plano coronal (hasta 5°)', '10,4° en el plano sagital (hasta 10°)'])
    expect(fuera.join(' ')).not.toMatch(/varo|valgo/)
  })

  it('a lo largo, separa lo que se abre de lo que cabalga', () => {
    const alineacion = topesDeReduccion(reduccion({ tecnicaDeReduccion: 'alineacion' }))
    // 3 mm de acortamiento caben en los 10 de Trafton; 6 de diástasis no caben en sus 5, ni 12 de acortamiento en los 10.
    expect(reduccionFueraDeLosTopes(gestoCon(lectura({ axial: -3 }), 0), alineacion)).toEqual([])
    expect(reduccionFueraDeLosTopes(gestoCon(lectura({ axial: 6 }), 0), alineacion)).toEqual(['6 mm de diástasis (hasta 5 mm)'])
    expect(reduccionFueraDeLosTopes(gestoCon(lectura({ axial: -12 }), 0), alineacion)).toEqual(['12 mm de acortamiento (hasta 10 mm)'])
  })

  it('sin la lectura, con topes por plano, el giro total se mide contra el más estricto', () => {
    const topes = topesDeReduccion(reduccion({ tecnicaDeReduccion: 'alineacion' }))
    const sinLectura: Gesto = { instrumento: 'pinza', desplazamiento: 0, diastasis: 0, angulacion: 6 }
    expect(reduccionFueraDeLosTopes(sinLectura, topes)).toEqual(['6° de angulación (hasta 5°)'])
  })

  it('la lista del paso enseña las mismas cifras que juzga el motor', () => {
    const paso = reduccion({ tecnicaDeReduccion: 'alineacion' })
    const gesto = gestoCon(lectura({ valgo: 7, recurvatum: 8, rotacion: 3, axial: -4 }), 11)
    const lista = Object.fromEntries(listaDelPaso(paso, gesto, { revelarElInstrumento: true, juzgar: true }).map((p) => [p.clave, p]))
    expect(lista.coronal.estado).toBe('falta')
    expect(lista.coronal.texto).toBe('Plano coronal (varo o valgo) hasta 5°')
    expect(lista.coronal.ahora).toBe('7°')
    expect(lista.sagital.estado).toBe('hecho')
    expect(lista.rotacion.estado).toBe('hecho')
    expect(lista.acortamiento.estado).toBe('hecho')
    expect(lista.diastasis.estado).toBe('hecho')
    expect(lista).not.toHaveProperty('angulacion')
    // Y un paso de antes, con la lista de antes.
    const deAntes = Object.fromEntries(listaDelPaso(reduccion(), gesto, { revelarElInstrumento: true, juzgar: true }).map((p) => [p.clave, p]))
    expect(Object.keys(deAntes)).toEqual(expect.arrayContaining(['desplazamiento', 'angulacion', 'diastasis']))
    expect(deAntes).not.toHaveProperty('coronal')
  })

  it('las medidas de la lectura: el desplazamiento de través y lo de a lo largo sin signo, redondeados', () => {
    const m = medidasDeLaLectura(lectura({ lateral: 3, anteroposterior: 4, axial: -2.04, valgo: 1.26 }), 1.234)
    expect(m.desplazamiento).toBe(5)
    expect(m.diastasis).toBe(2)
    expect(m.angulacion).toBe(1.2)
    expect(m.lectura?.valgo).toBe(1.3)
    expect(m.ladoConocido).toBe(true)
    expect(medidasDeLaLectura(lectura({}), 0, false).ladoConocido).toBe(false)
  })
})

describe('un paso sin nada que reducir, en la consola', () => {
  const pasos = [
    { id: 'abordaje', objetivo: 'instrumento' as const, instrumento: 'bisturi', puntos: 10 },
    { id: 'alinear', ...reduccion({ tecnicaDeReduccion: 'alineacion' }), puntos: 20 },
    { id: 'ajustar', ...reduccion({ tecnicaDeReduccion: 'anatomica' }), puntos: 30 },
  ]

  it('el trozo que empieza dentro de los topes deja el paso sin nada que reducir; fuera de ellos, no', () => {
    // 3 mm de través: cabe en los 5 de la alineación y no en los 2 de la anatómica.
    const partida = gestoCon(lectura({ lateral: 3 }), 0)
    expect([...pasosSinNadaQueReducir(pasos, partida)]).toEqual(['alinear'])
    // Bien desplazado, los dos tienen qué reducir.
    expect([...pasosSinNadaQueReducir(pasos, gestoCon(lectura({ lateral: 9, valgo: 12 }), 12))]).toEqual([])
  })

  it('el trozo exactamente en su sitio —el caso sin referencia— deja fuera todos los de reducción', () => {
    expect([...pasosSinNadaQueReducir(pasos, gestoCon(lectura({}), 0))]).toEqual(['alinear', 'ajustar'])
  })

  it('sin fragmento que medir, tampoco hay nada que reducir; y los demás objetivos no se tocan nunca', () => {
    expect([...pasosSinNadaQueReducir(pasos, null)]).toEqual(['alinear', 'ajustar'])
  })

  it('no puntúa y no cuenta en el máximo', () => {
    const paso = pasos[1]
    expect(puntosDelPaso(paso, { fallo: false, complicacion: false, sinNadaQueReducir: true })).toBe(0)
    expect(puntosDelPaso(paso, { fallo: false, complicacion: false })).toBe(20)
    // La marca solo vale en un paso de reducción.
    expect(puntosDelPaso(pasos[0], { fallo: false, complicacion: false, sinNadaQueReducir: true })).toBe(10)
    expect(puntajeMaximo(pasos)).toBe(60)
    expect(puntajeMaximo(pasos, new Set(['alinear']))).toBe(40)
  })
})

describe('un paso sin nada que reducir, al publicar', () => {
  const quieto = { x: 0, y: 0, z: 0, giroX: 0, giroY: 0, giroZ: 0 }
  const fragmento = { nodo: 'tibia_distal', rol: 'fragmento' }

  it('sin una pieza marcada como fragmento', () => {
    expect(motivoSinNadaQueReducir({ piezas: [{ nodo: 'tibia', rol: 'hueso' }] })).toBe(SIN_FRAGMENTO_QUE_REDUCIR)
    expect(motivoSinNadaQueReducir(undefined)).toBe(SIN_FRAGMENTO_QUE_REDUCIR)
  })

  it('con el fragmento, basta uno de los dos convenios', () => {
    expect(motivoSinNadaQueReducir({ piezas: [fragmento], desplazamientoInicial: { ...quieto, giroZ: 9.8 } })).toBeNull()
    const reducida = { x: 0.01, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }
    expect(motivoSinNadaQueReducir({ piezas: [{ ...fragmento, posicionReducida: reducida }], desplazamientoInicial: quieto })).toBeNull()
  })

  it('sin ninguno de los dos, o con una posición reducida que no mueve nada, no', () => {
    expect(motivoSinNadaQueReducir({ piezas: [fragmento], desplazamientoInicial: quieto })).toBe(SIN_REFERENCIA_DE_LA_REDUCCION)
    expect(motivoSinNadaQueReducir({ piezas: [fragmento] })).toBe(SIN_REFERENCIA_DE_LA_REDUCCION)
    // Menos de una centésima de milímetro, en un modelo en metros: quieto.
    const casiNada = { x: 0.000001, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }
    expect(motivoSinNadaQueReducir({ piezas: [{ ...fragmento, posicionReducida: casiNada }], milimetrosPorUnidad: 1000 })).toBe(
      SIN_REFERENCIA_DE_LA_REDUCCION,
    )
    // Lo que no es un número no cuenta como desplazamiento.
    expect(motivoSinNadaQueReducir({ piezas: [fragmento], desplazamientoInicial: { x: 'mucho', y: Number.NaN } })).toBe(
      SIN_REFERENCIA_DE_LA_REDUCCION,
    )
  })

  it('el panel lo dice una vez por caso, con los pasos que alcanza', () => {
    const pasos = [{ objetivo: 'instrumento' }, { objetivo: 'reduccion' }, { objetivo: 'fijacion' }, { objetivo: 'reduccion' }]
    expect(revisarLaReduccionDelCaso({ piezas: [fragmento], desplazamientoInicial: quieto, pasos })).toEqual([
      `En los pasos 2 y 4: ${SIN_REFERENCIA_DE_LA_REDUCCION}`,
    ])
    expect(revisarLaReduccionDelCaso({ piezas: [fragmento], pasos: [{ objetivo: 'reduccion' }] })).toEqual([
      `En paso 1: ${SIN_REFERENCIA_DE_LA_REDUCCION}`,
    ])
    // Sin pasos de reducción, no hay nada que decir aunque falte el fragmento.
    expect(revisarLaReduccionDelCaso({ piezas: [], pasos: [{ objetivo: 'instrumento' }] })).toEqual([])
  })

  it('el panel solo lo pide al publicar, y en la pestaña «Simulador»', () => {
    const cirugias = esquemaDe('cirugias')
    const documento = { nombre: 'Caso', piezas: [fragmento], desplazamientoInicial: quieto, pasos: [{ titulo: 'Reducir', objetivo: 'reduccion' }] }
    expect(faltantes(cirugias, documento, { profundo: true }).join(' ')).toContain(SIN_REFERENCIA_DE_LA_REDUCCION)
    // Un borrador se guarda igual (D-011): Payload no lo mira, y el caso a medio escribir no tiene por qué tenerlo.
    expect(faltantes(cirugias, documento, { profundo: false }).join(' ')).not.toContain(SIN_REFERENCIA_DE_LA_REDUCCION)
    // Pestaña por pestaña, como pregunta el formulario: sale en la del simulador y en ninguna otra.
    const porPestana = cirugias.secciones.map((s) => faltantes({ ...cirugias, secciones: [s] }, documento, { profundo: true }).join(' '))
    const conElAviso = cirugias.secciones.filter((_, i) => porPestana[i].includes(SIN_REFERENCIA_DE_LA_REDUCCION)).map((s) => s.titulo)
    expect(conElAviso).toEqual(['Simulador'])
  })
})
