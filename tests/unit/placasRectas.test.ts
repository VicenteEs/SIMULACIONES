import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import {
  AGUJEROS_MAXIMOS,
  AGUJEROS_MINIMOS,
  SISTEMAS_DE_PLACA_RECTA,
  agujerosDeLaPlacaRectaMm,
  direccionDeLaPlacaRecta,
  idDelCatalogoParaElPaso,
  idDeLaPlacaRecta,
  instrumentoDeLaPlacaRecta,
  largoDeCatalogoMm,
  largoEscritoMm,
  modeloConLosAgujerosEscritos,
  placaRecta,
  placaRectaDeLaDireccion,
  placaRectaDelId,
  placasConAgujeros,
} from '@/lib/placasRectas'
import { quePuedeColocar } from '@/lib/fijacion'
import { diametroDelTornilloDeLaPlaca, formaDeLosAgujeros } from '@/lib/compresion'
import { crearPlacaRecta } from '@/instrumental/placaRectaProcedural'
import { cargarModeloDelInstrumento } from '@/instrumental/cargarModelo'
import { prepararHerramienta } from '@/instrumental/herramienta3d'

describe('placas rectas a medida (P-008 E3)', () => {
  it('el largo de catálogo es el del modelo de Blender: agujeros por paso, más las puntas', () => {
    // `placa_recta` en scripts/instrumental/implantes.py: n * paso + 6 (11 la de reconstrucción).
    const lcp = SISTEMAS_DE_PLACA_RECTA.find((s) => s.id === 'lcp-3-5')!
    expect(largoDeCatalogoMm(lcp, 8)).toBe(110)
    const recon = SISTEMAS_DE_PLACA_RECTA.find((s) => s.id === 'reconstruccion-3-5')!
    expect(largoDeCatalogoMm(recon, 10)).toBe(111)
  })

  it('el largo sale de los agujeros, con el paso de su sistema: solo de catálogo (D-259)', () => {
    const deCatalogo = placaRecta('lcp-3-5', 5)!
    expect(deCatalogo.pasoMm).toBe(13)
    expect(deCatalogo.largoMm).toBe(71)
    expect(agujerosDeLaPlacaRectaMm(placaRecta('lcp-3-5', 3)!)).toHaveLength(3)
    // Una sesión guardada con una placa estirada (D-254) vuelve con la de catálogo de esos agujeros.
    const estirada = placaRectaDelId('placa-recta:lcp-3-5:3:50')!
    expect(estirada.largoMm).toBe(45)
    expect(estirada.pasoMm).toBe(13)
    expect(placaRectaDeLaDireccion('procedural:placa-recta/lcp-3-5/3/50')).toEqual(estirada)
  })

  it('los agujeros van centrados a lo largo, a la distancia de la placa', () => {
    const p = placaRecta('dcp-4-5-estrecha', 4)!
    expect(agujerosDeLaPlacaRectaMm(p)).toEqual([
      [0, -24],
      [0, -8],
      [0, 8],
      [0, 24],
    ])
  })

  it('en la ancha van alternados a un lado y otro del eje', () => {
    const p = placaRecta('lc-dcp-4-5-ancha', 4)!
    const xs = agujerosDeLaPlacaRectaMm(p).map(([x]) => x)
    expect(xs[0]).toBeLessThan(0)
    expect(xs[1]).toBeGreaterThan(0)
    expect(xs[2]).toBeLessThan(0)
    expect(xs[3]).toBeGreaterThan(0)
  })

  it('fuera de 2 a 16 agujeros, o con un sistema que no existe, no hay placa', () => {
    expect(placaRecta('lcp-3-5', AGUJEROS_MINIMOS - 1)).toBeNull()
    expect(placaRecta('lcp-3-5', AGUJEROS_MAXIMOS + 1)).toBeNull()
    expect(placaRecta('lcp-3-5', 4.5)).toBeNull()
    expect(placaRecta('no-existe', 5)).toBeNull()
  })

  it('con 5 agujeros salen todas las de 5, con agujeros de varias medidas', () => {
    const ofertas = placasConAgujeros(5)
    expect(ofertas).toHaveLength(SISTEMAS_DE_PLACA_RECTA.length)
    expect(ofertas.every((o) => o.placa?.agujeros === 5)).toBe(true)
    expect(new Set(ofertas.map((o) => o.sistema.tornilloMm))).toEqual(new Set([2.4, 2.7, 3.5, 4.5]))
    expect(new Set(ofertas.map((o) => o.sistema.agujero))).toEqual(new Set(['oval', 'combi', 'redondo']))
  })

  it('un largo buscado no cambia ninguna placa: las ordena, de la que más se le acerca a la que menos', () => {
    const ofertas = placasConAgujeros(3, 50)
    expect(ofertas).toHaveLength(SISTEMAS_DE_PLACA_RECTA.length)
    for (const o of ofertas) {
      expect(o.placa!.largoMm).toBe(largoDeCatalogoMm(o.sistema, 3))
      expect(o.diferenciaMm).toBeCloseTo(o.placa!.largoMm - 50, 6)
    }
    const lejos = ofertas.map((o) => Math.abs(o.diferenciaMm!))
    expect([...lejos].sort((a, b) => a - b)).toEqual(lejos)
    // Sin largo, en el orden de siempre y sin diferencia.
    expect(placasConAgujeros(3).every((o) => o.diferenciaMm === null)).toBe(true)
  })

  it('la dirección y el identificador dicen toda la placa: se rehace igual de ellos', () => {
    const p = placaRecta('lc-dcp-3-5', 7)!
    expect(placaRectaDeLaDireccion(direccionDeLaPlacaRecta(p))).toEqual(p)
    expect(placaRectaDelId(idDeLaPlacaRecta(p))).toEqual(p)
    expect(placaRectaDelId('un-id-de-payload')).toBeNull()
    expect(placaRectaDeLaDireccion('/api/modelos/archivo.glb')).toBeNull()
  })

  it('el largo se escribe en milímetros o en centímetros', () => {
    expect(largoEscritoMm('50')).toBe(50)
    expect(largoEscritoMm('50 mm')).toBe(50)
    expect(largoEscritoMm('5 cm')).toBe(50)
    expect(largoEscritoMm('5,5cm')).toBe(55)
    expect(largoEscritoMm('0')).toBeNull()
    expect(largoEscritoMm('cinco')).toBeNull()
  })

  it('cada sistema se reconoce como placa, con la forma de agujero y el tornillo que dibuja', () => {
    for (const s of SISTEMAS_DE_PLACA_RECTA) {
      const p = placaRecta(s.id, 5)!
      const i = instrumentoDeLaPlacaRecta(p)
      expect(quePuedeColocar(i)).toEqual({ tipo: 'placa' })
      // El óvalo del que sale la compresión se mide desde el tornillo que dice el nombre.
      expect(diametroDelTornilloDeLaPlaca(i.nombre)).toBe(s.tornilloMm)
      // La de tercio de caña lleva óvalos cortos, pero la compresión la trata como redonda desde D-169: se deja así.
      if (s.id !== 'tercio-de-cana-3-5') expect(formaDeLosAgujeros(i)).toBe(s.agujero)
    }
  })

  it('con los orificios que escribió el editor, una placa recta de otra cantidad se genera a medida (P-004 E6)', () => {
    const lcp = { slug: 'placa-lcp-recta-3-5', modeloUrl: '/api/modelos/lcp.glb' }
    expect(modeloConLosAgujerosEscritos({ ...lcp, orificios: null })).toBe(lcp.modeloUrl)
    expect(modeloConLosAgujerosEscritos({ ...lcp, orificios: 8 })).toBe(lcp.modeloUrl)
    const cinco = placaRectaDeLaDireccion(modeloConLosAgujerosEscritos({ ...lcp, orificios: 5 }))!
    expect(cinco.agujeros).toBe(5)
    expect(cinco.sistema.id).toBe('lcp-3-5')
    // Lo que no es una placa recta, como estaba.
    expect(modeloConLosAgujerosEscritos({ slug: 'placa-t-3-5', modeloUrl: '/t.glb', orificios: 5 })).toBe('/t.glb')
  })
})

describe('el modelo 3D de la placa a medida', () => {
  const p = placaRecta('lcp-3-5', 5)!

  it('tiene las medidas de la placa, en metros y en el marco de Blender: ancho por X, largo por Z y la cara de abajo en Y = 0', () => {
    const raiz = crearPlacaRecta(p)
    raiz.updateMatrixWorld(true)
    const caja = new THREE.Box3().setFromObject(raiz)
    const tamano = caja.getSize(new THREE.Vector3())
    expect(tamano.x * 1000).toBeCloseTo(p.sistema.anchoMm, 1)
    expect(tamano.z * 1000).toBeCloseTo(71, 1)
    expect(tamano.y * 1000).toBeCloseTo(p.sistema.grosorMm, 1)
    expect(caja.min.y).toBeCloseTo(0, 6)
  })

  it('declara sus agujeros como un modelo de Blender, y los agujeros atraviesan la placa', () => {
    const h = prepararHerramienta(crearPlacaRecta(p))
    expect(h.meta?.agujeros).toEqual(agujerosDeLaPlacaRectaMm(p))
    h.raiz.updateMatrixWorld(true)
    const rayo = new THREE.Raycaster()
    const tocaEn = (xMm: number, yMm: number) => {
      // De arriba abajo; la Y de Blender es −Z en el modelo.
      rayo.set(new THREE.Vector3(xMm / 1000, 0.05, -yMm / 1000), new THREE.Vector3(0, -1, 0))
      return rayo.intersectObjects(h.mallas, false).length > 0
    }
    for (const [x, y] of h.meta!.agujeros) expect(tocaEn(x, y)).toBe(false)
    // Entre dos agujeros hay metal, y al lado de la fila también.
    const [, y0] = h.meta!.agujeros[0]
    const [, y1] = h.meta!.agujeros[1]
    expect(tocaEn(0, (y0 + y1) / 2)).toBe(true)
    expect(tocaEn(p.sistema.anchoMm * 0.4, y0)).toBe(true)
  })

  it('la de tercio de caña se curva: los bordes bajan hacia el hueso', () => {
    const tercio = crearPlacaRecta(placaRecta('tercio-de-cana-3-5', 4)!)
    const malla = tercio.getObjectByName('placa') as THREE.Mesh
    const posiciones = malla.geometry.getAttribute('position')
    let enElBorde = Infinity
    let enElMedio = Infinity
    for (let i = 0; i < posiciones.count; i++) {
      const x = Math.abs(posiciones.getX(i)) * 1000
      const y = posiciones.getY(i) * 1000
      if (x > 4.5) enElBorde = Math.min(enElBorde, y)
      if (x < 0.5) enElMedio = Math.min(enElMedio, y)
    }
    expect(enElBorde).toBeLessThan(enElMedio - 1)
  })

  it('el cargador de instrumentos la genera en el acto, y con una dirección que no es de placa avisa del fallo', () => {
    let cargada: THREE.Object3D | null = null
    cargarModeloDelInstrumento(direccionDeLaPlacaRecta(p), (raiz) => (cargada = raiz), () => {})
    expect(cargada).not.toBeNull()
    let fallo = false
    cargarModeloDelInstrumento('procedural:placa-recta/no-existe/5', () => {}, () => (fallo = true))
    expect(fallo).toBe(true)
  })
})

describe('la placa elegida por sus agujeros cuenta en el paso como la de su sistema (P-013, pedido 4)', () => {
  const catalogo = [
    { id: '67', slug: 'placa-lcp-recta-3-5' },
    { id: '66', slug: 'placa-lc-dcp-3-5' },
    { id: '38', slug: 'broca-2-5' },
  ]

  it('una LCP 3,5 de 10 agujeros vale por la LCP 3,5 del catálogo, y lo que no es placa a medida pasa tal cual', () => {
    const lcp10 = placaRecta('lcp-3-5', 10)!
    expect(idDelCatalogoParaElPaso(idDeLaPlacaRecta(lcp10), catalogo)).toBe('67')
    expect(idDelCatalogoParaElPaso('38', catalogo)).toBe('38')
    expect(idDelCatalogoParaElPaso(null, catalogo)).toBeNull()
  })

  it('un sistema sin placa en el catálogo no inventa una', () => {
    expect(idDelCatalogoParaElPaso(idDeLaPlacaRecta(placaRecta('lcp-2-4', 6)!), catalogo)).toBeNull()
  })

  it('el gesto del residente lleva el instrumento traducido, y el selector de agujeros sale abierto', () => {
    const consola = readFileSync(join(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8')
    const gesto = consola.slice(consola.indexOf('const gestoActual = useMemo<Gesto>('), consola.indexOf('/** Lo que pide el paso, marcándose solo'))
    expect(gesto).toContain('instrumento: idDelCatalogoParaElPaso(instrumento, caso.instrumental) ?? instrumento,')
    expect(consola).toContain('<details className="placa-a-medida-desplegable" open>')
    expect(consola).toContain('<summary>Cantidad de agujeros (orificios) y largo</summary>')
  })
})
