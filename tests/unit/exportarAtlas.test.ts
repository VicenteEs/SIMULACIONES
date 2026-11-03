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
import referencias from '@/atlas/referenciasDelCuerpo.json'

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

/** El JSON de un glb ya escrito, para mirar qué atributos declara cada malla. */
function jsonDe(glb: Uint8Array) {
  const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const largoJson = vista.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + largoJson)))
}

describe('el color por vértice del archivo (D-227)', () => {
  const cuadrado = (extra: Partial<ObjetoParaGlb> = {}): ObjetoParaGlb => ({
    nombre: 'piel',
    posiciones: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normales: new Int16Array(12),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    color: [1, 1, 1, 1],
    ...extra,
  })

  it('un objeto con colores declara COLOR_0 como bytes normalizados de cuatro componentes', () => {
    const json = jsonDe(escribirGlb([cuadrado({ colores: new Uint8Array(16).fill(200) })], 'prueba'))
    const atributos = json.meshes[0].primitives[0].attributes
    expect(atributos.COLOR_0).toBeDefined()
    const a = json.accessors[atributos.COLOR_0]
    expect([a.componentType, a.type, a.count, a.normalized]).toEqual([5121, 'VEC4', 4, true])
  })

  it('sin colores el archivo es el de siempre, byte a byte', () => {
    const sin = escribirGlb([cuadrado()], 'prueba')
    expect(jsonDe(sin).meshes[0].primitives[0].attributes.COLOR_0).toBeUndefined()
    // Colores de largo equivocado se ignoran en vez de escribir un accessor que el lector rechazaría.
    const torcido = escribirGlb([cuadrado({ colores: new Uint8Array(7) })], 'prueba')
    expect([...torcido]).toEqual([...sin])
  })

  it('los accessors de colores también empiezan en múltiplo de cuatro', () => {
    const json = jsonDe(escribirGlb([cuadrado({ colores: new Uint8Array(16) }), cuadrado({ colores: new Uint8Array(16) })], 'prueba'))
    for (const v of json.bufferViews) expect(v.byteOffset % 4).toBe(0)
  })

  it('la piel y los labios del atlas salen con colores y el resto de su sistema, no', () => {
    const objetos = agruparParaGlb(
      [pieza('Skin', 'integumentary'), pieza('Lip', 'integumentary', 2), pieza('Nail of right hand', 'integumentary', 4)],
      { protagonistas: ['Nail of right hand'] },
    )
    const [uña, fundido] = objetos
    expect(uña.colores).toBeUndefined()
    expect(fundido.colores).toHaveLength((fundido.posiciones.length / 3) * 4)
  })

  it('al fundir, las piezas sin color van en blanco para que multiplicar no cambie nada', () => {
    // La piel, sobre el codo derecho del atlas: en el origen no hay ninguna zona y el tinte saldría blanco.
    const [x, y, z] = referencias['codo-derecho'] as [number, number, number]
    const sobreElCodo: PiezaLeida = {
      ...pieza('Skin', 'integumentary'),
      posiciones: new Float32Array([x, y, z, x + 0.001, y, z, x + 0.001, y + 0.001, z, x, y + 0.001, z]),
      normales: new Int16Array([0, 0, -32767, 0, 0, -32767, 0, 0, -32767, 0, 0, -32767]),
    }
    const objetos = agruparParaGlb([sobreElCodo, pieza('Hair of head', 'integumentary', 2)])
    const colores = objetos[0].colores!
    expect(colores).toHaveLength(8 * 4)
    // El pelo es la segunda pieza: sus cuatro vértices, los últimos, sin tocar.
    expect([...colores.subarray(16)]).toEqual(new Array(16).fill(255))
    // Y la piel del codo sí lleva algo que no es blanco puro.
    expect([...colores.subarray(0, 16)].some((b) => b < 255)).toBe(true)
  })

  it('una pieza que se llama «Skin» pero no es del sistema tegumentario no se pinta', () => {
    const [objeto] = agruparParaGlb([pieza('Skin', 'esqueleto')])
    expect(objeto.colores).toBeUndefined()
  })

  it('la esclera y el iris salen en su objeto, y la córnea en otro, con extras.aspecto', () => {
    const objetos = agruparParaGlb([
      pieza('Left sclera', 'sensory'),
      pieza('Left iris', 'sensory', 2),
      pieza('Left cornea', 'sensory', 4),
      pieza('Left eyeball', 'sensory', 6),
    ])
    const ojos = objetos.find((o) => o.extras?.aspecto === 'ojos')!
    const cornea = objetos.find((o) => o.extras?.aspecto === 'cornea')!
    expect(ojos.posiciones).toHaveLength(2 * 12)
    expect(ojos.colores).toHaveLength(8 * 4)
    expect(ojos.color).toEqual([1, 1, 1, 1])
    // La córnea no lleva colores por vértice (es transparente de una sola pieza) pero sí un alfa casi nulo.
    expect(cornea.colores).toBeUndefined()
    expect(cornea.color[3]).toBeLessThan(0.1)
    // Lo que no es del ojo propiamente sigue en su sistema, sin aspecto.
    expect(objetos.filter((o) => !o.extras?.aspecto).some((o) => o.nombre === 'sensory')).toBe(true)
  })

  it('con las estructuras separadas cada pieza del ojo conserva su aspecto y su color', () => {
    const objetos = agruparParaGlb([pieza('Left iris', 'sensory'), pieza('Left cornea', 'sensory', 2)], { separarEstructuras: true })
    expect(objetos.map((o) => o.extras?.aspecto)).toEqual(['ojos', 'cornea'])
    expect(objetos[0].colores).toHaveLength(16)
    expect(objetos[1].color[3]).toBeLessThan(0.1)
  })

  it('el recorte de la piel arrastra los colores de cada vértice que se queda', () => {
    const hueso: ObjetoParaGlb = cuadrado({ nombre: 'hueso', extras: { rol: 'hueso', etiqueta: 'Hueso' } })
    const colores = new Uint8Array([
      10, 10, 10, 255, // 0, fuera
      20, 20, 20, 255, // 1
      30, 30, 30, 255, // 2
      40, 40, 40, 255, // 3
      50, 50, 50, 255, // 4
      60, 60, 60, 255, // 5, fuera
    ])
    const piel = cuadrado({
      posiciones: new Float32Array([5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 5, 1, 0]),
      normales: new Int16Array(18),
      indices: new Uint32Array([0, 1, 3, 1, 2, 3, 2, 4, 3, 2, 5, 4]),
      colores,
      extras: { rol: 'piel', etiqueta: 'Piel' },
    })
    const recortado = recortarLaPiel([hueso, piel]).objetos[1]
    expect([...recortado.colores!]).toEqual([20, 20, 20, 255, 30, 30, 30, 255, 40, 40, 40, 255, 50, 50, 50, 255])
  })
})
