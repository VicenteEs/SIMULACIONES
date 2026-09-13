import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia del visor del atlas, `src/components/atlas/VisorAtlas.tsx`.
 *
 * Se lee el archivo como texto, igual que en `visor3D.test.ts`, y por la misma
 * razón: el entorno de estas pruebas es `node` y el proyecto no tiene jsdom ni
 * biblioteca de componentes (ver el comentario de `vitest.config.ts`), así que
 * aquí no hay manera de construir un `WebGLRenderer` ni de provocar la pérdida
 * de un contexto. Lo que sí se puede vigilar es el emparejamiento de las dos
 * escuchas, que es donde esto ya se rompió una vez.
 *
 * Lo de aquí abajo no avisa de ninguna manera cuando falta. Un contexto WebGL
 * se pierde sin que la página haga nada —el navegador limita cuántos hay vivos
 * y descarta el más antiguo—, y el `onContextLost` interno de three llama a
 * `preventDefault()`, que es justo lo que le pide al navegador que lo DEVUELVA.
 * Escuchar solo la pérdida deja el visor en el peor de los dos mundos: la
 * anatomía vuelve sana y se queda debajo de un cartel opaco —`.atlas-error` es
 * `inset: 16px`, con fondo y sin `pointer-events: none`, o sea que tapa el
 * lienzo entero y se come el ratón— que sigue mandando recargar una página que
 * ya funciona. El escenario se da en el portátil de nadie y en el del residente
 * que recorre varias fichas con anatomía todos los días.
 */

const VISOR = join(process.cwd(), 'src', 'components', 'atlas', 'VisorAtlas.tsx')
const fuente = readFileSync(VISOR, 'utf8')

/** Cuántas veces se registra o se retira una escucha de un suceso dado. */
function veces(texto: string, metodo: 'addEventListener' | 'removeEventListener', suceso: string) {
  return [...texto.matchAll(new RegExp(`\\.${metodo}\\('${suceso}'`, 'g'))].length
}

/** El cuerpo de un manejador escrito como `const <nombre> = () => { … }`. */
function cuerpoDe(nombre: string): string {
  // Corta en la primera línea que solo lleva sangría y `}`: los manejadores de
  // este archivo no tienen bloques anidados que cierren así.
  const casa = fuente.match(new RegExp(`const ${nombre} = \\(\\) => \\{([\\s\\S]*?)\\n\\s*\\}`))
  expect(casa, `no se encontró el manejador \`${nombre}\``).not.toBeNull()
  return casa![1]
}

describe('el visor del atlas cuando el navegador le quita el contexto', () => {
  it('escucha la pérdida, que es lo único que distingue el fallo de una ficha rota', () => {
    // Sin esto queda un rectángulo blanco con `progreso` a 100 y sin error,
    // idéntico a una ficha que de verdad no cargó.
    expect(veces(fuente, 'addEventListener', 'webglcontextlost')).toBeGreaterThan(0)
  })

  it('escucha también la recuperación, una por cada pérdida', () => {
    const perdidas = veces(fuente, 'addEventListener', 'webglcontextlost')
    expect(veces(fuente, 'addEventListener', 'webglcontextrestored')).toBe(perdidas)
  })

  it('retira las dos al desmontar, no solo la de la pérdida', () => {
    // La limpieza acaba en `forceContextLoss()`, que dispara los dos sucesos
    // sobre un componente que ya no está montado. La que se quede puesta
    // llamaría a `setError` fuera del ciclo de vida.
    expect(veces(fuente, 'removeEventListener', 'webglcontextlost')).toBe(
      veces(fuente, 'addEventListener', 'webglcontextlost'),
    )
    expect(veces(fuente, 'removeEventListener', 'webglcontextrestored')).toBe(
      veces(fuente, 'addEventListener', 'webglcontextrestored'),
    )
  })

  it('deja un camino de vuelta del aviso a `null`', () => {
    // El aviso tapa el lienzo entero. Si nadie lo retira, recuperar el contexto
    // empeora la avería en vez de arreglarla.
    const cuerpo = cuerpoDe('alRecuperarContexto')
    expect(cuerpo).toContain('setError')
    expect(cuerpo).toContain('null')
  })

  it('no se lleva por delante un fallo de carga al retirar su aviso', () => {
    // Los dos errores viven en el mismo `error`. Un `setError(null)` a secas
    // borraría también el «no se pudo cargar el atlas» de una ficha que sigue
    // rota, y el visor volvería a quedarse en blanco sin explicación.
    expect(cuerpoDe('alRecuperarContexto')).toContain('AVISO_SIN_ACELERACION')
  })

  it('ensucia el fotograma a mano al recuperar', () => {
    // Este visor dibuja solo cuando algo cambia: con el modelo quieto
    // `controles.update()` devuelve false y el bucle sale sin renderizar. Un
    // contexto recuperado no pinta nada por su cuenta, así que sin esta línea
    // el lienzo se queda en blanco igual, ahora sin ningún aviso que lo diga.
    expect(cuerpoDe('alRecuperarContexto')).toMatch(/sucio = true|pedirDibujo/)
  })
})
