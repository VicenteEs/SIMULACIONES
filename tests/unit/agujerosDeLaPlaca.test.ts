import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { agujerosUniformes, avisoDeOrificios, orificiosValidos } from '@/lib/agujerosDeLaPlaca'
import { colocarPlaca, crearImplantes, posicionDelAgujero } from '@/components/simulador/implantesEnLaEscena'
import { Instrumental } from '@/collections/catalogos'
import { Instrumental as InstrumentalEsquema, camposDe } from '@/admin/esquema'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'

/**
 * Los orificios de una placa cuyo modelo no trae la posición de sus agujeros (P-004 E6, pedido 5 y respuesta Q2).
 */

describe('orificiosValidos', () => {
  it('acepta un entero de 1 a 40, también escrito como texto con coma', () => {
    expect(orificiosValidos(8)).toBe(8)
    expect(orificiosValidos('6')).toBe(6)
    expect(orificiosValidos('7,6')).toBe(8)
    expect(orificiosValidos(1)).toBe(1)
    expect(orificiosValidos(40)).toBe(40)
  })

  it('lo demás es «sin dato»', () => {
    for (const malo of [0, -3, 41, 400, NaN, Infinity, '', 'ocho', null, undefined, {}, []]) {
      expect(orificiosValidos(malo)).toBeNull()
    }
  })
})

describe('agujerosUniformes', () => {
  const caja = { centroXMm: 0, yMinimoMm: -50, yMaximoMm: 50 }

  it('reparte a partes iguales, con medio tramo libre en cada extremo', () => {
    const a = agujerosUniformes(4, caja)
    expect(a).toHaveLength(4)
    expect(a.map((x) => x[1])).toEqual([-37.5, -12.5, 12.5, 37.5])
    // La misma distancia entre todos.
    const pasos = a.slice(1).map((x, i) => x[1] - a[i][1])
    expect(new Set(pasos.map((p) => p.toFixed(6))).size).toBe(1)
  })

  it('con un solo orificio, en el centro; con ancho, en el centro del ancho', () => {
    expect(agujerosUniformes(1, { centroXMm: 2.5, yMinimoMm: 10, yMaximoMm: 30 })).toEqual([[2.5, 20]])
  })

  it('no inventa agujeros con una cantidad inválida o una caja vacía', () => {
    expect(agujerosUniformes(0, caja)).toEqual([])
    expect(agujerosUniformes(99, caja)).toEqual([])
    expect(agujerosUniformes(6, { centroXMm: 0, yMinimoMm: 5, yMaximoMm: 5 })).toEqual([])
    expect(agujerosUniformes(6, { centroXMm: 0, yMinimoMm: 9, yMaximoMm: 5 })).toEqual([])
  })
})

describe('avisoDeOrificios', () => {
  it('avisa solo si el modelo y el instrumento no se dicen lo mismo', () => {
    expect(avisoDeOrificios(8, 8)).toBeNull()
    expect(avisoDeOrificios(8, null)).toBeNull()
    expect(avisoDeOrificios(8, 6)).toContain('se usan los del modelo')
  })
})

describe('colocar una placa sin agujeros en el modelo', () => {
  function escena() {
    const e = new THREE.Scene()
    const hueso = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 100, 24, 1, false), new THREE.MeshStandardMaterial())
    e.add(hueso)
    e.updateMatrixWorld(true)
    return { e, hueso }
  }
  /** 12 ancho × 3 grosor × 100 largo en metros, con la escala 1000 que le da el lienzo. */
  function plantilla() {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.1), new THREE.MeshStandardMaterial()))
    g.scale.setScalar(1000)
    return g
  }
  const poner = (agujerosMm: [number, number][], orificios?: number | null) => {
    const { e, hueso } = escena()
    return colocarPlaca({
      escena: e,
      plantilla: plantilla(),
      nombre: 'Placa sin agujeros',
      agujerosMm,
      orificios,
      punto: new THREE.Vector3(0, 0, 6),
      normal: new THREE.Vector3(0, 0, 1),
      ejeDelHueso: new THREE.Vector3(0, 1, 0),
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes: crearImplantes(),
    })
  }

  it('«6 orificios» escritos dejan seis agujeros a partes iguales a lo largo de toda la placa', () => {
    const placa = poner([], 6)!
    expect(placa).not.toBeNull()
    expect(placa.agujerosMm).toHaveLength(6)
    expect(placa.agujerosDelModelo).toBe(false)
    const centros = placa.agujerosMm.map((_, i) => posicionDelAgujero(placa, i, 'abajo'))
    // 100 mm entre seis: 16,67 mm de paso, los extremos a medio paso del borde.
    const ys = centros.map((c) => c.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(100 / 6, 2)
    expect(ys[0]).toBeCloseTo(-50 + 100 / 12, 2)
    expect(ys[5]).toBeCloseTo(50 - 100 / 12, 2)
    // Todos sobre el eje de la placa.
    for (const c of centros) expect(c.x).toBeCloseTo(0, 3)
  })

  it('sin agujeros y sin orificios escritos, no se coloca: no habría dónde atornillar', () => {
    expect(poner([])).toBeNull()
    expect(poner([], null)).toBeNull()
    expect(poner([], 0)).toBeNull()
  })

  it('si el modelo trae sus agujeros, esos mandan y el número solo se contrasta', () => {
    const placa = poner([[0, -20], [0, 0], [0, 20]], 8)!
    expect(placa.agujerosMm).toHaveLength(3)
    expect(placa.agujerosDelModelo).toBe(true)
    expect(placa.avisoDeOrificios).toContain('El modelo trae 3 agujeros y el instrumento dice 8')
  })

  it('si coinciden, no hay aviso', () => {
    const placa = poner([[0, -20], [0, 0], [0, 20]], 3)!
    expect(placa.avisoDeOrificios).toBeNull()
  })

  it('el ancho de la placa queda medido, para los rangos del ajuste', () => {
    expect(poner([], 4)!.anchoMm).toBeCloseTo(12, 3)
  })
})

describe('los campos del instrumento', () => {
  it('«orificios» y «largoMm» están en la colección y en el panel, con los mismos límites', () => {
    for (const nombre of ['orificios', 'largoMm']) {
      const enPayload = Instrumental.fields.find((f) => 'name' in f && f.name === nombre) as unknown as Record<string, unknown>
      expect(enPayload.type).toBe('number')
      const enElPanel = camposDe(InstrumentalEsquema).find((c) => c.nombre === nombre)
      expect(enElPanel?.tipo).toBe('numero')
      expect(enElPanel && 'min' in enElPanel ? enElPanel.min : null).toBe(enPayload.min)
      expect(enElPanel && 'max' in enElPanel ? enElPanel.max : null).toBe(enPayload.max)
    }
  })

  it('el caso los lleva hasta la consola', () => {
    const caso = casoParaLaConsola({
      nombre: 'Caso',
      instrumental: [{ id: 5, nombre: 'Placa', slug: 'placa-x', categoria: 'placas', orificios: 7, largoMm: null }],
    })
    expect(caso.instrumental[0].orificios).toBe(7)
    expect(caso.instrumental[0].largoMm).toBeNull()
  })

  it('la migración solo añade las dos columnas', () => {
    const carpeta = join(process.cwd(), 'src', 'migrations')
    const nombre = readdirSync(carpeta)
      .sort()
      .find((n) => n.endsWith('_orificios_y_largo_del_instrumento.ts'))
    expect(nombre).toBeTruthy()
    const texto = readFileSync(join(carpeta, nombre as string), 'utf8')
    expect(texto).toContain('ALTER TABLE "instrumental" ADD COLUMN "orificios" numeric')
    expect(texto).toContain('ALTER TABLE "instrumental" ADD COLUMN "largo_mm" numeric')
    // Solo añade: nada que borrar ni reescribir en el `up`.
    const subida = texto.slice(texto.indexOf('export async function up'), texto.indexOf('export async function down'))
    expect(subida).not.toMatch(/(UPDATE|DELETE|DROP)/)
  })
})
