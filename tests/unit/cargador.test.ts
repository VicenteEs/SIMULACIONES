import { describe, it, expect, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { aplicarSeparacion, montarEscena, cargarPaquetes } from '@/atlas/cargador'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/**
 * El motor de carga del atlas.
 *
 * Se prueban tres cosas, y las tres fallaban en silencio, que es la peor
 * manera:
 *
 *  - **La separación pedida antes del primer dibujado.** `onBeforeCompile` no
 *    corre al construir el material sino en el primer `render()` de la malla, y
 *    el visor pide la separación guardada justo después de añadirla a la
 *    escena. Si ese valor no espera en algún sitio, se pierde: una ficha
 *    guardada con el cuerpo separado se abre cerrada, y como el visor de
 *    instancia es de solo lectura no hay manera de corregirlo.
 *  - **El tamaño del paquete descargado.** Los paquetes viajan con
 *    `Content-Encoding: gzip` y los descomprime el navegador. La plataforma va
 *    detrás de un proxy compartido; si ese proxy toca la cabecera, llegan los
 *    bytes comprimidos con un 200 y el fallo sale mucho más tarde como un
 *    `RangeError` en inglés.
 *  - **Que la escena no retenga los paquetes.** Son 57 MB descomprimidos.
 */

// ------------------------------------------------------------------ atlas falso

/**
 * Un paquete con la forma que produce `scripts/atlas/preparar.mjs`: posiciones,
 * normales e índices seguidos, y los desplazamientos en bytes en el catálogo.
 * `pos` e `idx` han de ser múltiplos de 4 y `nor` de 2, o las vistas tipadas
 * que construye `montarEscena` lanzan al montar.
 */
function atlasDePrueba(): { catalogo: CatalogoDelAtlas; bufer: ArrayBuffer } {
  const bufer = new ArrayBuffer(68)
  new Float32Array(bufer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
  new Int16Array(bufer, 36, 9).set([0, 0, 32767, 0, 0, 32767, 0, 0, 32767])
  new Uint32Array(bufer, 56, 3).set([0, 1, 2])

  const catalogo: CatalogoDelAtlas = {
    version: 'prueba-cargador',
    fuente: 'BodyParts3D 4.0',
    licencia: 'CC BY 4.0',
    sujeto: 'Prueba',
    triangulos: 1,
    sistemas: [{ id: 'skeletal', nombre: 'Esqueleto', color: '#eeeeee', orden: 1 }],
    regiones: [{ id: 'torax', nombre: 'Tórax', orden: 1 }],
    paquetes: [{ archivo: 'cuerpo-0.bin.gz', bytes: 68, bytesComprimido: 30 }],
    piezas: [
      {
        id: 'p1',
        nombre: 'Right tibia',
        fma: 'FMA-1',
        sistema: 'skeletal',
        region: 'torax',
        origenRegion: 'anatomia',
        paquete: 0,
        pos: 0,
        nor: 36,
        idx: 56,
        vertices: 3,
        indices: 3,
        caja: [
          [0, 0, 0],
          [1, 1, 0],
        ],
      },
    ],
  }
  return { catalogo, bufer }
}

/** Lo que three le pasa a `onBeforeCompile` en el primer dibujado de la malla. */
interface SombreadorFalso {
  uniforms: Record<string, { value: unknown }>
  vertexShader: string
  fragmentShader: string
}

/**
 * Hace lo que hace three en el primer `render()`: llamar a `onBeforeCompile`.
 * Hasta ese momento el material no tiene sombreador, y eso es justo lo que el
 * visor no espera a que ocurra.
 */
function compilar(malla: THREE.Mesh): SombreadorFalso {
  const material = malla.material as THREE.Material
  const sombreador: SombreadorFalso = {
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader:
      'void main() {\n#include <clipping_planes_fragment>\n#include <color_fragment>\n}',
  }
  const alCompilar = material.onBeforeCompile as unknown as (s: SombreadorFalso) => void
  alCompilar(sombreador)
  return sombreador
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// -------------------------------------------------------------- separación

describe('la separación pedida antes del primer dibujado', () => {
  it('llega al uniforme cuando el material se compila después', () => {
    const { catalogo, bufer } = atlasDePrueba()
    const escena = montarEscena(catalogo, new Map([[0, bufer]]))

    // Esta es la secuencia exacta de `VisorAtlas`: montar, añadir a la escena y
    // pedir la separación guardada, todo sin un fotograma por medio. El
    // material todavía no ha pasado por `onBeforeCompile`.
    expect((escena.mallas[0].material as THREE.Material).userData.sombreador).toBeUndefined()
    aplicarSeparacion(escena, 0.4)

    const sombreador = compilar(escena.mallas[0])
    expect(sombreador.uniforms.separacion.value).toBe(0.4)
  })

  it('sigue moviendo el uniforme una vez compilado', () => {
    // El mando del taller: aquí sí hay sombreador y el cambio ha de verse sin
    // recompilar, que es para lo que se guardó.
    const { catalogo, bufer } = atlasDePrueba()
    const escena = montarEscena(catalogo, new Map([[0, bufer]]))
    const sombreador = compilar(escena.mallas[0])

    aplicarSeparacion(escena, 0.75)
    expect(sombreador.uniforms.separacion.value).toBe(0.75)

    aplicarSeparacion(escena, 0)
    expect(sombreador.uniforms.separacion.value).toBe(0)
  })

  it('una recompilación conserva la última separación pedida', () => {
    // three vuelve a compilar el material cuando cambian las luces o se marca
    // `needsUpdate`. Si el uniforme volviera a nacer en 0, el cuerpo se cerraría
    // solo a mitad de sesión.
    const { catalogo, bufer } = atlasDePrueba()
    const escena = montarEscena(catalogo, new Map([[0, bufer]]))
    compilar(escena.mallas[0])
    aplicarSeparacion(escena, 0.6)

    expect(compilar(escena.mallas[0]).uniforms.separacion.value).toBe(0.6)
  })
})

// ------------------------------------------------------- tamaño del paquete

describe('descarga de un paquete', () => {
  const respuesta = (bytes: number) => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(bytes),
  })

  it('acepta el paquete que mide lo que el catálogo declara', async () => {
    const { catalogo } = atlasDePrueba()
    vi.stubGlobal('fetch', async () => respuesta(68))

    const buferes = await cargarPaquetes(catalogo, [0])
    expect(buferes.get(0)?.byteLength).toBe(68)
  })

  it('rechaza el paquete que llega comprimido y dice de quién sospechar', async () => {
    // Es el caso del proxy que recomprime o quita `Content-Encoding: gzip`:
    // llega un 200 con los 30 bytes del gzip crudo en vez de los 68 del
    // paquete. Sin esta comprobación el fallo aparecía dentro de
    // `montarEscena`, como «Invalid typed array length», sin decir qué paquete
    // ni dónde mirar.
    const { catalogo } = atlasDePrueba()
    vi.stubGlobal('fetch', async () => respuesta(30))

    await expect(cargarPaquetes(catalogo, [0])).rejects.toThrow(/cuerpo-0\.bin\.gz/)
    await expect(cargarPaquetes(catalogo, [0])).rejects.toThrow(/Content-Encoding/)
  })

  it('el 404 sigue contándose como 404 y no como tamaño raro', async () => {
    const { catalogo } = atlasDePrueba()
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    }))

    await expect(cargarPaquetes(catalogo, [0])).rejects.toThrow(/404/)
  })
})

// ------------------------------------------------------------- retención

describe('lo que la escena retiene', () => {
  // Solo se puede comprobar con el recolector a mano. Se omite en la tanda
  // normal en vez de inventarse una comprobación indirecta que no distinguiría
  // las dos versiones. Para ejecutarla:
  //   NODE_OPTIONS=--expose-gc npx vitest run tests/unit/cargador.test.ts
  const recolector = (globalThis as unknown as { gc?: () => void }).gc
  const siHayRecolector = typeof recolector === 'function' ? it : it.skip

  siHayRecolector('no se queda con los paquetes descomprimidos', async () => {
    // `liberar` es un cierre del ámbito de `montarEscena` y el visor lo guarda
    // mientras está montado. Si alguna otra función de ese ámbito mira
    // `buferes`, V8 lo mete en el contexto que ambos comparten y la escena pasa
    // a retener los 57 MB de paquetes toda la sesión —y `liberar()` no los
    // recupera, porque el cierre que lo llama ES lo que los retiene.
    const { catalogo, bufer } = atlasDePrueba()

    // El mapa solo existe dentro de esta función, que no tiene cierres: lo
    // único que puede sobrevivirle es lo que se lleve la escena.
    const { escena, testigo } = (() => {
      const buferes = new Map([[0, bufer]])
      return { escena: montarEscena(catalogo, buferes), testigo: new WeakRef(buferes) }
    })()

    // Desenrollar la pila antes de recolectar: si no, el marco de la prueba
    // todavía puede estar sujetando el mapa y la comprobación mentiría.
    await new Promise((sigue) => setTimeout(sigue, 0))
    recolector!()
    recolector!()

    expect(testigo.deref()).toBeUndefined()
    // Después del recolector, para que la escena siga viva mientras se mira el
    // testigo: si se la dejara morir antes, el mapa desaparecería de todos
    // modos y la prueba pasaría sin comprobar nada.
    expect(escena.mallas).toHaveLength(1)
  })
})
