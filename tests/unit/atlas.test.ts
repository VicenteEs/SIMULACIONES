import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  armarArbol,
  buscarPiezas,
  indexarPiezas,
  normalizar,
  normalizarSeleccion,
  normalizarVista,
  piezasPerdidas,
  terminosDeBusqueda,
} from '@/atlas/catalogo'
import { MAXIMO_PIEZAS, VISTA_INICIAL, type CatalogoDelAtlas } from '@/atlas/formato'

/**
 * El atlas anatómico.
 *
 * Dos cosas se prueban aquí, y las dos importan por razones distintas:
 *
 *  - **La búsqueda**, porque de ella depende que «tibia derecha» encuentre la
 *    tibia derecha entre 2.234 estructuras. Si falla, el taller es inusable.
 *  - **La normalización de una selección**, porque es la última barrera antes
 *    de la base de datos: lo que llega a una acción de servidor es lo que el
 *    navegador quiso enviar, no lo que la interfaz ofreció.
 */

const RUTA_CATALOGO = resolve(process.cwd(), 'public', 'atlas', 'catalogo.json')

/** El catálogo real, si el atlas está preparado en esta copia del proyecto. */
function catalogoReal(): CatalogoDelAtlas | null {
  try {
    return JSON.parse(readFileSync(RUTA_CATALOGO, 'utf8')) as CatalogoDelAtlas
  } catch {
    return null
  }
}

/** Catálogo mínimo, para lo que debe funcionar sin depender del atlas real. */
const CATALOGO: CatalogoDelAtlas = {
  version: 'prueba-1',
  fuente: 'BodyParts3D 4.0',
  licencia: 'CC BY 4.0',
  sujeto: 'Prueba',
  triangulos: 12,
  sistemas: [
    { id: 'skeletal', nombre: 'Esqueleto', color: '#eee', orden: 1 },
    { id: 'muscular', nombre: 'Músculos', color: '#b55', orden: 2 },
  ],
  regiones: [
    { id: 'miembro-inferior-derecho', nombre: 'Miembro inferior derecho', orden: 1 },
    { id: 'torax', nombre: 'Tórax', orden: 2 },
  ],
  paquetes: [{ archivo: 'cuerpo-0.bin.gz', bytes: 10, bytesComprimido: 5 }],
  piezas: [
    pieza('t1', 'Right tibia', 'skeletal', 'miembro-inferior-derecho'),
    pieza('t2', 'Left tibia', 'skeletal', 'torax'),
    pieza('t3', 'Right anterior tibial artery', 'muscular', 'miembro-inferior-derecho'),
    pieza('t4', 'Right femur', 'skeletal', 'miembro-inferior-derecho'),
  ],
}

function pieza(id: string, nombre: string, sistema: string, region: string) {
  return {
    id,
    nombre,
    fma: `FMA${id}`,
    sistema,
    region,
    origenRegion: 'anatomia' as const,
    paquete: 0,
    pos: 0,
    nor: 0,
    idx: 0,
    vertices: 3,
    indices: 3,
    caja: [
      [0, 0, 0],
      [1, 1, 1],
    ] as [[number, number, number], [number, number, number]],
  }
}

// ------------------------------------------------------------------ búsqueda

describe('búsqueda de estructuras', () => {
  it('quita acentos y mayúsculas para poder comparar', () => {
    expect(normalizar('Fémur Derecho')).toBe('femur derecho')
    expect(normalizar('  Húmero,  izquierdo ')).toBe('humero izquierdo')
  })

  it('traduce los términos que uno piensa en español', () => {
    // Los nombres de las piezas están en su forma anatómica original y no se
    // traducen; sin estas equivalencias, escribir «derecha» no encuentra nada.
    expect(terminosDeBusqueda('tibia derecha')).toEqual(['tibia', 'right'])
    expect(terminosDeBusqueda('peroné izquierdo')).toEqual(['fibula', 'left'])
    expect(terminosDeBusqueda('rodilla')).toEqual(['knee'])
  })

  it('exige que aparezcan todos los términos', () => {
    const resultados = buscarPiezas(CATALOGO, 'tibia derecha')
    const nombres = resultados.map((r) => r.pieza.nombre)
    expect(nombres).toContain('Right tibia')
    expect(nombres).not.toContain('Left tibia')
  })

  it('pone primero la estructura principal y no la arteria que la nombra', () => {
    // «Right tibia» debe ganar a «Right anterior tibial artery»: quien busca
    // una tibia quiere el hueso.
    const [primero] = buscarPiezas(CATALOGO, 'tibia derecha')
    expect(primero.pieza.nombre).toBe('Right tibia')
  })

  it('una consulta que no coincide con nada devuelve nada', () => {
    expect(buscarPiezas(CATALOGO, 'branquia')).toEqual([])
    expect(buscarPiezas(CATALOGO, '')).toEqual([])
  })
})

// --------------------------------------------------------------------- árbol

describe('árbol de navegación', () => {
  it('agrupa por región y anida por sistema', () => {
    const arbol = armarArbol(CATALOGO, 'region')
    const miembro = arbol.find((g) => g.id === 'miembro-inferior-derecho')
    expect(miembro?.total).toBe(3)
    expect(miembro?.ramas.map((r) => r.nombre).sort()).toEqual(['Esqueleto', 'Músculos'])
  })

  it('agrupa por sistema y anida por región', () => {
    const arbol = armarArbol(CATALOGO, 'sistema')
    const esqueleto = arbol.find((g) => g.id === 'skeletal')
    expect(esqueleto?.total).toBe(3)
  })

  it('omite los grupos vacíos en vez de mostrarlos a cero', () => {
    const arbol = armarArbol({ ...CATALOGO, piezas: [CATALOGO.piezas[0]] }, 'region')
    expect(arbol.map((g) => g.id)).toEqual(['miembro-inferior-derecho'])
  })
})

// ---------------------------------------------------------------- selección

describe('normalización de una selección', () => {
  it('acepta identificadores sueltos y objetos con color', () => {
    const r = normalizarSeleccion(CATALOGO, ['t1', { id: 't4', color: '#ff0000' }], null)
    expect(r.piezas).toEqual([{ id: 't1' }, { id: 't4', color: '#ff0000' }])
  })

  it('descarta lo que no existe en el catálogo', () => {
    // Es la barrera de verdad: una acción de servidor es un extremo HTTP.
    const r = normalizarSeleccion(CATALOGO, ['t1', 'inventada', 'otra'], null)
    expect(r.piezas.map((p) => p.id)).toEqual(['t1'])
  })

  it('quita duplicados', () => {
    const r = normalizarSeleccion(CATALOGO, ['t1', 't1', 't1'], null)
    expect(r.piezas).toHaveLength(1)
  })

  it('descarta un color que no sea un color', () => {
    const r = normalizarSeleccion(CATALOGO, [{ id: 't1', color: 'javascript:alert(1)' }], null)
    expect(r.piezas[0]).toEqual({ id: 't1' })
  })

  it('no revienta con basura', () => {
    for (const basura of [null, undefined, 'texto', 42, {}, [null, 7, {}]]) {
      expect(() => normalizarSeleccion(CATALOGO, basura, null)).not.toThrow()
      expect(normalizarSeleccion(CATALOGO, basura, null).piezas).toEqual([])
    }
  })

  it('anota la versión del atlas con la que se guardó', () => {
    expect(normalizarSeleccion(CATALOGO, ['t1'], null).atlas).toBe('prueba-1')
  })

  it('pone techo a la cantidad de piezas', () => {
    const muchas = Array.from({ length: MAXIMO_PIEZAS + 100 }, () => 't1')
    // Con duplicados el techo no se alcanza; con piezas distintas, sí.
    expect(normalizarSeleccion(CATALOGO, muchas, null).piezas.length).toBeLessThanOrEqual(
      MAXIMO_PIEZAS,
    )
  })
})

describe('encuadre guardado', () => {
  it('conserva una cámara válida', () => {
    const v = normalizarVista({ camara: [1, 2, 3], objetivo: [0, 1, 0], separacion: 0.5 })
    expect(v).toEqual({ camara: [1, 2, 3], objetivo: [0, 1, 0], separacion: 0.5 })
  })

  it('sustituye por la de por omisión lo que no sirve', () => {
    expect(normalizarVista({ camara: ['a', 2, 3] }).camara).toEqual(VISTA_INICIAL.camara)
    expect(normalizarVista({ camara: [1, 2] }).camara).toEqual(VISTA_INICIAL.camara)
    expect(normalizarVista(null).objetivo).toEqual(VISTA_INICIAL.objetivo)
  })

  it('acota la separación entre 0 y 1', () => {
    expect(normalizarVista({ separacion: 5 }).separacion).toBe(1)
    expect(normalizarVista({ separacion: -3 }).separacion).toBe(0)
    expect(normalizarVista({ separacion: Number.NaN }).separacion).toBe(0)
  })
})

describe('preparaciones que quedaron desfasadas', () => {
  it('señala las piezas que ya no existen en el catálogo', () => {
    const perdidas = piezasPerdidas(CATALOGO, {
      version: 1,
      atlas: 'otra',
      piezas: [{ id: 't1' }, { id: 'desaparecida' }],
      vista: VISTA_INICIAL,
    })
    expect(perdidas).toEqual(['desaparecida'])
  })
})

// ------------------------------------------------------------ atlas de verdad

describe('el atlas preparado en esta copia del proyecto', () => {
  const catalogo = catalogoReal()
  const siHay = catalogo ? it : it.skip

  siHay('trae las 2.234 piezas de BodyParts3D', () => {
    expect(catalogo!.piezas.length).toBe(2234)
    expect(catalogo!.paquetes.length).toBe(15)
  })

  siHay('no tiene identificadores repetidos', () => {
    // Si se repitieran, una preparación encendería piezas que no eligió nadie.
    expect(indexarPiezas(catalogo!).size).toBe(catalogo!.piezas.length)
  })

  siHay('cada pieza cae en un sistema y una región declarados', () => {
    const sistemas = new Set(catalogo!.sistemas.map((s) => s.id))
    const regiones = new Set(catalogo!.regiones.map((r) => r.id))
    for (const pieza of catalogo!.piezas) {
      expect(sistemas.has(pieza.sistema), `sistema de ${pieza.nombre}`).toBe(true)
      expect(regiones.has(pieza.region), `región de ${pieza.nombre}`).toBe(true)
    }
  })

  siHay('los huesos largos caen en el miembro correcto', () => {
    // Es la comprobación que importa para «quiero operar una tibia»: si la
    // tibia derecha no está en el miembro inferior derecho, el árbol miente.
    const porNombre = new Map(catalogo!.piezas.map((p) => [p.nombre, p]))
    const esperado: Record<string, string> = {
      'Right tibia': 'miembro-inferior-derecho',
      'Left tibia': 'miembro-inferior-izquierdo',
      'Right femur': 'miembro-inferior-derecho',
      'Left femur': 'miembro-inferior-izquierdo',
      'Right humerus': 'miembro-superior-derecho',
      'Left humerus': 'miembro-superior-izquierdo',
      'Right calcaneus': 'pie-derecho',
      'Left calcaneus': 'pie-izquierdo',
    }
    for (const [nombre, region] of Object.entries(esperado)) {
      expect(porNombre.get(nombre)?.region, nombre).toBe(region)
    }
  })

  siHay('los desplazamientos de geometría no se salen del paquete', () => {
    // Un desplazamiento pasado de largo daría una malla rota de un modo muy
    // difícil de diagnosticar en el navegador.
    for (const pieza of catalogo!.piezas) {
      const paquete = catalogo!.paquetes[pieza.paquete]
      expect(paquete, `paquete de ${pieza.nombre}`).toBeDefined()
      expect(pieza.pos + pieza.vertices * 12).toBeLessThanOrEqual(paquete.bytes)
      expect(pieza.nor + pieza.vertices * 6).toBeLessThanOrEqual(paquete.bytes)
      expect(pieza.idx + pieza.indices * 4).toBeLessThanOrEqual(paquete.bytes)
    }
  })

  siHay('los desplazamientos están alineados para leerse como enteros', () => {
    // `new Float32Array(bufer, desplazamiento, …)` lanza si el desplazamiento
    // no es múltiplo de 4. Se comprueba aquí y no en el navegador.
    for (const pieza of catalogo!.piezas) {
      expect(pieza.pos % 4, `posiciones de ${pieza.nombre}`).toBe(0)
      expect(pieza.nor % 2, `normales de ${pieza.nombre}`).toBe(0)
      expect(pieza.idx % 4, `índices de ${pieza.nombre}`).toBe(0)
    }
  })

  siHay('la búsqueda encuentra la tibia derecha en primer lugar', () => {
    const [primero] = buscarPiezas(catalogo!, 'tibia derecha')
    expect(primero?.pieza.nombre).toBe('Right tibia')
  })
})
