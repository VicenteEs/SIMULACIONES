import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import {
  ajustarLadoDeLaFluoroscopia,
  prepararFluoroscopia,
  reiniciarLaFluoroscopia,
  revelarLaToma,
  soltarFluoroscopia,
  tomarFluoroscopia,
  type TallerDeFluoroscopia,
} from '@/components/simulador/radiografiaEnLaEscena'
import {
  MODOS_DE_ESCOPIA,
  ajustesGuardadosDeLaImagen,
  guardarAjustesDeLaImagen,
  guardarModoDeEscopia,
  modoGuardadoDeEscopia,
} from '@/components/simulador/ajustesDeLaImagen'
import { AJUSTES_DE_LA_IMAGEN_POR_OMISION } from '@/lib/radiografia'

/**
 * La fluoroscopia por disparos (P-003, E2, D-178).
 *
 * Cristóbal pidió un botón «Disparar» —una imagen fija, como en pabellón— como modo por omisión, el vídeo de antes
 * como opción, que las fotos no cuenten como exposición y que los mandos de la imagen cambien cómo se lee sin volver a
 * disparar. Aquí se fija la mitad que se prueba sin tarjeta gráfica: la separación entre toma y revelado, y por
 * dónde corre cada reloj de la consola.
 */

/** Un lienzo 2D de mentira: lo que importa es el tamaño que se le pone y lo que se le pinta. */
function lienzoDeMentira() {
  const pintado: { ancho: number; alto: number }[] = []
  const destino = {
    width: 0,
    height: 0,
    getContext: () => ({
      putImageData: (imagen: { width: number; height: number }) => pintado.push({ ancho: imagen.width, alto: imagen.height }),
    }),
  }
  return { destino: destino as unknown as HTMLCanvasElement, pintado, medida: () => ({ ancho: destino.width, alto: destino.height }) }
}

describe('toma y revelado', () => {
  let f: TallerDeFluoroscopia

  beforeEach(() => {
    // `ImageData` es del navegador: aquí basta con que guarde lo que se le da.
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    )
    f = prepararFluoroscopia(8)
  })
  afterEach(() => {
    soltarFluoroscopia(f)
    vi.unstubAllGlobals()
  })

  it('sin toma no hay nada que revelar', () => {
    const { destino, pintado } = lienzoDeMentira()
    expect(revelarLaToma(f, destino)).toBe(false)
    expect(pintado).toHaveLength(0)
  })

  it('revela la última toma con el lado de esa toma, y solo vuelve a pintar si cambian los ajustes', () => {
    f.toma = { cuadro: 3, lado: 8 }
    const { destino, pintado, medida } = lienzoDeMentira()
    expect(revelarLaToma(f, destino)).toBe(true)
    expect(medida()).toEqual({ ancho: 8, alto: 8 })
    // Los mismos ajustes: nada que repintar.
    expect(revelarLaToma(f, destino)).toBe(false)
    expect(revelarLaToma(f, destino, { kv: 70, contraste: 1, brillo: 0, filtro: 'ninguno' })).toBe(false)
    // Otros kilovoltios, otro contraste u otro filtro: se vuelve a leer la misma toma.
    expect(revelarLaToma(f, destino, { kv: 100 })).toBe(true)
    expect(revelarLaToma(f, destino, { kv: 100, contraste: 1.5 })).toBe(true)
    expect(revelarLaToma(f, destino, { kv: 100, contraste: 1.5, filtro: 'bordes' })).toBe(true)
    expect(pintado).toHaveLength(4)
    // Forzar repinta aunque nada haya cambiado.
    expect(revelarLaToma(f, destino, { kv: 100, contraste: 1.5, filtro: 'bordes' }, true)).toBe(true)
  })

  it('unos ajustes absurdos se recortan en vez de romper la imagen', () => {
    f.toma = { cuadro: 1, lado: 8 }
    const { destino } = lienzoDeMentira()
    expect(revelarLaToma(f, destino, { kv: Number.NaN, contraste: 99, brillo: -9, filtro: 'x' as never })).toBe(true)
  })

  it('cambiar el tamaño del búfer deja sin toma: la de antes ya no está en él', () => {
    f.toma = { cuadro: 1, lado: 8 }
    f.huellaDelRevelado = 'algo'
    ajustarLadoDeLaFluoroscopia(f, 16)
    expect(f.toma).toBeNull()
    expect(f.huellaDelRevelado).toBe('')
  })

  it('reiniciar la fluoroscopia obliga a la próxima toma y al próximo revelado, aunque nada haya cambiado', () => {
    // Pasó de verdad: apagar y encender, o volver de disparo a vídeo, dejaba un lienzo vacío y una huella que decía
    // «no ha cambiado nada», y el vídeo se quedaba en negro con la escena quieta.
    f.huella = 'proyección|zoom|lado'
    f.huellaDelRevelado = '70|1|0|ninguno'
    f.toma = { cuadro: 2, lado: 8 }
    reiniciarLaFluoroscopia(f)
    expect(f.huella).toBe('')
    expect(f.huellaDelRevelado).toBe('')
    expect(f.toma).toBeNull()
    // Sin fluoroscopia preparada no hace nada y no falla.
    expect(() => reiniciarLaFluoroscopia(undefined)).not.toThrow()
  })

  it('no toma nada si la escena no tiene modelo', () => {
    const render = {} as THREE.WebGLRenderer
    const hecha = tomarFluoroscopia(
      render,
      { escena: new THREE.Scene(), rolesAplicados: new Map() },
      f,
      { proyeccion: 'ap', zoom: 1, ejeLargo: 'y', forzar: true },
      0,
      [],
    )
    expect(hecha).toBe(false)
    expect(f.toma).toBeNull()
  })
})

describe('el modo por omisión y lo que corre en cada modo', () => {
  const consola = readFileSync(resolve(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8').replace(/\r\n/g, '\n')

  it('el disparo es el primero de la lista y lleva el vídeo como opción', () => {
    expect(MODOS_DE_ESCOPIA.map((m) => m.valor)).toEqual(['disparo', 'video'])
  })

  it('los segundos de exposición solo cuentan en vídeo', () => {
    // Las fotos no cuentan (pedido de Cristóbal): el reloj de los segundos mira el modo.
    expect(consola).toMatch(/const enVideo = fluoroscopiaEncendida && modoDeEscopia === 'video'/)
    expect(consola).toMatch(/if \(!enVideo\) return\n\s+const reloj = window\.setInterval\(\(\) => setSegundosDeEscopia/)
  })

  it('el dibujo continuo solo corre en vídeo: en disparo no hay ningún intervalo de dibujo', () => {
    expect(consola).toMatch(/if \(fluoroscopia === null \|\| modoDeEscopia !== 'video'\) return/)
    // Y el disparo sí hace una toma forzada, que es la única manera de que la imagen cambie en ese modo.
    expect(consola).toMatch(/mando\.current\?\.dispararFluoroscopia\(/)
  })

})

describe('lo que se recuerda en el navegador', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sin almacenamiento —el servidor, una ventana privada— el modo es el disparo y los ajustes los de siempre', () => {
    // En el servidor no hay `window`.
    expect(modoGuardadoDeEscopia()).toBe('disparo')
    expect(ajustesGuardadosDeLaImagen()).toEqual(AJUSTES_DE_LA_IMAGEN_POR_OMISION)
    // Con el almacenamiento bloqueado, `getItem` lanza.
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado')
        },
        setItem: () => {
          throw new Error('bloqueado')
        },
      },
    })
    expect(modoGuardadoDeEscopia()).toBe('disparo')
    expect(ajustesGuardadosDeLaImagen()).toEqual(AJUSTES_DE_LA_IMAGEN_POR_OMISION)
    // Y guardar no rompe la consola.
    expect(() => guardarModoDeEscopia('video')).not.toThrow()
    expect(() => guardarAjustesDeLaImagen({ ...AJUSTES_DE_LA_IMAGEN_POR_OMISION, kv: 90 })).not.toThrow()
  })

  it('recuerda el vídeo si alguien lo eligió, y los ajustes recortados si lo guardado ya no es válido', () => {
    const guardado = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (clave: string) => guardado.get(clave) ?? null,
        setItem: (clave: string, valor: string) => void guardado.set(clave, valor),
      },
    })
    expect(modoGuardadoDeEscopia()).toBe('disparo')
    guardarModoDeEscopia('video')
    expect(modoGuardadoDeEscopia()).toBe('video')
    guardarAjustesDeLaImagen({ kv: 100, contraste: 1.5, brillo: 0.1, filtro: 'bordes' })
    expect(ajustesGuardadosDeLaImagen()).toEqual({ kv: 100, contraste: 1.5, brillo: 0.1, filtro: 'bordes' })
    // Algo escrito a mano, de otra versión o roto, no deja la imagen en un estado imposible.
    guardado.set('traumahub.fluoroscopia.ajustes', JSON.stringify({ kv: 5000, filtro: 'inventado' }))
    expect(ajustesGuardadosDeLaImagen()).toEqual({ ...AJUSTES_DE_LA_IMAGEN_POR_OMISION, kv: 120 })
    guardado.set('traumahub.fluoroscopia.ajustes', '{esto no es json')
    expect(ajustesGuardadosDeLaImagen()).toEqual(AJUSTES_DE_LA_IMAGEN_POR_OMISION)
  })
})
