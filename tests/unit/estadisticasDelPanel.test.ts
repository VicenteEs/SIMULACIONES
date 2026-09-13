import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `admin-panel/estadisticas/page.tsx`: que no vuelva a contestar cero cuando lo
 * que pasa es que no pudo leer.
 *
 * La página tenía cuatro consultas y las cuatro se tragaban la excepción sin
 * dejar rastro: `fechasDeCreacion` con un `catch { return [] }`, y las otras
 * tres con un `.catch(() => ({ docs: [] }))`. El resultado no era una pantalla
 * degradada, era una pantalla que mentía: con la tabla de `actividad` caída
 * decía «0 lecturas registradas» y dibujaba los doce meses a cero, que es una
 * afirmación sobre los residentes y no sobre la base; y sin registrar nada, así
 * que después tampoco se podía saber que había pasado. Es justo el error que
 * `datos.ts` dejó de cometer cuando introdujo `ilegible`.
 *
 * Es una página de servidor que abre Payload, así que no se puede pintar sin
 * base: lo que se comprueba es la fuente. Vale la pena igual, porque el defecto
 * que se vigila tiene exactamente la forma de un descuido —volver a escribir un
 * `.catch(() => [])` porque es más corto— y no falla en ninguna otra parte.
 */

const RUTA = join(
  process.cwd(),
  'src',
  'app',
  '(frontend)',
  'admin-panel',
  'estadisticas',
  'page.tsx',
)
const fuente = readFileSync(RUTA, 'utf8')

/**
 * El archivo sin comentarios. Los de aquí citan el código que explican —el de
 * `leerColeccion` nombra el `[]` que dejó de devolver—, así que sin quitarlos
 * las pruebas de abajo se cumplirían al revés.
 */
const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('las estadísticas del panel', () => {
  it('no se traga ninguna excepción en silencio', () => {
    // `.catch(() => …)` y `catch {` son las dos formas de rendirse sin dejar
    // rastro, y las dos estaban aquí. Se prohíben por escrito porque volver a
    // escribirlas no rompe nada: la página abre igual, con números inventados.
    expect(codigo).not.toMatch(/\.catch\(/)
    expect(codigo).not.toMatch(/catch\s*\{/)
  })

  it('deja el fallo en el registro del servidor', () => {
    // Sin esto, el día que alguien pregunte por qué las cifras bajaron no hay
    // dónde mirar. Es la mitad que más se olvida: el `null` se ve en pantalla,
    // el registro no.
    expect(codigo).toMatch(/console\.error/)
  })

  it('distingue «no hay» de «no se pudo leer»', () => {
    // El sentinela es `null`, no una lista vacía: una lista vacía por excepción
    // llega al marcado indistinguible de una colección de verdad vacía, y desde
    // ahí ya no hay forma de recuperar la diferencia.
    expect(codigo).toMatch(/Promise<Record<string, unknown>\[\] \| null>/)
    expect(codigo).toMatch(/Promise<string\[\] \| null>/)
  })

  it('pinta el guion en lugar del cero de relleno', () => {
    // El mismo guion que usa el resumen del panel para lo ilegible. Si alguien
    // lo cambia por el número, la tarjeta vuelve a afirmar un recuento que no
    // se hizo.
    expect(codigo).toContain("'—'")
  })

  it('avisa arriba de que faltan cuentas por hacer', () => {
    // Las tarjetas sueltas con «—» no bastan: quien mira una pantalla de
    // métricas la lee entera de un vistazo y el guion se confunde con «cero».
    // El aviso de arriba es lo que cambia cómo se leen todos los números.
    expect(codigo).toContain('noSePudoLeer')
    expect(codigo).toContain('admin-aviso-atencion')
  })
})
