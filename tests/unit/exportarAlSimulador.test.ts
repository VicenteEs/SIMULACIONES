import { describe, it, expect, vi } from 'vitest'

// La tabla se fija a la semilla. Se está llenando, y las pruebas de «lo que no
// tiene traducción» usan nombres de verdad («Right tibialis anterior», «Right
// fibularis brevis») que dejarán de faltar: sin fijarla, esas pruebas se
// romperían el día que la tabla mejore, sin que nada se hubiera roto.
vi.mock('@/atlas/nombres-es.json', () => ({
  default: {
    Skin: 'Piel',
    'Right femur': 'Fémur derecho',
    'Left femur': 'Fémur izquierdo',
    'Right tibia': 'Tibia derecha',
    'Left tibia': 'Tibia izquierda',
    'Right fibula': 'Peroné derecho',
    'Left fibula': 'Peroné izquierdo',
    'Right patella': 'Rótula derecha',
    'Left patella': 'Rótula izquierda',
  },
}))
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { flattenAllFields } from 'payload'
import { escribirGlb } from '@/lib/glb'
import {
  agruparParaGlb,
  avisosDeLaExportacion,
  centrarEnSuCaja,
  nombrarNodos,
  MARGEN_DE_LA_PIEL,
  nombresDelArchivo,
  prepararExportacion,
  recortarLaPiel,
  type PiezaLeida,
} from '@/lib/exportarAtlas'
import {
  agregarPieza,
  propuestaDelNodo,
  propuestasDelModelo,
  rellenarDesdeElModelo,
  ROLES_DE_PIEZA,
  type PiezaEnEdicion,
} from '@/lib/piezasDelCaso'
import { datosDeLosNodos } from '@/components/simulador/LienzoQuirurgico'
import { Cirugias } from '@/collections/Cirugias'

/**
 * El puente entre el atlas y la consola quirúrgica, de punta a punta.
 *
 * El traumatólogo lo pidió así: un modelo que sale de su taller del atlas tiene
 * que llegar al simulador con nombres que entiende y con cada objeto en la capa
 * que le toca, sin escribir a mano cada nodo ni adivinar su papel. Y si deja
 * solo la pierna, el modelo tiene que girar sobre la pierna.
 *
 * Cada tramo de ese puente puede romperse sin un solo error: un nombre con
 * tilde que no casa, un extra que el cargador de three no copia, una fila que
 * se pisa, una pierna que sigue a medio metro del origen. Por eso la última
 * prueba no mira las funciones por separado: escribe un archivo, lo abre con el
 * mismo `GLTFLoader` que usa el navegador y rellena el caso con lo que salga.
 *
 * Solo cuenta con las nueve traducciones de la semilla de `nombres-es.json`.
 */

/** Un cuadrado suelto, con sus índices locales, desplazado en x. */
const pieza = (
  id: string,
  nombre: string,
  sistema: string,
  x = 0,
  fma?: string,
): PiezaLeida => ({
  id,
  nombre,
  sistema,
  fma,
  posiciones: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]),
  normales: new Int16Array([0, 0, 32767, 0, 0, 32767, 0, 0, 32767, 0, 0, 32767]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
})

const NOMBRES_DE_SISTEMA = {
  skeletal: 'Esqueleto',
  muscular: 'Músculos',
  connective: 'Tejido conectivo',
  integumentary: 'Piel',
}

const jsonDe = (glb: Uint8Array) => {
  const vista = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const largo = vista.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + largo)))
}

describe('los nombres del archivo', () => {
  it('los sistemas fundidos se llaman en español, no con su identificador', () => {
    // «skeletal» o «connective» no casaban con nada de lo que el médico usa.
    const { objetos } = prepararExportacion(
      [pieza('a', 'Right femur', 'skeletal'), pieza('b', 'x', 'connective', 2)],
      { nombresDeSistema: NOMBRES_DE_SISTEMA },
    )
    expect(nombresDelArchivo(objetos)).toEqual(['Esqueleto', 'Tejido_conectivo'])
  })

  it('las protagonistas, con su nombre en español y sin tildes en el nodo', () => {
    // El nodo es un identificador que se compara a mano: «Peroné» tecleado
    // puede llegar con la tilde como carácter aparte y no casar. La etiqueta,
    // que es lo que se lee, conserva la tilde.
    const { objetos, piezas } = prepararExportacion(
      [pieza('FJ3366', 'Right fibula', 'skeletal'), pieza('FJ3387', 'Right tibia', 'skeletal', 2)],
      { protagonistas: ['FJ3366'], nombresDeSistema: NOMBRES_DE_SISTEMA },
    )
    expect(nombresDelArchivo(objetos)).toEqual(['Perone_derecho', 'Esqueleto'])
    expect(piezas[0]).toEqual({ nodo: 'Perone_derecho', etiqueta: 'Peroné derecho', rol: 'hueso' })
  })

  it('una estructura sin traducción conserva su nombre original, sin inventar', () => {
    const { piezas } = prepararExportacion([pieza('z', 'Right tibialis anterior', 'muscular')], {
      protagonistas: ['z'],
    })
    expect(piezas).toEqual([
      { nodo: 'Right_tibialis_anterior', etiqueta: 'Right tibialis anterior', rol: 'musculo' },
    ])
  })

  it('dos objetos que chocan no se quedan con el mismo nombre', () => {
    // «Skin» se traduce «Piel», y el sistema tegumentario también se llama
    // «Piel». Con dos nodos iguales, three encuentra siempre el primero y el
    // segundo no se puede encender ni apagar.
    const entrada = [
      pieza('FJ2810', 'Skin', 'integumentary'),
      pieza('otra', 'Nail of right hallux', 'integumentary', 2),
    ]
    const opciones = { protagonistas: ['FJ2810'], nombresDeSistema: NOMBRES_DE_SISTEMA }
    const primera = nombresDelArchivo(prepararExportacion(entrada, opciones).objetos)
    expect(primera).toEqual(['Piel', 'Piel_2'])
    // Estable: exportar otra vez da los mismos nombres, y el caso escrito
    // contra el primer archivo sigue valiendo.
    expect(nombresDelArchivo(prepararExportacion(entrada, opciones).objetos)).toEqual(primera)
  })

  it('el sufijo generado tampoco pisa un nombre que ya existía', () => {
    const objetos = nombrarNodos(
      agruparParaGlb(
        [
          pieza('1', 'Piel', 'integumentary'),
          pieza('2', 'Piel_2', 'integumentary', 2),
          pieza('3', 'Piel', 'integumentary', 4),
        ],
        { protagonistas: ['1', '2', '3'] },
      ),
    )
    const nombres = nombresDelArchivo(objetos)
    expect(new Set(nombres).size).toBe(3)
    expect(nombres).toEqual(['Piel', 'Piel_2', 'Piel_3'])
  })

  it('un nombre que el saneado deja vacío no produce un nodo sin nombre', () => {
    const objetos = nombrarNodos(agruparParaGlb([pieza('p', '...', 'x')], { protagonistas: ['p'] }))
    expect(nombresDelArchivo(objetos)).toEqual(['objeto'])
  })
})

describe('las capas dentro del archivo', () => {
  // La piel va en x = 1, entre la tibia y el músculo, y no a su lado en x = 4:
  // fuera de la caja de lo que no es piel, `recortarLaPiel` la quitaría entera
  // y esta prueba, que mira los extras de las tres capas, se quedaría con dos.
  const { objetos } = prepararExportacion(
    [
      pieza('FJ3387', 'Right tibia', 'skeletal', 0, 'FMA24477'),
      pieza('m', 'Right tibialis anterior', 'muscular', 2),
      pieza('s', 'Skin', 'integumentary', 1),
    ],
    { protagonistas: ['FJ3387'], nombresDeSistema: NOMBRES_DE_SISTEMA },
  )
  const nodos = jsonDe(escribirGlb(objetos, 'prueba')).nodes as {
    name: string
    extras?: Record<string, unknown>
  }[]

  it('cada nodo lleva su rol, su etiqueta con tildes y su sistema', () => {
    expect(nodos.map((n) => [n.name, n.extras?.rol, n.extras?.etiqueta, n.extras?.sistema])).toEqual([
      ['Tibia_derecha', 'hueso', 'Tibia derecha', 'skeletal'],
      ['Musculos', 'musculo', 'Músculos', 'muscular'],
      ['Piel', 'piel', 'Piel', 'integumentary'],
    ])
  })

  it('las protagonistas guardan el nombre original y el FMA; los fundidos no', () => {
    // La licencia obliga a poder rastrear lo traducido. Un sistema fundido no
    // tiene un único original que citar.
    expect(nodos[0].extras).toMatchObject({ nombreOriginal: 'Right tibia', fma: 'FMA24477' })
    expect(nodos[1].extras).not.toHaveProperty('nombreOriginal')
  })

  it('ningún extra se llama «name», que three reserva para el nombre del nodo', () => {
    for (const n of nodos) expect(n.extras).not.toHaveProperty('name')
  })

  it('un objeto sin extras escribe el nodo como siempre', () => {
    const json = jsonDe(
      escribirGlb(
        [{ ...objetos[0], extras: undefined, nombre: 'tibia_distal' }],
        'prueba',
      ),
    )
    expect(json.nodes[0]).toEqual({ name: 'tibia_distal', mesh: 0 })
  })
})

describe('el centro del archivo', () => {
  it('se centra en la caja de lo que se exporta, no del cuerpo', () => {
    // Una pierna derecha: a un lado y a medio metro de altura en el cuerpo.
    const lejos = (id: string, x: number): PiezaLeida => {
      const p = pieza(id, id, 'skeletal')
      p.posiciones = new Float32Array([x, 0.5, 0.1, x + 0.1, 0.5, 0.1, x + 0.1, 0.9, 0.1, x, 0.9, 0.1])
      return p
    }
    const tibia = lejos('tibia', -0.1)
    const perone = lejos('perone', -0.3)
    const copiaDeLaTibia = [...tibia.posiciones]

    const { objetos, centro } = prepararExportacion([tibia, perone], {
      protagonistas: ['tibia', 'perone'],
    })
    expect(centro.map((v) => Math.round(v * 1000) / 1000)).toEqual([-0.15, 0.7, 0.1])

    const json = jsonDe(escribirGlb(objetos, 'prueba'))
    const cajas = json.meshes.map(
      (m: { primitives: { attributes: { POSITION: number } }[] }) =>
        json.accessors[m.primitives[0].attributes.POSITION],
    )
    // El mínimo y el máximo del accessor son los de después de trasladar.
    const redondo = (v: number[]) => v.map((n) => Math.round(n * 1000) / 1000)
    expect(redondo(cajas[0].min)).toEqual([0.05, -0.2, 0])
    expect(redondo(cajas[0].max)).toEqual([0.15, 0.2, 0])
    expect(redondo(cajas[1].min)).toEqual([-0.15, -0.2, 0])

    // Las piezas siguen en su sitio unas respecto de otras: 20 cm entre las dos.
    expect(cajas[0].min[0] - cajas[1].min[0]).toBeCloseTo(0.2, 5)

    // Y no se escribió sobre las posiciones que entraron.
    expect([...tibia.posiciones]).toEqual(copiaDeLaTibia)
  })

  it('sin vértices no inventa un centro', () => {
    const vacio = {
      nombre: 'vacio',
      posiciones: new Float32Array(0),
      normales: new Int16Array(0),
      indices: new Uint32Array(0),
      color: [1, 1, 1, 1] as [number, number, number, number],
    }
    const { objetos, centro } = centrarEnSuCaja([vacio])
    expect(centro).toEqual([0, 0, 0])
    expect(objetos[0]).toBe(vacio)
  })
})

describe('el taller de piezas rellena solo', () => {
  const propuestas = [
    { nodo: 'Tibia_derecha', rol: 'hueso' as const, etiqueta: 'Tibia derecha' },
    { nodo: 'Esqueleto', rol: 'hueso' as const, etiqueta: 'Esqueleto' },
    { nodo: 'Musculos', rol: 'musculo' as const, etiqueta: 'Músculos' },
  ]

  it('con la lista vacía, añade cada objeto con su nodo, su rol y su etiqueta', () => {
    const { piezas, nuevas } = rellenarDesdeElModelo([], propuestas)
    expect(nuevas).toBe(3)
    expect(piezas).toEqual(propuestas)
  })

  it('no pisa lo que el médico ya escribió', () => {
    const escritas: PiezaEnEdicion[] = [
      { id: 'fila-1', nodo: 'Tibia_derecha', rol: 'fragmento', etiqueta: 'Tibia fracturada' },
      { nodo: 'Musculos', rol: 'piel', etiqueta: '' },
    ]
    const { piezas, nuevas, etiquetadas } = rellenarDesdeElModelo(escritas, propuestas)
    // Su papel y su etiqueta se quedan; la fila conserva también lo que traiga
    // de más, como el identificador de la base.
    expect(piezas[0]).toEqual(escritas[0])
    // El papel tampoco se toca aunque no case con el del modelo; solo se pone
    // la etiqueta que estaba en blanco.
    expect(piezas[1]).toEqual({ nodo: 'Musculos', rol: 'piel', etiqueta: 'Músculos' })
    expect(piezas[2]).toEqual(propuestas[1])
    expect([nuevas, etiquetadas]).toEqual([1, 1])
  })

  it('respeta la regla de un solo fragmento', () => {
    const conFragmento: PiezaEnEdicion[] = [{ nodo: 'placa', rol: 'fragmento', etiqueta: '' }]
    const dosFragmentos = [
      { nodo: 'a', rol: 'fragmento' as const, etiqueta: 'A' },
      { nodo: 'b', rol: 'fragmento' as const, etiqueta: 'B' },
    ]
    expect(rellenarDesdeElModelo(conFragmento, dosFragmentos).piezas.map((p) => p.rol)).toEqual([
      'fragmento',
      'hueso',
      'hueso',
    ])
    expect(rellenarDesdeElModelo([], dosFragmentos).piezas.map((p) => p.rol)).toEqual([
      'fragmento',
      'hueso',
    ])
  })

  it('con todo ya puesto devuelve la misma lista, para poder decirlo', () => {
    const llena = rellenarDesdeElModelo([], propuestas).piezas
    expect(rellenarDesdeElModelo(llena, propuestas).piezas).toBe(llena)
  })

  it('un modelo que no viene del atlas no propone nada y el taller queda igual', () => {
    // Un .glb de Blender: nombres, y en `userData` como mucho el `name` que
    // pone el cargador.
    const deBlender = propuestasDelModelo([
      { nodo: 'tibia_distal', datos: { name: 'tibia_distal' } },
      { nodo: 'piel', datos: {} },
    ])
    expect(deBlender).toEqual([])
    const escritas: PiezaEnEdicion[] = [{ nodo: 'tibia_distal', rol: 'fragmento', etiqueta: '' }]
    expect(rellenarDesdeElModelo(escritas, deBlender).piezas).toBe(escritas)
  })

  it('no acepta un rol que la consola no conoce ni una etiqueta vacía', () => {
    // Una propiedad personalizada de Blender puede llamarse igual y traer
    // cualquier cosa. «Hueso» con mayúscula no casa con ningún filtro.
    expect(propuestaDelNodo('x', { rol: 'Hueso', etiqueta: 'X' })).toBeNull()
    expect(propuestaDelNodo('x', { rol: 'hueso', etiqueta: '  ' })).toBeNull()
    expect(propuestaDelNodo('', { rol: 'hueso', etiqueta: 'X' })).toBeNull()
    expect(propuestaDelNodo('x', { rol: 'hueso', etiqueta: ' X ' })).toEqual({
      nodo: 'x',
      rol: 'hueso',
      etiqueta: 'X',
    })
  })

  it('señalar un objeto del atlas usa su papel, no «fragmento por ser el primero»', () => {
    // En un modelo del atlas, «Esqueleto» es el esqueleto entero en una malla:
    // proponerlo como el fragmento que se arrastra no tiene sentido.
    expect(agregarPieza([], 'Esqueleto', propuestas[1])).toEqual([
      { nodo: 'Esqueleto', rol: 'hueso', etiqueta: 'Esqueleto' },
    ])
    // Sin propuesta, lo de siempre.
    expect(agregarPieza([], 'tibia_distal')[0].rol).toBe('fragmento')
    // Y una propuesta de fragmento con otro ya marcado entra como hueso.
    const conUno: PiezaEnEdicion[] = [{ nodo: 'a', rol: 'fragmento', etiqueta: '' }]
    expect(
      agregarPieza(conUno, 'b', { nodo: 'b', rol: 'fragmento', etiqueta: 'B' })[1].rol,
    ).toBe('hueso')
  })

  it('los cinco papeles son exactamente los del campo del caso', () => {
    // Un papel nuevo en la colección que no estuviera aquí haría que el taller
    // descartara en silencio las propuestas que lo usaran.
    const campo = flattenAllFields({ fields: Cirugias.fields }).find(
      (c) => c.name === 'piezas',
    ) as unknown as
      | { flattenedFields: { name: string; options?: { value: string }[] }[] }
      | undefined
    const rol = campo?.flattenedFields.find((c) => c.name === 'rol')
    expect(rol?.options?.map((o) => o.value)).toEqual([...ROLES_DE_PIEZA])
  })
})

describe('de punta a punta: del exportador al caso, pasando por three', () => {
  it('lo que el archivo trae llega a userData y rellena el caso igual que anuncia la acción', async () => {
    // La piel y la uña, dentro de la caja de lo demás (x de 0 a 5): fuera de
    // ella el recorte las quitaría, y lo que se prueba aquí es el camino de los
    // nombres, «Piel» y «Piel_2» incluidos.
    const { objetos, piezas } = prepararExportacion(
      [
        pieza('FJ3387', 'Right tibia', 'skeletal', 0, 'FMA24477'),
        pieza('FJ3366', 'Right fibula', 'skeletal', 2),
        pieza('m', 'Right tibialis anterior', 'muscular', 4),
        pieza('FJ2810', 'Skin', 'integumentary', 1),
        pieza('u', 'Nail of right hallux', 'integumentary', 3),
      ],
      { protagonistas: ['FJ3387', 'FJ2810'], nombresDeSistema: NOMBRES_DE_SISTEMA },
    )
    const glb = escribirGlb(objetos, 'prueba')

    const gltf = await new GLTFLoader().parseAsync(
      glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer,
      '',
    )

    // Los nombres llegan tal cual se escribieron: ni el saneado de three ni su
    // desambiguación de nombres repetidos los tocan.
    const enLaEscena = datosDeLosNodos(gltf.scene)
    expect(enLaEscena.map((d) => d.nodo)).toEqual(piezas.map((p) => p.nodo))
    expect(enLaEscena.map((d) => d.nodo)).toEqual([
      'Tibia_derecha',
      'Piel',
      'Esqueleto',
      'Musculos',
      'Piel_2',
    ])
    // Y cada nombre encuentra su malla, que es como la consola enciende capas.
    for (const { nodo } of piezas) {
      expect((gltf.scene.getObjectByName(nodo) as THREE.Mesh | undefined)?.isMesh).toBe(true)
    }

    // Lo que rellena el taller es exactamente lo que la acción anuncia.
    const { piezas: filas } = rellenarDesdeElModelo([], propuestasDelModelo(enLaEscena))
    expect(filas).toEqual(piezas)

    // Y el modelo gira sobre lo preparado: el centro de la caja de lo que no es
    // piel está en el origen. La piel no cuenta porque la del atlas es de cuerpo
    // entero (ver `centrarEnSuCaja`); aquí son dos cuadrados y da igual, pero la
    // regla es la misma que se aplica a la de verdad.
    const cajaSinPiel = new THREE.Box3()
    gltf.scene.traverse((objeto) => {
      if ((objeto as THREE.Mesh).isMesh && objeto.userData.rol !== 'piel') {
        cajaSinPiel.expandByObject(objeto)
      }
    })
    expect(cajaSinPiel.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6)
  })
})

describe('la piel de cuerpo entero: no decide el centro y se recorta a la zona', () => {
  /** Un cuadrado con las cuatro esquinas que se le digan, en el plano z = 0. */
  const rectangulo = (
    id: string,
    nombre: string,
    sistema: string,
    [x0, y0, x1, y1]: [number, number, number, number],
  ): PiezaLeida => {
    const p = pieza(id, nombre, sistema)
    p.posiciones = new Float32Array([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0])
    return p
  }

  // Las cajas de verdad del catálogo, redondeadas: la tibia derecha va de 7 a
  // 45 cm de alto; la piel, de los pies a 1,72 m y de un costado al otro.
  const tibia = () => rectangulo('FJ3387', 'Right tibia', 'skeletal', [-0.11, 0.07, -0.03, 0.45])
  const pielPlana = () => rectangulo('FJ2810', 'Skin', 'integumentary', [-0.33, 0, 0.33, 1.72])
  const cejas = () => rectangulo('FJ2812', 'Eyebrow', 'integumentary', [-0.06, 1.61, 0.06, 1.62])

  /*
   * Una piel con geometría de verdad, no un cuadrado: dos tubos de 86 anillos
   * de 16 vértices, de 1,5 cm a 1,715 m de alto, que es lo que hace la piel del
   * atlas alrededor de cada pierna, llegando hasta la cabeza. El PRIMERO es la
   * otra pierna, en x = +12 cm; el segundo rodea la tibia derecha. Así los
   * vértices que se quedan tenían índices a partir de 1.376 y tienen que salir
   * renumerados desde cero: sin compactar y reindexar, la prueba lo ve.
   *
   * La zona es la caja de la tibia con 5 cm: x de −16 a +2 cm, y de 2 a 50 cm,
   * z de −5 a +5 cm. Radio y alturas están elegidos para que ningún vértice
   * caiga justo en el borde, donde decidiría el redondeo de un Float32.
   */
  const SECTORES = 16
  const ANILLOS = 86
  const RADIO = 0.035
  const alturaDelAnillo = (a: number) => 0.015 + 0.02 * a
  const PIERNAS = [
    { x: 0.12, z: 0.01 },
    { x: -0.07, z: 0.01 },
  ]
  const angulo = (s: number) => (2 * Math.PI * s) / SECTORES

  const pielDeCuerpoEntero = (): PiezaLeida => {
    const posiciones: number[] = []
    const normales: number[] = []
    const indices: number[] = []
    PIERNAS.forEach(({ x, z }, pierna) => {
      const base = pierna * ANILLOS * SECTORES
      for (let a = 0; a < ANILLOS; a += 1) {
        for (let s = 0; s < SECTORES; s += 1) {
          const c = Math.cos(angulo(s))
          const n = Math.sin(angulo(s))
          posiciones.push(x + RADIO * c, alturaDelAnillo(a), z + RADIO * n)
          normales.push(Math.round(c * 32767), 0, Math.round(n * 32767))
        }
      }
      for (let a = 0; a < ANILLOS - 1; a += 1) {
        for (let s = 0; s < SECTORES; s += 1) {
          const i0 = base + a * SECTORES + s
          const i1 = base + a * SECTORES + ((s + 1) % SECTORES)
          indices.push(i0, i0 + SECTORES, i1, i1, i0 + SECTORES, i1 + SECTORES)
        }
      }
    })
    return {
      id: 'FJ2810',
      nombre: 'Skin',
      sistema: 'integumentary',
      posiciones: new Float32Array(posiciones),
      normales: new Int16Array(normales),
      indices: new Uint32Array(indices),
    }
  }

  // Lo que tiene que quedar: los anillos 1 a 24 de la pierna derecha (de 3,5 a
  // 49,5 cm), 384 vértices, y las 23 bandas entre ellos, 736 triángulos.
  const PRIMER_ANILLO = 1
  const ANILLOS_DENTRO = 24
  const indicesEsperados = () => {
    const salida: number[] = []
    for (let a = 0; a < ANILLOS_DENTRO - 1; a += 1) {
      for (let s = 0; s < SECTORES; s += 1) {
        const i0 = a * SECTORES + s
        const i1 = a * SECTORES + ((s + 1) % SECTORES)
        salida.push(i0, i0 + SECTORES, i1, i1, i0 + SECTORES, i1 + SECTORES)
      }
    }
    return salida
  }

  const redondo = (v: number[]) => v.map((n) => Math.round(n * 1000) / 1000)

  it('una pierna con su piel se centra en la pierna', () => {
    // Antes la caja era la de todo: con la piel dentro, el centro caía a 86 cm
    // de alto, 60 cm por encima de la tibia, y la pierna volvía a orbitar
    // alrededor del cuerpo que ya no estaba.
    const { objetos, centro, sinLaPiel, pielRecortada, pielFuera } = prepararExportacion(
      [tibia(), pielDeCuerpoEntero(), cejas()],
      { protagonistas: ['FJ3387'], nombresDeSistema: NOMBRES_DE_SISTEMA },
    )
    expect(redondo(centro)).toEqual([-0.07, 0.26, 0])
    expect([sinLaPiel, pielRecortada]).toEqual([true, true])
    // Las cejas se van con el recorte, pero van fundidas con la piel en el
    // mismo objeto, que sigue teniendo triángulos: no es un objeto que se caiga.
    expect(pielFuera).toEqual([])
    expect(nombresDelArchivo(objetos)).toEqual(['Tibia_derecha', 'Piel'])

    const json = jsonDe(escribirGlb(objetos, 'prueba'))
    const caja = (nodo: number) =>
      json.accessors[json.meshes[json.nodes[nodo].mesh].primitives[0].attributes.POSITION]
    // La tibia queda centrada en el origen...
    expect(redondo(caja(0).min)).toEqual([-0.04, -0.19, 0])
    expect(redondo(caja(0).max)).toEqual([0.04, 0.19, 0])
    // ...y la piel se movió exactamente lo mismo, no se recentró por su lado:
    // centrada en sí misma iría de −3,5 a +3,5 cm en z y de −23 a +23 en y.
    expect(redondo(caja(1).min)).toEqual([-0.035, -0.225, -0.025])
    expect(redondo(caja(1).max)).toEqual([0.035, 0.235, 0.045])
  })

  it('la piel sale recortada a la zona: ni la otra pierna, ni el tronco, ni la cabeza', () => {
    const entrada = pielDeCuerpoEntero()
    const copiaDeLaEntrada = [...entrada.indices]
    const { objetos, centro } = prepararExportacion([tibia(), entrada], {
      protagonistas: ['FJ3387'],
      nombresDeSistema: NOMBRES_DE_SISTEMA,
    })
    const piel = objetos.find((o) => o.extras?.rol === 'piel')!

    // De 2.752 vértices y 5.440 triángulos a los de la pierna, y ni uno más.
    expect(entrada.posiciones.length / 3).toBe(2752)
    expect(piel.posiciones.length / 3).toBe(ANILLOS_DENTRO * SECTORES)
    expect(piel.normales.length).toBe(piel.posiciones.length)

    // Compactada y reindexada: los índices empiezan en cero, apuntan todos a
    // un vértice que existe, y no queda un vértice que ningún triángulo use.
    expect([...piel.indices]).toEqual(indicesEsperados())
    expect(Math.max(...piel.indices)).toBe(piel.posiciones.length / 3 - 1)
    expect(new Set(piel.indices).size).toBe(piel.posiciones.length / 3)

    // Y cada índice apunta al vértice QUE ERA: el vértice nuevo n es el anillo
    // PRIMER_ANILLO + n / 16 de la pierna derecha, trasladado con el centro.
    // Un reindexado desplazado cosería triángulos entre anillos que no tocan, y
    // aquí se vería como posiciones que no casan.
    let peorError = 0
    for (let n = 0; n < piel.posiciones.length / 3; n += 1) {
      const a = PRIMER_ANILLO + Math.floor(n / SECTORES)
      const s = n % SECTORES
      const esperado = [
        PIERNAS[1].x + RADIO * Math.cos(angulo(s)) - centro[0],
        alturaDelAnillo(a) - centro[1],
        PIERNAS[1].z + RADIO * Math.sin(angulo(s)) - centro[2],
      ]
      for (let eje = 0; eje < 3; eje += 1) {
        peorError = Math.max(peorError, Math.abs(piel.posiciones[n * 3 + eje] - esperado[eje]))
      }
      // Las normales viajan con su vértice, y en su tipo de 16 bits.
      // (`|| 0` porque Math.round de un coseno de −6e−17 da −0, y un Int16Array
      // no guarda el signo del cero: sin él la prueba fallaría por nada.)
      expect([piel.normales[n * 3], piel.normales[n * 3 + 2]]).toEqual([
        Math.round(Math.cos(angulo(s)) * 32767) || 0,
        Math.round(Math.sin(angulo(s)) * 32767) || 0,
      ])
    }
    expect(peorError).toBeLessThan(1e-6)
    expect(piel.normales).toBeInstanceOf(Int16Array)

    // No se escribió sobre lo que entró.
    expect([...entrada.indices]).toEqual(copiaDeLaEntrada)
  })

  it('el archivo abre con three, con los índices dentro y la caja del accessor igual a la de sus vértices', async () => {
    const { objetos } = prepararExportacion([tibia(), pielDeCuerpoEntero()], {
      protagonistas: ['FJ3387'],
      nombresDeSistema: NOMBRES_DE_SISTEMA,
    })
    const glb = escribirGlb(objetos, 'prueba')
    const json = jsonDe(glb)
    const nodoPiel = json.nodes.findIndex((n: { name: string }) => n.name === 'Piel')
    const accessor =
      json.accessors[json.meshes[json.nodes[nodoPiel].mesh].primitives[0].attributes.POSITION]
    expect(accessor.count).toBe(ANILLOS_DENTRO * SECTORES)

    const gltf = await new GLTFLoader().parseAsync(
      glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer,
      '',
    )
    const malla = gltf.scene.getObjectByName('Piel') as THREE.Mesh
    const posicion = malla.geometry.getAttribute('position')
    const indice = malla.geometry.getIndex()!
    expect(posicion.count).toBe(ANILLOS_DENTRO * SECTORES)
    expect(indice.count).toBe(indicesEsperados().length)
    let mayor = 0
    for (let i = 0; i < indice.count; i += 1) mayor = Math.max(mayor, indice.getX(i))
    expect(mayor).toBeLessThan(posicion.count)

    // Los datos del búfer, leídos por three, tienen la caja que el accessor
    // declara: glTF la exige, y un visor que confía en ella recorta la malla
    // si miente.
    const deLosVertices = new THREE.Box3().setFromBufferAttribute(
      posicion as THREE.BufferAttribute,
    )
    for (let eje = 0; eje < 3; eje += 1) {
      expect(deLosVertices.min.getComponent(eje)).toBeCloseTo(accessor.min[eje], 6)
      expect(deLosVertices.max.getComponent(eje)).toBeCloseTo(accessor.max[eje], 6)
    }
  })

  it('la piel protagonista también se recorta y tampoco cuenta para el centro', () => {
    // «Skin» suelta sale con rol piel igual que fundida: lo que decide es el
    // rol, no si es protagonista.
    const { objetos, centro, sinLaPiel, pielRecortada } = prepararExportacion(
      [tibia(), pielDeCuerpoEntero()],
      { protagonistas: ['FJ3387', 'FJ2810'] },
    )
    expect(redondo(centro)).toEqual([-0.07, 0.26, 0])
    expect([sinLaPiel, pielRecortada]).toEqual([true, true])
    expect(nombresDelArchivo(objetos)).toEqual(['Tibia_derecha', 'Piel'])
    expect(objetos[1].indices).toHaveLength(indicesEsperados().length)
  })

  it('una pieza de piel que queda entera fuera no deja un nodo vacío, y se dice cuál', () => {
    // El pelo de la cabeza marcado como protagonista en una preparación de
    // pierna. Un nodo sin triángulos sería una capa que se enciende y no enseña
    // nada; quitarlo callado, exportar de menos sin decirlo.
    const pelo = rectangulo('FJ2811', 'Hair of head', 'integumentary', [-0.08, 1.52, 0.08, 1.73])
    const { objetos, pielRecortada, pielFuera, sinTraducir } = prepararExportacion(
      [tibia(), pelo, pielDeCuerpoEntero()],
      { protagonistas: ['FJ3387', 'FJ2811'], nombresDeSistema: NOMBRES_DE_SISTEMA },
    )
    expect(nombresDelArchivo(objetos)).toEqual(['Tibia_derecha', 'Piel'])
    expect(pielRecortada).toBe(true)
    expect(pielFuera).toEqual(['Hair of head'])
    // No sale, así que tampoco se avisa de que sale en inglés.
    expect(sinTraducir).toEqual([])
    for (const objeto of objetos) expect(objeto.indices.length).toBeGreaterThan(0)
  })

  it('si todo es piel, la caja es la de todo y no se recorta nada', () => {
    // Sin otra cosa no hay zona: quien exporta solo la piel quiere la piel.
    const { objetos, centro, sinLaPiel, pielRecortada, pielFuera } = prepararExportacion([
      pielPlana(),
      cejas(),
    ])
    expect(redondo(centro)).toEqual([0, 0.86, 0])
    expect([sinLaPiel, pielRecortada, pielFuera]).toEqual([false, false, []])
    expect(objetos[0].posiciones).toHaveLength(8 * 3)
    expect(objetos[0].indices).toHaveLength(12)
  })

  it('sin piel no hay nada que avisar, y el archivo sale byte a byte como antes del recorte', () => {
    const entrada = () => [tibia(), pieza('m', 'Right soleus', 'muscular', 2)]
    const opciones = { protagonistas: ['FJ3387'], nombresDeSistema: NOMBRES_DE_SISTEMA }
    const { objetos, centro, sinLaPiel, pielRecortada, pielFuera } = prepararExportacion(
      entrada(),
      opciones,
    )
    expect([sinLaPiel, pielRecortada, pielFuera]).toEqual([false, false, []])

    // El recorte, sin piel, devuelve la misma lista: ni una copia.
    const agrupados = agruparParaGlb(entrada(), opciones)
    expect(recortarLaPiel(agrupados).objetos).toBe(agrupados)

    // Y el archivo es el que salía por el camino de antes, sin recortar.
    const antes = centrarEnSuCaja(nombrarNodos(agruparParaGlb(entrada(), opciones)))
    expect(centro).toEqual(antes.centro)
    expect(escribirGlb(objetos, 'prueba')).toEqual(escribirGlb(antes.objetos, 'prueba'))
  })

  it('una piel que ya cabe en la zona sale intacta, el mismo objeto', () => {
    // Un parche de piel de 2 cm sobre la tibia: no hay nada que quitar, y
    // copiarlo igual cambiaría el archivo sin razón.
    const parche = rectangulo('p', 'Skin', 'integumentary', [-0.08, 0.2, -0.06, 0.22])
    const agrupados = agruparParaGlb([tibia(), parche], { protagonistas: ['FJ3387'] })
    const { objetos, recortada, fuera } = recortarLaPiel(agrupados)
    expect(objetos).toBe(agrupados)
    expect(objetos[1]).toBe(agrupados[1])
    expect([recortada, fuera]).toEqual([false, []])
  })

  it('el margen es el de MARGEN_DE_LA_PIEL, y la nota dice ese número', () => {
    // Un triángulo de piel que asoma poco más allá del margen y otro que no
    // llega: si alguien cambia el número, esta prueba dice cuál cambió.
    const hueso = rectangulo('h', 'Right tibia', 'skeletal', [0, 0, 0.1, 0.1])
    const cerca = 0.1 + MARGEN_DE_LA_PIEL * 0.9
    const lejos = 0.1 + MARGEN_DE_LA_PIEL * 1.1
    const piel: PiezaLeida = {
      ...pieza('s', 'Skin', 'integumentary'),
      posiciones: new Float32Array([0, 0, 0, cerca, 0, 0, 0, 0.05, 0, lejos, 0.05, 0]),
      normales: new Int16Array(12),
      indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    }
    const { objetos, pielRecortada } = prepararExportacion([hueso, piel], {
      protagonistas: ['h'],
    })
    expect(pielRecortada).toBe(true)
    expect([...objetos[1].indices]).toEqual([0, 1, 2])
    expect(objetos[1].posiciones).toHaveLength(9)
  })

  it('un objeto sin extras cuenta siempre, aunque se llame piel, y no se recorta', () => {
    // Uno escrito a mano no dice su rol; dejarlo fuera de la caja o recortarlo
    // por el nombre sería adivinar.
    const [a] = agruparParaGlb([pielPlana()])
    const sinExtras = { ...a, extras: undefined }
    const { centro, sinLaPiel } = centrarEnSuCaja([sinExtras])
    expect(redondo(centro)).toEqual([0, 0.86, 0])
    expect(sinLaPiel).toBe(false)

    const [t] = agruparParaGlb([tibia()], { protagonistas: ['FJ3387'] })
    const { objetos } = recortarLaPiel([t, sinExtras])
    expect(objetos[1]).toBe(sinExtras)
  })
})

describe('lo que sale en inglés se dice', () => {
  // Solo cuenta con la semilla: «Right tibia» y «Skin» tienen traducción, y
  // «Right fibularis brevis» no la tiene en la semilla.
  it('las protagonistas sin traducción, por su nombre original y sin repetir', () => {
    const { piezas, sinTraducir } = prepararExportacion(
      [
        pieza('FJ3387', 'Right tibia', 'skeletal'),
        pieza('b1', 'Right fibularis brevis', 'muscular', 2),
        pieza('b2', 'Right fibularis brevis', 'muscular', 4),
        // Dentro de la zona: fuera, el recorte la quitaría y la prueba de que
        // «Skin», que sí tiene traducción, no se nombra pasaría sin mirarla.
        pieza('FJ2810', 'Skin', 'integumentary', 1),
      ],
      { protagonistas: ['FJ3387', 'b1', 'b2', 'FJ2810'], nombresDeSistema: NOMBRES_DE_SISTEMA },
    )
    // El nodo sale en inglés, que es justo lo que hay que avisar...
    expect(piezas.map((p) => p.nodo)).toContain('Right_fibularis_brevis')
    expect(piezas.map((p) => p.nodo)).toContain('Piel')
    // ...y la lista lo nombra una vez, por el original que falta en la tabla.
    expect(sinTraducir).toEqual(['Right fibularis brevis'])
  })

  it('las piezas fundidas no cuentan: el objeto se llama como su sistema', () => {
    const { sinTraducir } = prepararExportacion(
      [pieza('b', 'Right fibularis brevis', 'muscular')],
      { nombresDeSistema: NOMBRES_DE_SISTEMA },
    )
    expect(sinTraducir).toEqual([])
  })

  it('un sistema sin nombre en español sí cuenta, por su identificador', () => {
    // Un atlas regenerado con un sistema que el catálogo no nombra.
    const { sinTraducir } = prepararExportacion([pieza('v', 'x', 'venous')], {
      nombresDeSistema: NOMBRES_DE_SISTEMA,
    })
    expect(sinTraducir).toEqual(['venous'])
  })

  it('las notas lo dicen con estas palabras, y callan si no hay nada', () => {
    expect(
      avisosDeLaExportacion({ pielRecortada: false, pielFuera: [], sinTraducir: [] }),
    ).toEqual([])
    expect(
      avisosDeLaExportacion({
        pielRecortada: true,
        pielFuera: ['Pelo de la cabeza'],
        sinTraducir: ['Right fibularis brevis', 'Right anterior tibial vein'],
      }),
    ).toEqual([
      'Sin traducción, se quedan con su nombre original: Right fibularis brevis, Right anterior tibial vein.',
      // Ya no dice que sale entera: dice que se recortó, con qué margen, y que
      // el borde abierto es a propósito.
      'La piel del atlas es de cuerpo entero: se recortó a la zona de lo que se exporta, ' +
        'con 5 cm de margen alrededor, y queda abierta por donde se cortó. ' +
        'El centro se tomó sin ella.',
      'No salen porque quedaban enteras fuera de esa zona: Pelo de la cabeza.',
    ])
  })

  it('una piel recortada sin nada que quede fuera avisa solo del recorte', () => {
    expect(
      avisosDeLaExportacion({ pielRecortada: true, pielFuera: [], sinTraducir: [] }),
    ).toHaveLength(1)
  })
})

describe('quien tenía que llamar, llama', () => {
  const leer = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')
  const TALLER = leer('src', 'components', 'admin', 'formulario', 'TallerDePiezas.tsx')
  const LIENZO = leer('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')

  // Aquí había tres pruebas que leían el texto de la acción `exportarComoModelo`:
  // que llamaba a `prepararExportacion`, que escribía los avisos en las notas y
  // los devolvía, y que leía el catálogo corregido. La lógica salió de la acción
  // a `src/lib/exportarPreparacion.ts` para que un guion la llame sin sesión, y
  // las tres se pusieron rojas sin que la conducta cambiara: vigilaban dónde
  // estaba escrita una línea, no lo que hace. Se quitaron en vez de apuntarlas
  // al archivo nuevo porque la conducta ya se prueba llamando de verdad:
  //  - nombres en español, centrado y catálogo corregido (el peroneo corto en
  //    los músculos): `accionesDelAtlas.test.ts`;
  //  - avisos en la respuesta y en las notas: `avisosDeLaExportacion.test.ts`, y
  //    `exportarConCorte.test.ts` para la piel recortada por la puerta sin
  //    sesión.

  it('el camino entero recorta la piel antes de nombrar y de centrar', () => {
    // Recortar después de nombrar dejaría un «Piel_2» apuntando a un hueco si
    // un objeto de piel se cae; y sin llamarlo, la pierna volvería a llegar
    // dentro de la piel del cuerpo entero.
    const EXPORTADOR = leer('src', 'lib', 'exportarAtlas.ts')
    const camino = EXPORTADOR.slice(EXPORTADOR.indexOf('export function prepararExportacion('))
    expect(camino).toMatch(
      /recortarLaPiel\(agruparParaGlb\(piezas, opciones\)\)[\s\S]*centrarEnSuCaja\(nombrarNodos\(recorte\.objetos\)\)/,
    )
  })

  it('el lienzo expone el userData y el taller lo usa para rellenar', () => {
    expect(LIENZO).toMatch(/datosDeLosNodos: \(\) =>/)
    expect(TALLER).toContain('mando.current?.datosDeLosNodos()')
    expect(TALLER).toContain('rellenarDesdeElModelo(piezas, propuestas)')
    expect(TALLER).toContain('onClick={rellenar}')
    expect(TALLER).toContain('Rellenar desde el modelo')
  })
})
