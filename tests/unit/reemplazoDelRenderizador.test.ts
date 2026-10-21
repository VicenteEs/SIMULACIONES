import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ESPERA_ANTES_DE_REEMPLAZAR_EL_RENDERIZADOR_MS, ESPERA_ANTES_DE_OFRECER_MS, ESPERA_PARA_REMONTAR_SOLO_MS } from '@/lib/controlDelContexto'

/**
 * Perder el contexto gráfico no puede costar lo hecho en el simulador (petición del dueño: «no quiero perder nada, a no ser que yo lo saque»). El remedio es **cambiar solo el
 * renderizador** y conservar la escena; montar de nuevo todo el lienzo —que la vacía— es el último recurso.
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
const lienzo = leer('src/components/simulador/LienzoQuirurgico.tsx')
const consola = leer('src/components/simulador/ConsolaQuirurgica.tsx')

describe('los tiempos del contexto perdido', () => {
  it('se cambia el renderizador antes de ofrecer el botón y mucho antes del remonte entero', () => {
    expect(ESPERA_ANTES_DE_REEMPLAZAR_EL_RENDERIZADOR_MS).toBeGreaterThanOrEqual(2000)
    expect(ESPERA_ANTES_DE_REEMPLAZAR_EL_RENDERIZADOR_MS).toBeLessThan(ESPERA_ANTES_DE_OFRECER_MS)
    expect(ESPERA_ANTES_DE_OFRECER_MS).toBeLessThan(ESPERA_PARA_REMONTAR_SOLO_MS)
  })
})

describe('el lienzo cambia el renderizador conservando la escena', () => {
  it('el renderizador es una variable que se reemplaza, con la misma escena', () => {
    expect(lienzo).toContain('let render = new THREE.WebGLRenderer')
    expect(lienzo).toContain('reemplazarElRenderizador = () =>')
    expect(lienzo).toContain('controles.connect(nuevo.domElement)')
  })

  it('los manejadores de puntero cuelgan de la superficie estable y no del lienzo que se reemplaza', () => {
    expect(lienzo).not.toMatch(/render\.domElement\.addEventListener\('(pointer|wheel|contextmenu|keydown)/)
    expect(lienzo).toContain("superficie.addEventListener('pointerdown'")
    // Los dos del contexto sí van en el lienzo: no suben por el documento.
    expect(lienzo).toContain("lienzoNuevo.addEventListener('webglcontextlost'")
  })

  it('el estudio de reflejos se rehace y se reasigna a los materiales que lo llevaban', () => {
    expect(lienzo).toContain('conReflejo.envMap === entornoViejo')
  })

  it('la consola intenta cambiar el renderizador antes de montar de nuevo el lienzo, tanto sola como con el botón', () => {
    expect(consola.match(/recrearElRenderizador\(\)\) return/g)?.length).toBe(2)
  })

  it('las pérdidas se recuerdan entre visitas para pedirle menos a una tarjeta que ya falló', () => {
    expect(lienzo).toContain("'traumahub:perdidas-de-contexto'")
    expect(lienzo).toContain('guardarLasPerdidas(perdidasDeContexto)')
  })
})
