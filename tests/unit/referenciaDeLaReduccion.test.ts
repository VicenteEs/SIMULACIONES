import { describe, expect, it } from 'vitest'
import type { ContenidoDeInstancia } from '@/atlas/formato'
import { prepararExportacion, type PiezaLeida } from '@/lib/exportarAtlas'
import { reproducirPreparacion } from '@/lib/reproducirPreparacion'
import { aplicarLa, delTaller, esCasiIdentidad, girarConLa, IDENTIDAD, type TransformacionRigida } from '@/lib/transformacionRigida'
import { piezasConLasDelModelo, propuestaDelNodo, propuestasDelModelo, rellenarDesdeElModelo } from '@/lib/piezasDelCaso'
import { motivoSinNadaQueReducir } from '@/lib/reduccionDelCaso'

/**
 * La exportación del taller escribe a dónde vuelve el fragmento (D-304, E1 de P-012), y eso llega al caso.
 *
 * Lo que se vio en P-010: el taller anguló el fragmento 11° y la consola marcaba 0 mm y 0°, porque el archivo no decía
 * dónde iba el trozo reducido y la consola leía la pose del archivo como la buena. Aquí se prueba, con una caja que hace
 * de tibia derecha, que la posición reducida que se escribe deshace de verdad lo que hizo el taller —vértice a vértice—,
 * también cuando se movió el otro trozo; que va en coordenadas del archivo y solo en el fragmento; y que de ahí pasa a
 * la fila del caso, que con ella ya tiene algo que reducir.
 */

/** Una caja cerrada de 2,4 × 36 × 2,4 cm: «una tibia» vertical en la mitad derecha del atlas (x negativa). */
function tibiaDerecha(): PiezaLeida {
  const [cx, cz, media] = [-0.07, 0.01, 0.012]
  const v: number[] = []
  for (const y of [0.08, 0.44]) {
    for (const [px, pz] of [[-media, -media], [media, -media], [media, media], [-media, media]]) v.push(cx + px, y, cz + pz)
  }
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { id: 'T', nombre: 'Right tibia', sistema: 'skeletal', posiciones: new Float32Array(v), normales: new Int16Array(v.length), indices: new Uint32Array(i) }
}

type Cuaternion = [number, number, number, number]
const giro = (eje: [number, number, number], grados: number): Cuaternion => {
  const largo = Math.hypot(...eje)
  const s = Math.sin((grados * Math.PI) / 360)
  return [(eje[0] / largo) * s, (eje[1] / largo) * s, (eje[2] / largo) * s, Math.cos((grados * Math.PI) / 360)]
}

// Un corte transversal a media diáfisis. La normal apunta arriba, así que `a` es el trozo de arriba (proximal) y `b`
// el de abajo, que es el fragmento.
const CORTE = { pieza: 'T', punto: [-0.07, 0.26, 0.01] as [number, number, number], normal: [0, 1, 0] as [number, number, number] }
const vista = { camara: [0, 0, 3], objetivo: [0, 0, 0], separacion: 0 } as ContenidoDeInstancia['vista']
const preparar = (cortes: ContenidoDeInstancia['cortes']) =>
  reproducirPreparacion({ version: 1, atlas: 'x', piezas: [{ id: 'T' }], vista, cortes }, [tibiaDerecha()])

const DISTAL_MOVIDO = { mover: [0.012, -0.004, 0.003] as [number, number, number], girar: giro([0.2, 0.1, 1], 11) }
const PROXIMAL_MOVIDO = { mover: [0, 0.01, -0.002] as [number, number, number], girar: giro([1, 0, 0], 5) }

/** Los vértices de un trozo como tripletas. */
const vertices = (p: PiezaLeida): [number, number, number][] => {
  const salida: [number, number, number][] = []
  for (let i = 0; i + 2 < p.posiciones.length; i += 3) salida.push([p.posiciones[i], p.posiciones[i + 1], p.posiciones[i + 2]])
  return salida
}
const centroDeLaCaja = (vs: [number, number, number][]): [number, number, number] =>
  [0, 1, 2].map((e) => (Math.min(...vs.map((v) => v[e])) + Math.max(...vs.map((v) => v[e]))) / 2) as [number, number, number]
const cerca = (a: readonly number[], b: readonly number[], digitos = 5) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digitos))

describe('la referencia que calcula el taller', () => {
  const enReposo = preparar([CORTE])
  const distalEnReposo = vertices(enReposo.piezas.find((p) => p.id === 'T#b')!)
  const proximalEnReposo = vertices(enReposo.piezas.find((p) => p.id === 'T#a')!)

  it('sin mover nada, el trozo ya está donde va: la identidad, con los ejes y el lado del hueso', () => {
    const ref = enReposo.partido?.corte.referencia
    expect(ref).toBeTruthy()
    expect(esCasiIdentidad(ref!.posicionReducida, 1000)).toBe(true)
    expect(ref!.lado).toBe('derecho')
    cerca(ref!.ejes.largo, [0, -1, 0])
    cerca(ref!.ejes.delante, [0, 0, 1])
    cerca(ref!.ejes.fuera, [-1, 0, 0])
    // La normal del trazo, hacia distal aunque el corte se dibujara con la normal hacia arriba.
    cerca(ref!.normalDelTrazo!, [0, -1, 0])
  })

  it('con el distal movido, la posición reducida deshace lo que le hizo el taller, vértice a vértice', () => {
    const r = preparar([{ ...CORTE, b: DISTAL_MOVIDO }])
    const ref = r.partido!.corte.referencia!
    const movidos = vertices(r.piezas.find((p) => p.id === 'T#b')!)
    expect(movidos).toHaveLength(distalEnReposo.length)
    movidos.forEach((p, i) => cerca(aplicarLa(ref.posicionReducida, p), distalEnReposo[i]))
    // El otro trozo no se movió: los ejes son los del hueso en reposo, y la normal va como quedó el fragmento.
    cerca(ref.ejes.largo, [0, -1, 0])
    cerca(ref.normalDelTrazo!, girarConLa({ qx: DISTAL_MOVIDO.girar[0], qy: DISTAL_MOVIDO.girar[1], qz: DISTAL_MOVIDO.girar[2], qw: DISTAL_MOVIDO.girar[3] }, [0, -1, 0]))
  })

  it('con el proximal movido también, el distal vuelve junto a él y no al sitio del atlas', () => {
    const r = preparar([{ ...CORTE, a: PROXIMAL_MOVIDO, b: DISTAL_MOVIDO }])
    const ref = r.partido!.corte.referencia!
    // Lo que el taller le hizo al proximal, con la misma regla con que lo dibuja.
    const delProximal = delTaller(centroDeLaCaja(proximalEnReposo), PROXIMAL_MOVIDO.mover, PROXIMAL_MOVIDO.girar)
    const movidos = vertices(r.piezas.find((p) => p.id === 'T#b')!)
    movidos.forEach((p, i) => cerca(aplicarLa(ref.posicionReducida, p), aplicarLa(delProximal, distalEnReposo[i])))
    // Y los ejes son los del hueso reducido, girados como el proximal.
    cerca(ref.ejes.largo, girarConLa(delProximal, [0, -1, 0]))
    cerca(ref.ejes.delante, girarConLa(delProximal, [0, 0, 1]))
  })
})

describe('lo que escribe la exportación en el archivo', () => {
  const r = preparar([{ ...CORTE, b: DISTAL_MOVIDO }])
  const exportado = prepararExportacion(r.piezas, {
    protagonistas: r.sueltas,
    nombresDeSistema: { skeletal: 'Esqueleto' },
    partido: r.partido,
  })
  const fragmento = exportado.objetos.find((o) => o.extras?.rol === 'fragmento')!

  it('solo el fragmento lleva la referencia, con el foco en su origen y los ejes para leerlo', () => {
    expect(fragmento).toBeTruthy()
    expect(fragmento.extras?.focoEnElOrigen).toBe(true)
    expect(fragmento.extras?.lado).toBe('derecho')
    expect(fragmento.extras?.ejeLargo).toHaveLength(3)
    expect(fragmento.extras?.ejeDelante).toHaveLength(3)
    expect(fragmento.extras?.ejeFuera).toHaveLength(3)
    expect(fragmento.extras?.normalDelTrazo).toHaveLength(3)
    const otros = exportado.objetos.filter((o) => o !== fragmento)
    expect(otros.length).toBeGreaterThan(0)
    for (const o of otros) expect(o.extras?.posicionReducida).toBeUndefined()
  })

  it('la posición reducida va en coordenadas del archivo: lleva el trozo del archivo a su sitio, también centrado', () => {
    const reducida = fragmento.extras?.posicionReducida as unknown as TransformacionRigida
    const t = fragmento.traslacion ?? [0, 0, 0]
    const centro = exportado.centro
    const distalEnReposo = vertices(preparar([CORTE]).piezas.find((p) => p.id === 'T#b')!)
    const enElArchivo = vertices({ ...r.piezas[0], posiciones: fragmento.posiciones }).map(
      (v) => [v[0] + t[0], v[1] + t[1], v[2] + t[2]] as [number, number, number],
    )
    expect(enElArchivo).toHaveLength(distalEnReposo.length)
    enElArchivo.forEach((p, i) =>
      cerca(aplicarLa(reducida, p), [distalEnReposo[i][0] - centro[0], distalEnReposo[i][1] - centro[1], distalEnReposo[i][2] - centro[2]]),
    )
  })

  it('de ahí pasa a la fila del caso, que con ella ya tiene algo que reducir', () => {
    const datos = exportado.objetos.map((o) => ({ nodo: o.nombre.replace(/ /g, '_'), datos: o.extras ?? {} }))
    const propuestas = propuestasDelModelo(datos)
    const conReducida = propuestas.filter((p) => p.posicionReducida)
    expect(conReducida.map((p) => p.rol)).toEqual(['fragmento'])

    const { piezas, conPosicionReducida } = rellenarDesdeElModelo([], propuestas)
    expect(conPosicionReducida).toBe(1)
    const fila = piezas.find((p) => p.rol === 'fragmento')!
    expect(esCasiIdentidad(fila.posicionReducida as TransformacionRigida, 1000)).toBe(false)

    // Sin desplazamiento inicial escrito: el convenio de P-008 E5, el trozo exportado desplazado y su sitio en la fila.
    const caso = { piezas, desplazamientoInicial: { x: 0, y: 0, z: 0, giroX: 0, giroY: 0, giroZ: 0 }, milimetrosPorUnidad: 1000 }
    expect(motivoSinNadaQueReducir(caso)).toBeNull()
    expect(motivoSinNadaQueReducir({ ...caso, piezas: piezas.map((p) => ({ ...p, posicionReducida: undefined })) })).not.toBeNull()
  })
})

describe('la posición reducida del archivo, en las piezas del caso', () => {
  const reducida: TransformacionRigida = { x: 0.01, y: -0.002, z: 0, qx: 0, qy: 0, qz: 0.0958, qw: 0.9954 }
  const normalizada = (t: TransformacionRigida) => {
    const n = Math.hypot(t.qx, t.qy, t.qz, t.qw)
    return { ...t, qx: t.qx / n, qy: t.qy / n, qz: t.qz / n, qw: t.qw / n }
  }

  it('propuestaDelNodo la pasa si está entera, y la calla si no', () => {
    const p = propuestaDelNodo('Tibia_derecha_fragmento_distal', { rol: 'fragmento', etiqueta: 'Fragmento distal', posicionReducida: reducida })
    expect(p?.posicionReducida?.x).toBeCloseTo(0.01, 12)
    const sinQw = { ...reducida } as Partial<TransformacionRigida>
    delete sinQw.qw
    expect(propuestaDelNodo('x', { rol: 'fragmento', etiqueta: 'x', posicionReducida: sinQw })).not.toHaveProperty('posicionReducida')
  })

  it('la consola la toma para la fila que no la tiene, sin pisar la que sí', () => {
    const delArchivo = [{ nodo: 'distal', datos: { rol: 'fragmento', etiqueta: 'Distal', posicionReducida: reducida } }]
    const fila: { nodo: string; rol: 'fragmento'; etiqueta: string; posicionReducida?: TransformacionRigida | null } = {
      nodo: 'distal',
      rol: 'fragmento',
      etiqueta: 'Distal',
    }
    const sinElla = piezasConLasDelModelo([fila], delArchivo)
    expect(sinElla[0].posicionReducida).toEqual(normalizada(reducida))

    const propia: TransformacionRigida = { ...IDENTIDAD, x: 0.5 }
    const conLaSuya = piezasConLasDelModelo([{ nodo: 'distal', rol: 'fragmento' as const, etiqueta: 'Distal', posicionReducida: propia }], delArchivo)
    expect(conLaSuya[0].posicionReducida).toEqual(propia)
  })

  it('«Rellenar desde el modelo» la escribe donde falta y lo cuenta; donde la hay, no la toca', () => {
    const propuestas = [{ nodo: 'distal', rol: 'fragmento' as const, etiqueta: 'Distal', posicionReducida: reducida }]
    const vacia = rellenarDesdeElModelo([{ nodo: 'distal', rol: 'fragmento', etiqueta: 'Distal' }], propuestas)
    expect(vacia.conPosicionReducida).toBe(1)
    expect(vacia.piezas[0].posicionReducida).toEqual(reducida)

    const propia: TransformacionRigida = { ...IDENTIDAD, x: 0.5 }
    const llena = [{ nodo: 'distal', rol: 'fragmento' as const, etiqueta: 'Distal', posicionReducida: propia }]
    const r = rellenarDesdeElModelo(llena, propuestas)
    expect(r.conPosicionReducida).toBe(0)
    // Sin nada que cambiar, la misma lista: así quien llama sabe que no había nada que rellenar.
    expect(r.piezas).toBe(llena)
  })
})
