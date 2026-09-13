import { describe, it, expect } from 'vitest'
import { escribirGlb, nombreDeNodo, type ObjetoParaGlb } from '@/lib/glb'
import {
  agruparParaGlb,
  colorDeGltf,
  piezasDeLaPreparacion,
  recortarLaPiel,
  type PiezaLeida,
} from '@/lib/exportarAtlas'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'

/**
 * La exportación de una preparación del atlas a un modelo de caso.
 *
 * Todo lo que se prueba aquí falla en silencio si está mal: una malla con los
 * índices sin correr se abre perfectamente y enseña triángulos cosidos al azar,
 * y un nombre de nodo que no coincide con el que three.js pone al cargar deja
 * una capa que no se enciende nunca y ningún error que lo explique.
 */

/** Un cuadrado suelto, con sus índices empezando en cero como en el atlas. */
const pieza = (id: string, sistema: string, desplazamiento = 0): PiezaLeida => ({
  id,
  nombre: id,
  sistema,
  posiciones: new Float32Array([
    desplazamiento, 0, 0,
    desplazamiento + 1, 0, 0,
    desplazamiento + 1, 1, 0,
    desplazamiento, 1, 0,
  ]),
  normales: new Int16Array([0, 0, 32767, 0, 0, 32767, 0, 0, 32767, 0, 0, 32767]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
})

describe('agrupar para exportar', () => {
  it('funde por sistema y corre los índices de cada pieza', () => {
    // Los índices del atlas son locales a su pieza. Al pegar la segunda detrás
    // de la primera hay que sumarles cuántos vértices llevaba la anterior. Sin
    // eso el archivo es válido y la malla sale cosida al azar.
    const objetos = agruparParaGlb([pieza('a', 'esqueleto'), pieza('b', 'esqueleto', 2)])
    expect(objetos).toHaveLength(1)
    expect(objetos[0].nombre).toBe('esqueleto')
    expect(objetos[0].posiciones).toHaveLength(24)
    expect([...objetos[0].indices]).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  })

  it('las piezas protagonistas salen sueltas y con su nombre', () => {
    // Son las que el médico va a nombrar en el caso: la que se rompe y la que
    // se reduce. Fundidas con su sistema no se podrían mover por separado.
    const objetos = agruparParaGlb(
      [pieza('Right tibia', 'esqueleto'), pieza('otro hueso', 'esqueleto', 2)],
      { protagonistas: ['Right tibia'] },
    )
    expect(objetos.map((o) => o.nombre)).toEqual(['Right tibia', 'esqueleto'])
    expect([...objetos[0].indices]).toEqual([0, 1, 2, 0, 2, 3])
  })

  it('no funde todo en un objeto: cada sistema es el suyo', () => {
    const objetos = agruparParaGlb([
      pieza('a', 'esqueleto'),
      pieza('b', 'muscular'),
      pieza('c', 'esqueleto', 2),
    ])
    expect(objetos.map((o) => o.nombre).sort()).toEqual(['esqueleto', 'muscular'])
  })

  it('un sistema que se queda sin piezas no escribe un objeto vacío', () => {
    // Si la única pieza de un sistema es la protagonista, ese sistema no tiene
    // nada que fundir. Un nodo vacío sería una capa que el médico puede
    // encender y que no enseña nada.
    const objetos = agruparParaGlb([pieza('Right tibia', 'esqueleto')], {
      protagonistas: ['Right tibia'],
    })
    expect(objetos.map((o) => o.nombre)).toEqual(['Right tibia'])
  })

  it('el color del sistema llega al material, y sin color no se rompe', () => {
    expect(colorDeGltf('#12509e')).toEqual([18 / 255, 80 / 255, 158 / 255, 1])
    expect(colorDeGltf(undefined)).toEqual([0.8, 0.8, 0.8, 1])
    expect(colorDeGltf('rojo')).toEqual([0.8, 0.8, 0.8, 1])
  })
})

describe('recortar la piel', () => {
  // Objetos escritos a mano, con el rol puesto, para que las cuentas se puedan
  // hacer en la cabeza. La prueba con una piel de verdad, de miles de vértices,
  // está en `exportarAlSimulador.test.ts`.
  const hueso: ObjetoParaGlb = {
    nombre: 'hueso',
    posiciones: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normales: new Int16Array(12),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    color: [1, 1, 1, 1],
    extras: { rol: 'hueso', etiqueta: 'Hueso' },
  }

  it('compacta los vértices y reindexa, y cada índice sigue apuntando al suyo', () => {
    // Una tira de seis vértices: el 0 y el 5 quedan a 4 m del hueso. Solo los
    // dos triángulos del medio tienen sus tres vértices dentro de la zona.
    const piel: ObjetoParaGlb = {
      nombre: 'piel',
      posiciones: new Float32Array([
        5, 0, 0, // 0, fuera
        0, 0, 0, // 1
        1, 0, 0, // 2
        0, 1, 0, // 3
        1, 1, 0, // 4
        5, 1, 0, // 5, fuera
      ]),
      // Cada normal distinta, para ver que viaja con su vértice.
      normales: new Int16Array([0, 0, 10, 0, 0, 11, 0, 0, 12, 0, 0, 13, 0, 0, 14, 0, 0, 15]),
      indices: new Uint32Array([0, 1, 3, 1, 2, 3, 2, 4, 3, 2, 5, 4]),
      color: [1, 1, 1, 1],
      extras: { rol: 'piel', etiqueta: 'Piel' },
    }
    const { objetos, recortada, fuera } = recortarLaPiel([hueso, piel])
    expect([recortada, fuera]).toEqual([true, []])
    const recortado = objetos[1]
    // Los vértices 1, 2, 3 y 4 pasan a ser 0, 1, 2 y 3, en su orden.
    expect([...recortado.posiciones]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])
    expect([...recortado.normales]).toEqual([0, 0, 11, 0, 0, 12, 0, 0, 13, 0, 0, 14])
    expect([...recortado.indices]).toEqual([0, 1, 2, 1, 3, 2])
    // El hueso no se toca, ni se copia.
    expect(objetos[0]).toBe(hueso)
    // Y la piel que entró sigue entera: el recorte es una copia.
    expect(piel.indices).toHaveLength(12)
  })

  it('un índice que apunta a un vértice que no existe descarta su triángulo', () => {
    // Sin la guarda, `posiciones[99 * 3]` es undefined, ninguna comparación con
    // undefined es cierta, y el vértice fantasma contaría como dentro.
    const piel: ObjetoParaGlb = {
      nombre: 'piel',
      posiciones: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normales: new Int16Array(9),
      indices: new Uint32Array([0, 1, 2, 0, 1, 99]),
      color: [1, 1, 1, 1],
      extras: { rol: 'piel', etiqueta: 'Piel' },
    }
    const [, recortado] = recortarLaPiel([hueso, piel]).objetos
    expect([...recortado.indices]).toEqual([0, 1, 2])
  })

  it('una piel que se queda sin triángulos no se escribe, y su etiqueta sale en «fuera»', () => {
    const lejos: ObjetoParaGlb = {
      nombre: 'Hair of head',
      posiciones: new Float32Array([0, 9, 0, 1, 9, 0, 0, 10, 0]),
      normales: new Int16Array(9),
      indices: new Uint32Array([0, 1, 2]),
      color: [1, 1, 1, 1],
      extras: { rol: 'piel', etiqueta: 'Pelo de la cabeza' },
    }
    const { objetos, recortada, fuera } = recortarLaPiel([hueso, lejos])
    expect(objetos).toEqual([hueso])
    expect([recortada, fuera]).toEqual([true, ['Pelo de la cabeza']])
  })

  it('sin nada que no sea piel no hay zona, y no se recorta', () => {
    const soloPiel = agruparParaGlb([pieza('Skin', 'integumentary'), pieza('otra', 'integumentary', 40)])
    const resultado = recortarLaPiel(soloPiel)
    expect(resultado.objetos).toBe(soloPiel)
    expect(resultado.recortada).toBe(false)
  })
})

describe('las piezas que la preparación nombra', () => {
  const catalogo = {
    piezas: [
      { id: 'FJ1383', nombre: 'Right tibia' },
      { id: 'FJ1384', nombre: 'Right fibula' },
    ] as unknown as PiezaDelAtlas[],
  } as CatalogoDelAtlas

  it('las encuentra en el orden de la preparación', () => {
    const { encontradas, perdidas } = piezasDeLaPreparacion(catalogo, ['FJ1384', 'FJ1383'])
    expect(encontradas.map((p) => p.nombre)).toEqual(['Right fibula', 'Right tibia'])
    expect(perdidas).toEqual([])
  })

  it('las que ya no existen se devuelven aparte, no desaparecen', () => {
    // Si el atlas se regenera y cambian los identificadores, exportar de menos
    // sin decirlo es entregar una pierna a la que le falta un hueso.
    const { encontradas, perdidas } = piezasDeLaPreparacion(catalogo, ['FJ1383', 'FJ9999'])
    expect(encontradas).toHaveLength(1)
    expect(perdidas).toEqual(['FJ9999'])
  })
})

describe('el nombre con el que llega a la escena', () => {
  it('es el que three.js pone al cargar, no el que se escribe', () => {
    // three cambia los espacios por guiones bajos y borra corchetes, puntos,
    // dos puntos y barras. Escribir «Right tibia» en el caso dejaría una pieza
    // que no se enciende y ningún error que lo explique.
    expect(nombreDeNodo('Right tibia')).toBe('Right_tibia')
    expect(nombreDeNodo('Tejido conectivo')).toBe('Tejido_conectivo')
    expect(nombreDeNodo('L5/S1.disco')).toBe('L5S1disco')
    expect(nombreDeNodo('tibia_distal')).toBe('tibia_distal')
  })
})

describe('el archivo que sale', () => {
  const objetos: ObjetoParaGlb[] = agruparParaGlb(
    [pieza('Right tibia', 'esqueleto'), pieza('musculo', 'muscular')],
    { protagonistas: ['Right tibia'] },
  )

  it('es un glTF binario válido', () => {
    const glb = escribirGlb(objetos, 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    expect(String.fromCharCode(...glb.slice(0, 4))).toBe('glTF')
    expect(vista.getUint32(4, true)).toBe(2)
    // La longitud declarada en la cabecera es la del archivo entero.
    expect(vista.getUint32(8, true)).toBe(glb.byteLength)
  })

  it('lleva los dos bloques, el JSON primero', () => {
    const glb = escribirGlb(objetos, 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const largoJson = vista.getUint32(12, true)
    expect(vista.getUint32(16, true)).toBe(0x4e4f534a)
    expect(vista.getUint32(20 + largoJson, true)).toBeGreaterThan(0)
    expect(vista.getUint32(24 + largoJson, true)).toBe(0x004e4942)
  })

  it('los nombres van saneados dentro del archivo', () => {
    const glb = escribirGlb(objetos, 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const largoJson = vista.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + largoJson)))
    // El esqueleto no sale como nodo porque su única pieza es la protagonista:
    // un sistema que se queda sin piezas no escribe un objeto vacío.
    expect(json.nodes.map((n: { name: string }) => n.name)).toEqual([
      'Right_tibia',
      'muscular',
    ])
    // Un nodo, una malla, una primitiva: con más de una, el cargador de three
    // hace un grupo cuyas mallas hijas llevan otro nombre y no se pueden
    // encender por nombre nunca.
    for (const malla of json.meshes) expect(malla.primitives).toHaveLength(1)
  })

  it('los índices se declaran de 32 bits', () => {
    // Con 16 bits, una selección de más de 65.535 vértices da una malla rota de
    // un modo dificilísimo de diagnosticar: el archivo es válido y abre.
    const glb = escribirGlb(objetos, 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const largoJson = vista.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + largoJson)))
    const deIndices = json.meshes.map(
      (m: { primitives: { indices: number }[] }) => json.accessors[m.primitives[0].indices],
    )
    for (const a of deIndices) expect(a.componentType).toBe(5125)
  })

  it('las normales de 16 bits se declaran normalizadas', () => {
    const glb = escribirGlb(objetos, 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const largoJson = vista.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + largoJson)))
    const normal = json.accessors[json.meshes[0].primitives[0].attributes.NORMAL]
    expect(normal.componentType).toBe(5122)
    expect(normal.normalized).toBe(true)
  })

  it('cada accessor empieza en múltiplo de cuatro', () => {
    // Sin esa alineación hay lectores que se niegan a abrir el archivo y otros
    // que lo abren torcido, que es peor.
    const glb = escribirGlb(objetos, 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const largoJson = vista.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + largoJson)))
    for (const v of json.bufferViews) expect(v.byteOffset % 4).toBe(0)
  })

  it('el accessor de posiciones declara su caja, que glTF exige', () => {
    const glb = escribirGlb(objetos, 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const largoJson = vista.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + largoJson)))
    const posicion = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]
    expect(posicion.min).toEqual([0, 0, 0])
    expect(posicion.max).toEqual([1, 1, 0])
  })

  it('un objeto sin vértices no escribe infinitos, que no son JSON', () => {
    const vacio: ObjetoParaGlb = {
      nombre: 'vacio',
      posiciones: new Float32Array(0),
      normales: new Int16Array(0),
      indices: new Uint32Array(0),
      color: [1, 1, 1, 1],
    }
    const glb = escribirGlb([vacio], 'prueba')
    const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const largoJson = vista.getUint32(12, true)
    const texto = new TextDecoder().decode(glb.slice(20, 20 + largoJson))
    expect(texto).not.toContain('Infinity')
    expect(() => JSON.parse(texto)).not.toThrow()
  })
})
