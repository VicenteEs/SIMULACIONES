import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import descripcion from '@/atlas/portada.json'

/**
 * La figura de la portada son dos archivos que genera `scripts/atlas/portada.mjs`
 * y que solo sirven juntos: `public/atlas/portada.bin.gz` y
 * `src/atlas/portada.json`. Si alguien regenera uno, o edita el otro a mano, el
 * navegador pinta un cuerpo deshecho o no pinta nada, y como el componente calla
 * sus errores a propósito —es un adorno— nadie se enteraría.
 */
const RAIZ = process.cwd()
const ARCHIVO = path.join(RAIZ, 'public', 'atlas', 'portada.bin.gz')
const leer = (...ruta: string[]) => readFileSync(path.join(RAIZ, ...ruta), 'utf8')

describe('la figura del cuerpo en la portada', () => {
  const crudo = gunzipSync(readFileSync(ARCHIVO))
  const enteros = new Uint16Array(crudo.buffer, crudo.byteOffset, crudo.byteLength / 2)

  it('el archivo mide lo que la descripción declara', () => {
    const puntos = descripcion.capas.reduce((suma, capa) => suma + capa.puntos, 0)
    expect(crudo.byteLength).toBe(descripcion.bytes)
    expect(crudo.byteLength).toBe(puntos * 3 * 2)
  })

  it('cada capa se desempaqueta dentro de la caja', () => {
    let desde = 0
    for (const capa of descripcion.capas) {
      const n = capa.puntos
      // Las alturas van como diferencias: su suma acumulada no puede pasarse.
      let altura = 0
      for (let i = 0; i < n; i++) altura += enteros[desde + i]
      expect(altura, `altura final de ${capa.nombre}`).toBeLessThanOrEqual(descripcion.pasos)
      for (let i = n; i < 3 * n; i++) {
        if (enteros[desde + i] > descripcion.pasos) {
          throw new Error(`${capa.nombre}: el valor ${i} se sale de los ${descripcion.pasos} pasos`)
        }
      }
      desde += n * 3
    }
  })

  it('mide lo que un ser humano y pesa lo que un adorno', () => {
    const [minimo, maximo] = descripcion.caja
    const alto = maximo[1] - minimo[1]
    expect(alto).toBeGreaterThan(1.5)
    expect(alto).toBeLessThan(2)
    // El motivo de que exista: el atlas entero son 33 MB y solo el esqueleto,
    // 19. Si esto crece, la portada vuelve a costar lo que se quiso evitar.
    expect(statSync(ARCHIVO).size).toBeLessThan(400 * 1024)
  })

  it('el componente lo pide por `ruta()` y con la versión en la dirección', () => {
    const fuente = leer('src', 'components', 'CuerpoDePortada.tsx')
    // Bajo prefijo, un `/atlas/…` a pelo lo atiende la página vecina. Y sin
    // `?v=`, el «immutable» de un año de `next.config.mjs` dejaría la figura
    // vieja en cada navegador que ya la tenga.
    expect(fuente).toContain('ruta(`/atlas/portada.bin.gz?v=${descripcion.version}`)')
    // `three` no entra en el paquete de la portada.
    expect(fuente).toContain("import('three')")
    expect(fuente).not.toMatch(/^import .* from 'three'/m)
    expect(fuente).toContain('prefers-reduced-motion')
  })

  it('la portada la usa y lleva el crédito que exige la licencia', () => {
    const pagina = leer('src', 'app', '(frontend)', 'page.tsx')
    expect(pagina).toContain('<CuerpoDePortada />')
    expect(pagina).toContain('BodyParts3D · CC BY 4.0')
  })
})
