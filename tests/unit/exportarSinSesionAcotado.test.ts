import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Quién puede llamar a la exportación que no pide sesión.
 *
 * `exportarPreparacion` (src/lib/exportarPreparacion.ts) crea un modelo 3D en la
 * base saltándose los permisos, y es así a propósito: el guion de la pierna
 * derecha la ejecuta en el servidor, sin nadie conectado. Dentro de la
 * aplicación, en cambio, la única puerta legítima es la acción
 * `exportarComoModelo`, que pasa antes por su guardia de editor —y eso lo vigila
 * `tests/unit/accionesConGuardia.test.ts`—.
 *
 * El hueco que cierra esta prueba: `accionesConGuardia` solo mira la carpeta de
 * acciones. Una ruta nueva en `src/app/(frontend)/api/` o cualquier componente
 * de servidor que importara `exportarPreparacion` directamente quedaría abierto
 * a cualquiera, y ninguna otra prueba lo notaría. Por eso se exige que dentro de
 * `src/` solo la importe la acción del atlas. Los guiones de `scripts/` quedan
 * fuera a propósito: corren en el servidor, con acceso a la máquina, y ahí no
 * hay sesión que pedir.
 */

const RAIZ = process.cwd()
const PERMITIDOS = ['src/app/(frontend)/acciones/atlas.ts']

function archivosDe(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivosDe(ruta)
    return /\.(ts|tsx|mts|js|mjs)$/.test(nombre) ? [ruta] : []
  })
}

// Una importación de verdad (estática o dinámica), no una mención en un comentario.
const IMPORTA =
  /(?:from\s+|import\s*\(\s*)['"](?:@\/lib\/exportarPreparacion|(?:\.{1,2}\/)+(?:lib\/)?exportarPreparacion)(?:\.ts)?['"]/

describe('la exportación sin sesión solo se llama desde la acción con guardia', () => {
  const importadores = archivosDe(join(RAIZ, 'src'))
    .filter((ruta) => !ruta.endsWith(join('lib', 'exportarPreparacion.ts')))
    .filter((ruta) => IMPORTA.test(readFileSync(ruta, 'utf8')))
    .map((ruta) => relative(RAIZ, ruta).split('\\').join('/'))

  it('la importa la acción del atlas, que es la que tiene guardia', () => {
    // Si esto fallara, la prueba de abajo pasaría sin vigilar nada: nadie la
    // importaría y la regla de «solo la acción» no comprobaría ningún caso.
    expect(importadores).toContain('src/app/(frontend)/acciones/atlas.ts')
  })

  it('nadie más dentro de src/ la importa', () => {
    const ajenos = importadores.filter((ruta) => !PERMITIDOS.includes(ruta))
    expect(
      ajenos,
      'Estos archivos llaman a la exportación que se salta los permisos. ' +
        'Pásenla por la acción exportarComoModelo, que exige editor:',
    ).toEqual([])
  })
})
