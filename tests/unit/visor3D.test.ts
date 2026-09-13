import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia del visor de las fichas, `src/components/Visor3D.tsx`.
 *
 * Se lee el archivo como texto porque el entorno de estas pruebas es `node` y
 * el proyecto no tiene jsdom ni biblioteca de componentes (ver el comentario de
 * `vitest.config.ts`): montar un lienzo de WebGL aquí no es posible. Lo que sí
 * se puede vigilar es lo que ya se rompió una vez y no avisa cuando se vuelve a
 * romper.
 *
 * Y lo de aquí abajo no avisa de ninguna manera. El decodificador de Draco por
 * omisión de drei es el de `gstatic.com`, así que quitar el segundo argumento
 * de `useGLTF` —«sobra», «simplifico la llamada»— deja el visor funcionando
 * perfectamente en el portátil de quien lo escribe y muerto en la red de un
 * hospital que no deja salir a ese dominio. Es la decisión O-036, que ya se
 * tomó una vez para el lienzo de la consola y que este visor se saltó durante
 * meses sin que nada lo dijera.
 */

const VISOR = join(process.cwd(), 'src', 'components', 'Visor3D.tsx')
const fuente = readFileSync(VISOR, 'utf8')

/** Los argumentos de cada `useGLTF(...)`, tal como están escritos. */
function llamadasAUseGLTF(texto: string): string[] {
  // `useGLTF.clear(...)` y `useGLTF.preload(...)` no casan a propósito: aquí
  // solo interesa la llamada que arma el cargador.
  return [...texto.matchAll(/useGLTF\(([^)]*)\)/g)].map((casa) => casa[1])
}

describe('el decodificador del visor de las fichas', () => {
  it('sale de la plataforma y no de un CDN, en todas las llamadas', () => {
    const llamadas = llamadasAUseGLTF(fuente)
    expect(llamadas.length).toBeGreaterThan(0)
    for (const argumentos of llamadas) {
      expect(argumentos).toContain('DECODIFICADOR_DRACO')
    }
  })

  it('se construye con `ruta()`, que es lo que le pone el prefijo', () => {
    // Sin `ruta()` la petición sale sin el prefijo y la atiende otra página del
    // mismo dominio: un 404 que no explica nada, y solo en el servidor.
    expect(fuente).toMatch(/const DECODIFICADOR_DRACO = ruta\('\/draco\/'\)/)
  })

  it('apunta a archivos que están versionados', () => {
    // La ruta puede ser correcta y el directorio estar vacío: el fallo sería el
    // mismo lienzo vacío, y tampoco avisaría.
    const draco = join(process.cwd(), 'public', 'draco')
    expect(existsSync(join(draco, 'draco_wasm_wrapper.js'))).toBe(true)
    expect(existsSync(join(draco, 'draco_decoder.wasm'))).toBe(true)
  })
})

describe('el visor cuando el modelo no se puede abrir', () => {
  it('tiene un límite de error propio', () => {
    // `useGLTF` lanza durante el pintado y el `<Suspense>` no atrapa eso. Sin
    // este límite la excepción sube hasta la frontera por omisión de Next y se
    // lleva la ficha entera: el residente pierde el texto clínico por culpa del
    // recuadro del hueso.
    expect(fuente).toContain('getDerivedStateFromError')
    expect(fuente).toContain('El archivo del modelo no se pudo cargar.')
  })

  it('vacía la caché del cargador antes de reintentar', () => {
    // Sin esto el reintento devuelve la misma promesa rechazada y falla sin
    // llegar a pedir el archivo, con lo que el botón mentiría.
    expect(fuente).toContain('useGLTF.clear(url)')
  })
})

describe('el visor con el teclado', () => {
  it('es un destino de foco, con nombre y con teclas', () => {
    // `OrbitControls` solo escucha puntero y rueda, y fiber no pone `tabIndex`:
    // sin estos cuatro atributos el residente que navega con teclado pasa de
    // largo del bloque y el lector de pantalla no anuncia ni que hay un modelo.
    for (const atributo of ['tabIndex={0}', 'role="img"', 'aria-label=', 'onKeyDown=']) {
      expect(fuente).toContain(atributo)
    }
  })
})
