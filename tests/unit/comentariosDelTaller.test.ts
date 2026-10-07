import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { creacionDeComentario } from '@/access/payload'
import { Comentarios } from '@/collections/Comentarios'
import { PanelDePestana, Pestanas } from '@/components/ui/Pestanas'
import {
  anclaOpcional,
  esDestinoDeComentario,
  exigirDestinoDeComentario,
  ErrorDeValidacion,
} from '@/lib/validacion'
import {
  NOMBRE_DE_DESTINO,
  SLUG_DEL_TALLER,
  rutaDelPanelParaComentario,
} from '@/app/(frontend)/admin-panel/modulos'

/**
 * Los comentarios dentro del taller anatómico (E2, D-158).
 *
 * Lo que se promete: se puede comentar una preparación y una pieza concreta de
 * ella, solo desde el taller —editor y administrador—, y el residente no. Lo que
 * guarda el ancla se reconstruye y no se acepta tal cual.
 */

const ABRE = (rol: string, extra: Record<string, unknown> = {}) =>
  ({ req: { user: { id: 1, rol, activo: true, ...extra } }, data: { coleccion: SLUG_DEL_TALLER } }) as never

describe('quién comenta una preparación', () => {
  it('el editor y el administrador, sí', () => {
    expect(creacionDeComentario(ABRE('editor'))).toBe(true)
    expect(creacionDeComentario(ABRE('admin'))).toBe(true)
  })

  it('el editor con los módulos restringidos también: el atlas no es un módulo', () => {
    // Es la razón de que no sirva `creacionEnModuloVisible`: ante `instancias-atlas`
    // le diría que no a toda cuenta con módulos marcados.
    expect(creacionDeComentario(ABRE('editor', { modulosVisibles: ['patologias'] }))).toBe(true)
  })

  it('el residente, no; ni sin sesión, ni con la cuenta sin activar', () => {
    expect(creacionDeComentario(ABRE('lector'))).toBe(false)
    expect(creacionDeComentario({ req: { user: null }, data: { coleccion: SLUG_DEL_TALLER } } as never)).toBe(false)
    expect(creacionDeComentario(ABRE('editor', { activo: false }))).toBe(false)
  })

  it('para un módulo sigue mandando la regla de siempre', () => {
    const peticion = (rol: string, modulos?: string[]) =>
      ({
        req: { user: { id: 1, rol, activo: true, modulosVisibles: modulos } },
        data: { coleccion: 'patologias' },
      }) as never
    expect(creacionDeComentario(peticion('lector'))).toBe(true)
    expect(creacionDeComentario(peticion('lector', ['cirugias']))).toBe(false)
  })

  it('es la regla de creación de la colección', () => {
    expect(Comentarios.access?.create).toBe(creacionDeComentario)
  })
})

describe('el destino de un comentario', () => {
  it('admite los cinco módulos y el taller, y nada más', () => {
    for (const ok of ['patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia', SLUG_DEL_TALLER]) {
      expect(esDestinoDeComentario(ok)).toBe(true)
    }
    for (const mal of ['usuarios', 'segmentos', '', null, undefined, 3]) {
      expect(esDestinoDeComentario(mal)).toBe(false)
    }
    expect(() => exigirDestinoDeComentario('usuarios')).toThrow(ErrorDeValidacion)
  })

  it('tiene nombre legible, el del taller incluido', () => {
    expect(NOMBRE_DE_DESTINO[SLUG_DEL_TALLER]).toBe('Taller anatómico')
    expect(NOMBRE_DE_DESTINO.patologias).toBe('Biblioteca de patologías')
  })

  it('la bandeja lleva un comentario del taller al taller, y los demás a la bandeja', () => {
    expect(rutaDelPanelParaComentario(SLUG_DEL_TALLER, 12, 7)).toBe('/admin-panel/atlas?preparacion=12&comentario=7')
    expect(rutaDelPanelParaComentario('patologias', 12, 7)).toBe('/admin-panel/comentarios')
  })
})

describe('el ancla', () => {
  it('sin ancla es una preparación comentada entera', () => {
    expect(anclaOpcional(undefined)).toBeUndefined()
    expect(anclaOpcional(null)).toBeUndefined()
  })

  it('guarda la pieza, el punto y la vista', () => {
    const ancla = {
      pieza: 'FJ3387',
      punto: [1, 2, 3],
      vista: { camara: [0, 1, 2], objetivo: [3, 4, 5] },
    }
    expect(anclaOpcional(ancla)).toEqual(ancla)
  })

  it('acepta un fragmento y la pieza sola', () => {
    expect(anclaOpcional({ pieza: 'FJ3387#a' })).toEqual({ pieza: 'FJ3387#a' })
  })

  it('reconstruye: lo que no se reconoce no se guarda', () => {
    const sucia = { pieza: 'FJ1', punto: [0, 0, 0], intruso: { a: 1 }, vista: { camara: [0, 0, 1], objetivo: [0, 0, 0], extra: 9 } }
    expect(anclaOpcional(sucia)).toEqual({ pieza: 'FJ1', punto: [0, 0, 0], vista: { camara: [0, 0, 1], objetivo: [0, 0, 0] } })
  })

  it('rechaza lo mal formado en vez de descartarlo en silencio', () => {
    for (const mal of [
      'FJ1',
      [],
      { punto: [0, 0, 0] },
      { pieza: '' },
      { pieza: 'tiene espacios' },
      { pieza: 'x'.repeat(61) },
      { pieza: 'FJ1', punto: [0, 0] },
      { pieza: 'FJ1', punto: [0, 0, Number.NaN] },
      { pieza: 'FJ1', punto: [0, 0, 1e9] },
      { pieza: 'FJ1', vista: { camara: [0, 0, 1] } },
      { pieza: 'FJ1', vista: { camara: 'a', objetivo: 'b' } },
    ]) {
      expect(() => anclaOpcional(mal), JSON.stringify(mal)).toThrow(ErrorDeValidacion)
    }
  })

  it('el campo de la colección se fija al crear: nadie lo reescribe después', () => {
    const campo = Comentarios.fields.find((f) => 'name' in f && f.name === 'ancla') as {
      type: string
      access?: { update?: () => boolean }
    }
    expect(campo.type).toBe('json')
    expect(campo.access?.update?.()).toBe(false)
  })
})

describe('las pestañas', () => {
  const pestanas = [
    { id: 'pieza', etiqueta: 'Pieza' },
    { id: 'preparacion', etiqueta: 'Preparación' },
    { id: 'comentarios', etiqueta: 'Comentarios (2)' },
  ]
  const html = renderToStaticMarkup(
    createElement(Pestanas, { base: 'taller', etiqueta: 'Panel', pestanas, activa: 'preparacion', alCambiar: () => {} }),
  )

  it('son un tablist, con una sola pestaña seleccionada y una sola en el orden del Tab', () => {
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)).toHaveLength(3)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2)
  })

  it('cada pestaña apunta a su panel, y el panel a su pestaña', () => {
    expect(html).toContain('aria-controls="taller-panel-comentarios"')
    const panel = renderToStaticMarkup(
      createElement(PanelDePestana, { base: 'taller', id: 'comentarios', activa: 'comentarios' }, 'contenido'),
    )
    expect(panel).toContain('id="taller-panel-comentarios"')
    expect(panel).toContain('aria-labelledby="taller-pestana-comentarios"')
    expect(panel).toContain('role="tabpanel"')
  })

  it('solo se monta el panel activo', () => {
    expect(renderToStaticMarkup(createElement(PanelDePestana, { base: 'taller', id: 'pieza', activa: 'comentarios' }, 'x'))).toBe('')
  })
})

describe('el taller', () => {
  const taller = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx'), 'utf8')

  it('reparte su panel derecho entre las tres pestañas', () => {
    for (const id of ['pieza', 'preparacion', 'comentarios']) {
      expect(taller).toContain(`id="${id}" activa={pestana}`)
    }
  })

  it('no abre comentarios de lo que no se ha guardado', () => {
    // «Cuerpo» no es una fila de la base (D-152): la pestaña recibe `instancia`,
    // que es `null` ahí, y lo dice.
    expect(taller).toContain('preparacion={instancia}')
    const pestana = readFileSync(
      join(process.cwd(), 'src', 'components', 'admin', 'atlas', 'PestanaDeComentarios.tsx'),
      'utf8',
    )
    expect(pestana).toContain('Guarde la preparación con nombre para poder comentarla')
  })

  it('los marcadores de los comentarios no entran en las marcas que se guardan', () => {
    // Viajan solo hacia el visor: si entraran en `marcas`, el residente los vería
    // en la ficha y el editor los guardaría como rótulos suyos.
    expect(taller).toMatch(/marcas=\{marcasDeComentarios\.length > 0 \? \[\.\.\.marcas, \.\.\.marcasDeComentarios\] : marcas\}/)
    expect(taller).not.toMatch(/setMarcas\([^)]*marcasDeComentarios/)
  })
})
