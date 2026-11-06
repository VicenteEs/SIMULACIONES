import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BITS_POR_SEGUNDO,
  cuadrosDeLaDescripcion,
  cuadrosDelTexto,
  disponerElCuadro,
  duracionLegible,
  extensionDelFormato,
  formatoDeGrabacion,
  gradienteDelFondo,
  hayQueParar,
  nombreDeLaGrabacion,
  partirEnLineas,
  pesoLegible,
  radiosDelGradiente,
  tamanoDeLaGrabacion,
  textoDeLosCuadros,
  tipoDelArchivo,
} from '@/lib/grabacionDelPaso'
import { TECHO_DE_MEDIOS_BYTES } from '@/admin/esquema'

// La grabación de la demostración desde el editor (P-013, pedido 11). Lo que necesita el navegador —`MediaRecorder`, el
// lienzo— se comprobó a mano en el editor; aquí, lo que decide qué se graba y cómo se lee.

/** Una letra de ancho fijo: medio cuerpo por carácter, como una monoespaciada. */
const medir = (s: string, tamano: number) => s.length * tamano * 0.5

const lexical = (hijos: unknown[]) => ({ root: { type: 'root', children: hijos } })
const texto = (t: string) => ({ type: 'text', text: t, format: 0 })
const parrafo = (...trozos: string[]) => ({ type: 'paragraph', children: trozos.map(texto) })
const lista = (tipo: 'number' | 'bullet', puntos: string[]) => ({
  type: 'list',
  listType: tipo,
  children: puntos.map((p) => ({ type: 'listitem', children: [texto(p)] })),
})

describe('qué formato se graba', () => {
  it('pide WebM con VP9 si el navegador lo sabe grabar', () => {
    expect(formatoDeGrabacion(() => true)).toBe('video/webm;codecs=vp9')
  })

  it('baja a MP4 en el navegador que solo sabe eso, como Safari', () => {
    expect(formatoDeGrabacion((f) => f === 'video/mp4')).toBe('video/mp4')
  })

  it('un navegador que lanza al preguntarle por un formato cuenta como que no lo sabe grabar', () => {
    const admite = (f: string) => {
      if (f.includes('vp9')) throw new Error('formato desconocido')
      return f === 'video/webm;codecs=vp8'
    }
    expect(formatoDeGrabacion(admite)).toBe('video/webm;codecs=vp8')
  })

  it('sin ninguno, `null`: la grabadora lo dice en vez de grabar nada', () => {
    expect(formatoDeGrabacion(() => false)).toBeNull()
  })

  it('el tipo del archivo va sin códecs y la extensión sale del tipo', () => {
    expect(tipoDelArchivo('video/webm;codecs=vp9')).toBe('video/webm')
    expect(extensionDelFormato('video/webm;codecs=vp8')).toBe('webm')
    expect(extensionDelFormato('video/mp4')).toBe('mp4')
  })

  it('todo lo que se puede grabar lo acepta el campo «Demostración»', async () => {
    const { FORMATOS_DE_GRABACION } = await import('@/lib/grabacionDelPaso')
    const { Cirugias, camposDe, recorrerCampos } = await import('@/admin/esquema')
    const demostracion = [...recorrerCampos(camposDe(Cirugias))].find((c) => c.nombre === 'demostracion')
    expect(demostracion?.tipo).toBe('archivo')
    const acepta = demostracion && 'acepta' in demostracion ? String(demostracion.acepta) : ''
    for (const formato of FORMATOS_DE_GRABACION) expect(acepta.split(',')).toContain(tipoDelArchivo(formato))
  })
})

describe('el tamaño de la imagen', () => {
  it('un lienzo de pantalla de alta densidad baja a 1280 × 720 sin perder la proporción', () => {
    expect(tamanoDeLaGrabacion(2560, 1440)).toEqual({ ancho: 1280, alto: 720 })
  })

  it('uno más alto que ancho manda por el alto', () => {
    const { ancho, alto } = tamanoDeLaGrabacion(1000, 1500)
    expect(alto).toBe(720)
    expect(ancho / alto).toBeCloseTo(1000 / 1500, 2)
  })

  it('no agranda uno pequeño, y los dos lados salen pares para el códec', () => {
    expect(tamanoDeLaGrabacion(801, 457)).toEqual({ ancho: 802, alto: 458 })
  })

  it('un lienzo sin medir (montándose) graba al techo en vez de a cero', () => {
    expect(tamanoDeLaGrabacion(0, 0)).toEqual({ ancho: 1280, alto: 720 })
  })
})

describe('el techo de los medios', () => {
  it('para antes del techo, con margen para el último trozo', () => {
    expect(hayQueParar(TECHO_DE_MEDIOS_BYTES * 0.5, TECHO_DE_MEDIOS_BYTES)).toBe(false)
    expect(hayQueParar(TECHO_DE_MEDIOS_BYTES * 0.9, TECHO_DE_MEDIOS_BYTES)).toBe(true)
  })

  it('al ritmo pedido caben más de dos minutos antes de parar', () => {
    const segundos = (TECHO_DE_MEDIOS_BYTES * 0.9) / (BITS_POR_SEGUNDO / 8)
    expect(segundos).toBeGreaterThan(120)
  })

  it('se lee en minutos y megas, con coma', () => {
    expect(duracionLegible(65_400)).toBe('1:05')
    expect(duracionLegible(-3)).toBe('0:00')
    expect(pesoLegible(13 * 1024 * 1024)).toBe('13,0 MB')
  })
})

describe('los cuadros de la descripción del paso', () => {
  it('un cuadro por párrafo y uno por punto, con el número de la lista numerada', () => {
    const descripcion = lexical([
      parrafo('Incisión ', 'longitudinal sobre la cresta tibial.'),
      lista('number', ['Piel y celular.', 'Fascia en la misma línea.']),
      lista('bullet', ['Sin tocar el periostio.']),
    ])
    expect(cuadrosDeLaDescripcion(descripcion)).toEqual([
      'Incisión longitudinal sobre la cresta tibial.',
      '1. Piel y celular.',
      '2. Fascia en la misma línea.',
      'Sin tocar el periostio.',
    ])
  })

  it('los párrafos vacíos no dejan un cuadro en blanco, y sin descripción no hay cuadros', () => {
    expect(cuadrosDeLaDescripcion(lexical([parrafo('  '), parrafo('Uno.')]))).toEqual(['Uno.'])
    expect(cuadrosDeLaDescripcion(null)).toEqual([])
  })

  it('en el recuadro, un cuadro por párrafo: el salto suelto no parte, la línea en blanco sí', () => {
    expect(cuadrosDelTexto('Primero que\nsigue\n\n  \n\nSegundo')).toEqual(['Primero que sigue', 'Segundo'])
    expect(cuadrosDelTexto(textoDeLosCuadros(['a', 'b']))).toEqual(['a', 'b'])
  })
})

describe('cómo se acomoda un cuadro', () => {
  it('parte por palabras sin pasarse del ancho', () => {
    const lineas = partirEnLineas('uno dos tres cuatro', 7, (s) => s.length)
    expect(lineas).toEqual(['uno dos', 'tres', 'cuatro'])
  })

  it('una palabra que sola no cabe se parte por letras en vez de salirse', () => {
    const lineas = partirEnLineas('LCP-4,5-de-doce-agujeros', 8, (s) => s.length)
    expect(lineas.every((l) => l.length <= 8)).toBe(true)
    expect(lineas.join('')).toBe('LCP-4,5-de-doce-agujeros')
  })

  it('un texto corto va en una línea, centrado y abajo, con la letra grande', () => {
    const d = disponerElCuadro('Se abre la fascia.', 1280, 720, medir)!
    expect(d.lineas).toEqual(['Se abre la fascia.'])
    expect(d.tamano).toBe(43)
    expect(d.caja.x).toBe(Math.round((1280 - d.caja.ancho) / 2))
    expect(d.caja.y + d.caja.alto).toBeLessThan(720)
    expect(d.caja.y).toBeGreaterThan(720 / 2)
  })

  it('arriba si se pide, para no tapar un gesto que se hace abajo', () => {
    const d = disponerElCuadro('Se abre la fascia.', 1280, 720, medir, 'arriba')!
    expect(d.caja.y).toBeLessThan(720 / 4)
  })

  it('un texto largo achica la letra hasta caber en un tercio de la imagen', () => {
    const largo = 'Se separa el músculo tibial anterior de la cara lateral de la tibia, '.repeat(4)
    const d = disponerElCuadro(largo, 1280, 720, medir)!
    expect(d.tamano).toBeLessThan(43)
    expect(d.caja.alto).toBeLessThanOrEqual(720 / 3)
    expect(d.lineas.at(-1)?.endsWith('…')).toBe(false)
  })

  it('uno que ni con la letra mínima cabe se corta con «…» y no se sale de la imagen', () => {
    const d = disponerElCuadro('palabra '.repeat(400), 1280, 720, medir)!
    expect(d.tamano).toBe(16)
    expect(d.lineas.at(-1)?.endsWith('…')).toBe(true)
    expect(d.caja.alto).toBeLessThanOrEqual(720 / 3)
    for (const l of d.lineas) expect(medir(l, d.tamano)).toBeLessThanOrEqual(d.caja.ancho)
  })

  it('sin texto no hay cuadro', () => {
    expect(disponerElCuadro('   ', 1280, 720, medir)).toBeNull()
  })
})

describe('el fondo de detrás del lienzo', () => {
  it('lee el foco de la consola como lo devuelve el navegador, con las comas de `rgb()` dentro de cada color', () => {
    const g = gradienteDelFondo('radial-gradient(at 50% 42%, rgb(43, 59, 94) 0%, rgb(22, 33, 58) 55%, rgb(11, 17, 32) 100%)')
    expect(g).toEqual({
      centro: [0.5, 0.42],
      paradas: [
        { color: 'rgb(43, 59, 94)', en: 0 },
        { color: 'rgb(22, 33, 58)', en: 0.55 },
        { color: 'rgb(11, 17, 32)', en: 1 },
      ],
    })
  })

  it('es el mismo foco que declara la hoja de la consola', () => {
    const hoja = readFileSync(join(process.cwd(), 'src/app/(frontend)/simulador/consola.css'), 'utf8')
    const regla = /\.consola \.consola-lienzo \{[^}]*background:\s*([^;]+);/.exec(hoja)
    expect(regla, 'la regla del lienzo cambió de forma: revise `gradienteDelFondo`').not.toBeNull()
    const g = gradienteDelFondo(regla![1])
    expect(g?.centro).toEqual([0.5, 0.42])
    expect(g?.paradas.map((p) => p.en)).toEqual([0, 0.55, 1])
  })

  it('sin centro va al medio, y las paradas sin posición se reparten', () => {
    expect(gradienteDelFondo('radial-gradient(red, green, blue)')).toEqual({
      centro: [0.5, 0.5],
      paradas: [
        { color: 'red', en: 0 },
        { color: 'green', en: 0.5 },
        { color: 'blue', en: 1 },
      ],
    })
  })

  it('lo que no es un degradado radial no se lee: se pinta el color de fondo', () => {
    expect(gradienteDelFondo('none')).toBeNull()
    expect(gradienteDelFondo('linear-gradient(red, blue)')).toBeNull()
  })

  it('la elipse por omisión de CSS llega a la esquina más lejana', () => {
    const [rx, ry] = radiosDelGradiente([0.5, 0.42], 1000, 600)
    // La esquina de abajo, la más lejana de un centro alto, queda justo sobre la elipse.
    const dx = 500
    const dy = 600 - 0.42 * 600
    expect((dx / rx) ** 2 + (dy / ry) ** 2).toBeCloseTo(1, 6)
  })
})

describe('el nombre del archivo', () => {
  it('se encuentra en la biblioteca de medios: paso, título sin tildes y día', () => {
    expect(nombreDeLaGrabacion('Incisión de piel', 3, new Date(2026, 10, 6), 'video/webm;codecs=vp9')).toBe(
      'demostracion-paso-3-incision-de-piel-2026-11-06.webm',
    )
  })

  it('un título vacío o de solo signos no deja guiones colgando', () => {
    expect(nombreDeLaGrabacion('¿?', 1, new Date(2026, 0, 2), 'video/mp4')).toBe('demostracion-paso-1-2026-01-02.mp4')
  })
})
