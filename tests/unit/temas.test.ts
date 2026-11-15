import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Las paletas del simulador y del taller (P-014 E7).
 *
 * Tres cosas distintas, y cada una falla de una manera que no se ve:
 *
 * - **La lista y su lectura.** La paleta es un campo de la fila única de `ajustes`; quien la lee es la
 *   plataforma, no la cuenta, y una fila sin elegir —o con un valor que ya no existe— tiene que dar la de
 *   fábrica, no una consola sin colores.
 * - **La acción que la guarda.** La llama el médico, que es editor, sobre una colección que es del
 *   administrador: lo único que le separa de la fila entera es que la acción escriba un solo campo.
 * - **Los colores.** Viven en dos hojas de estilo, y se leen de ellas: que cada paleta de la lista tenga su
 *   bloque en las dos, que el bloque dé todos los tokens —el que falte se queda con el azul de la original, en
 *   medio de una paleta verde— y que cada pareja de texto y fondo llegue al contraste que pide WCAG. El número
 *   se calcula aquí; el ojo se acostumbra a un gris sobre gris en media hora.
 *
 * Lo que estas pruebas no ven —un color fijo escrito fuera de los tokens— se buscó en el navegador, midiendo
 * cada texto contra su fondo en las cuatro paletas (D-360). De ahí salieron las excepciones de `admin.css`.
 */

const { estado, payloadFalso } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 7, rol: 'editor', activo: true } as Record<string, unknown>,
    rolReal: 'editor' as string,
    falla: false,
  },
  payloadFalso: {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: true,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => {
    if (estado.falla) throw new Error('la base no responde')
    return payloadFalso
  },
}))

vi.mock('@payload-config', () => ({ default: {} }))

const revalidar = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath: revalidar }))

import { guardarElTema } from '@/app/(frontend)/acciones/atlas'
import { Ajustes } from '@/collections/Ajustes'
import { TEMAS, TEMA_POR_OMISION, leerElTema, temaValido, type Tema } from '@/lib/temas'
import { temaDeLaPlataforma } from '@/lib/temaDeLaPlataforma'

beforeEach(() => {
  estado.rolReal = 'editor'
  estado.falla = false
  payloadFalso.find.mockReset().mockResolvedValue({ docs: [] })
  payloadFalso.create.mockReset().mockResolvedValue({ id: 1 })
  payloadFalso.update.mockReset().mockResolvedValue({ id: 1 })
  revalidar.mockReset()
})

describe('la lista de paletas', () => {
  it('trae las tres pedidas y la original, sin repetir ninguna', () => {
    const valores = TEMAS.map((t) => t.valor)
    expect([...valores].sort()).toEqual(['clara', 'original', 'oscura-fria', 'verde-quirofano'])
    expect(new Set(valores).size).toBe(valores.length)
    for (const t of TEMAS) {
      expect(t.etiqueta.trim()).not.toBe('')
      expect(t.resumen.trim()).not.toBe('')
    }
  })

  it('la de fábrica es una de la lista, y no la original: lo pedido fue cambiarla', () => {
    expect(TEMAS.map((t) => t.valor)).toContain(TEMA_POR_OMISION)
    expect(TEMA_POR_OMISION).not.toBe('original')
  })

  it('un valor que no es de la lista se lee como la de fábrica', () => {
    expect(temaValido('clara')).toBe('clara')
    expect(temaValido('original')).toBe('original')
    for (const raro of [undefined, null, '', 'Clara', 'oscura', 7, {}, ['clara']]) expect(temaValido(raro)).toBe(TEMA_POR_OMISION)
  })

  it('el campo de la colección ofrece esa misma lista y nace con la de fábrica', () => {
    const campo = Ajustes.fields.find((c) => 'name' in c && c.name === 'tema') as { type: string; defaultValue: unknown; options: { label: string; value: string }[] }
    expect(campo.type).toBe('select')
    expect(campo.defaultValue).toBe(TEMA_POR_OMISION)
    expect(campo.options.map((o) => o.value)).toEqual(TEMAS.map((t) => t.valor))
  })
})

describe('leer la paleta elegida', () => {
  it('lee la fila más antigua de ajustes, por encima de los permisos de la cuenta', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 3, tema: 'verde-quirofano' }] })
    expect(await leerElTema({ find } as never)).toBe('verde-quirofano')
    expect(find).toHaveBeenCalledTimes(1)
    // `overrideAccess`: al residente hay que pintarle la consola y no puede leer `ajustes`. La fila más antigua:
    // es la que escribe la acción, y la que lee la mantención.
    expect(find.mock.calls[0][0]).toMatchObject({ collection: 'ajustes', limit: 1, sort: 'createdAt', overrideAccess: true })
  })

  it('sin fila, sin el campo o con un valor que ya no existe, da la de fábrica', async () => {
    for (const docs of [[], [{ id: 1 }], [{ id: 1, tema: null }], [{ id: 1, tema: 'sepia' }]]) {
      expect(await leerElTema({ find: async () => ({ docs }) } as never)).toBe(TEMA_POR_OMISION)
    }
  })

  it('para una página, nunca lanza: con la base caída la consola se pinta con la de fábrica', async () => {
    const callar = vi.spyOn(console, 'error').mockImplementation(() => {})
    estado.falla = true
    expect(await temaDeLaPlataforma()).toBe(TEMA_POR_OMISION)
    estado.falla = false
    payloadFalso.find.mockRejectedValueOnce(new Error('relation "ajustes" does not exist'))
    expect(await temaDeLaPlataforma()).toBe(TEMA_POR_OMISION)
    expect(callar).toHaveBeenCalledTimes(2)
    callar.mockRestore()

    payloadFalso.find.mockResolvedValueOnce({ docs: [{ id: 1, tema: 'clara' }] })
    expect(await temaDeLaPlataforma()).toBe('clara')
  })
})

describe('guardar la paleta desde el taller', () => {
  it('en una plataforma sin fila de ajustes, la crea con ese solo campo', async () => {
    const respuesta = await guardarElTema('clara')
    expect(respuesta).toEqual({ exito: true, datos: { tema: 'clara' } })
    expect(payloadFalso.update).not.toHaveBeenCalled()
    expect(payloadFalso.create).toHaveBeenCalledTimes(1)
    expect(payloadFalso.create.mock.calls[0][0]).toMatchObject({ collection: 'ajustes', data: { tema: 'clara' }, user: estado.usuario })
  })

  it('con fila, actualiza la más antigua y no toca nada más de ella', async () => {
    payloadFalso.find.mockResolvedValue({ docs: [{ id: 4, tema: 'original', modulosEnMantencion: ['casos-ao'] }] })
    const respuesta = await guardarElTema('verde-quirofano')
    expect(respuesta).toEqual({ exito: true, datos: { tema: 'verde-quirofano' } })
    expect(payloadFalso.find.mock.calls[0][0]).toMatchObject({ collection: 'ajustes', limit: 1, sort: 'createdAt' })
    expect(payloadFalso.create).not.toHaveBeenCalled()
    expect(payloadFalso.update).toHaveBeenCalledTimes(1)
    const llamada = payloadFalso.update.mock.calls[0][0]
    expect(llamada).toMatchObject({ collection: 'ajustes', id: 4, user: estado.usuario })
    // El editor no gobierna la mantención: lo que se manda es el tema y nada más.
    expect(llamada.data).toEqual({ tema: 'verde-quirofano' })
  })

  it('avisa a todas las páginas: la paleta la lleva el contorno del panel y la de cada caso', async () => {
    await guardarElTema('oscura-fria')
    expect(revalidar).toHaveBeenCalledWith('/', 'layout')
  })

  it('una paleta que no existe no se guarda, y se dice', async () => {
    for (const rara of ['sepia', '', null, undefined, { valor: 'clara' }, 'Clara']) {
      const respuesta = await guardarElTema(rara)
      expect(respuesta.exito).toBe(false)
      expect(respuesta.mensaje).toBe('Esa paleta no existe.')
    }
    expect(payloadFalso.find).not.toHaveBeenCalled()
    expect(payloadFalso.create).not.toHaveBeenCalled()
    expect(payloadFalso.update).not.toHaveBeenCalled()
    expect(revalidar).not.toHaveBeenCalled()
  })

  it('el residente no la cambia: sin rol de editor no se llega a tocar nada', async () => {
    estado.rolReal = 'lector'
    const respuesta = await guardarElTema('clara')
    expect(respuesta.exito).toBe(false)
    expect(payloadFalso.find).not.toHaveBeenCalled()
    expect(payloadFalso.create).not.toHaveBeenCalled()
    expect(payloadFalso.update).not.toHaveBeenCalled()
  })

  it('el administrador también puede', async () => {
    estado.rolReal = 'admin'
    expect((await guardarElTema('original')).exito).toBe(true)
  })
})

// ------------------------------------------------------------------ los colores, leídos de las hojas

const RAIZ = join(__dirname, '..', '..', 'src', 'app', '(frontend)')
const leer = (...ruta: string[]) => readFileSync(join(RAIZ, ...ruta), 'utf8')

/** Las reglas de una hoja, sin comentarios: varios de ellos citan colores que ya no están. */
function reglasDe(fuente: string): { selectores: string[]; tokens: Record<string, string> }[] {
  const limpio = fuente.replace(/\/\*[\s\S]*?\*\//g, '')
  const reglas: { selectores: string[]; tokens: Record<string, string> }[] = []
  for (const [, selector, cuerpo] of limpio.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const tokens: Record<string, string> = {}
    for (const trozo of cuerpo.split(';')) {
      const corte = trozo.indexOf(':')
      if (corte === -1) continue
      const propiedad = trozo.slice(0, corte).trim()
      if (propiedad.startsWith('--')) tokens[propiedad] = trozo.slice(corte + 1).trim()
    }
    reglas.push({ selectores: selector.split(',').map((s) => s.trim()), tokens })
  }
  return reglas
}

/** Los tokens que dan las reglas con ese selector, en el orden de la hoja: la de más abajo gana. */
function tokensDe(reglas: ReturnType<typeof reglasDe>, selector: string): Record<string, string> {
  const salida: Record<string, string> = {}
  for (const regla of reglas) if (regla.selectores.includes(selector)) Object.assign(salida, regla.tokens)
  return salida
}

const DEL_SITIO = tokensDe(reglasDe(leer('estilos.css')), ':root')
const DE_LA_CONSOLA = reglasDe(leer('simulador', 'consola.css'))
const DEL_PANEL = reglasDe(leer('admin-panel', 'admin.css'))

/** Un token resuelto hasta su color: sigue los `var()` por la paleta y, si no está, por el sitio. */
function color(paleta: Record<string, string>, token: string): string {
  let valor = paleta[token] ?? DEL_SITIO[token]
  for (let salto = 0; salto < 8 && valor?.startsWith('var('); salto++) {
    const nombre = valor.slice(4, -1).split(',')[0].trim()
    valor = paleta[nombre] ?? DEL_SITIO[nombre]
  }
  if (!valor || !/^#[0-9a-f]{6}$/i.test(valor)) throw new Error(`«${token}» no acaba en un color de seis cifras: ${valor}`)
  return valor
}

function luminancia(hex: string): number {
  const canal = (desde: number) => {
    const v = parseInt(hex.slice(desde, desde + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

function contraste(uno: string, otro: string): number {
  const a = luminancia(uno)
  const b = luminancia(otro)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const NUEVAS = TEMAS.map((t) => t.valor).filter((t): t is Exclude<Tema, 'original'> => t !== 'original')

const paletaDeLaConsola = (tema: Tema) => ({ ...tokensDe(DE_LA_CONSOLA, '.consola'), ...tokensDe(DE_LA_CONSOLA, `.consola[data-tema='${tema}']`) })
const paletaDelTaller = (tema: Tema) => ({ ...DEL_SITIO, ...tokensDe(DEL_PANEL, `.atlas-con-pestanas[data-tema='${tema}']`) })

describe('las hojas de estilo y la lista dicen lo mismo', () => {
  it('no hay bloque para una paleta que no esté en la lista', () => {
    const validas = new Set<string>(TEMAS.map((t) => t.valor))
    for (const hoja of [leer('simulador', 'consola.css'), leer('admin-panel', 'admin.css'), leer('admin-panel', 'editor.css')]) {
      for (const [, nombre] of hoja.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\[data-tema=['"]?([\w-]+)['"]?\]/g)) {
        expect(validas, `la hoja nombra la paleta «${nombre}»`).toContain(nombre)
      }
    }
  })

  it('cada paleta nueva tiene su bloque en la consola, y vale con el atributo puesto en un antepasado', () => {
    for (const tema of NUEVAS) {
      // El atributo lo lleva `<body>`, no la consola: de él cuelgan la del caso, su silueta de carga y la del
      // editor. Un bloque que solo dijera `.consola[data-tema]` no se aplicaría en ninguna de las tres.
      const bloques = DE_LA_CONSOLA.filter((r) => r.selectores.includes(`.consola[data-tema='${tema}']`))
      expect(bloques.length, tema).toBeGreaterThan(0)
      for (const regla of bloques) expect(regla.selectores, tema).toContain(`[data-tema='${tema}'] .consola`)
    }
  })

  it('la plantilla del sitio la pone en el cuerpo de la página, y nadie más la repite', () => {
    // Un solo sitio: con dos —la página del caso y el contorno del panel— la silueta de carga se quedaba sin
    // ninguno, y dos antepasados con paletas distintas los desempata el orden de la hoja, no la cercanía.
    expect(leer('layout.tsx')).toMatch(/<body data-tema=\{tema\}>/)
    expect(leer('layout.tsx')).toMatch(/const tema = await temaDeLaPlataforma\(\)/)
    for (const otra of [leer('admin-panel', 'layout.tsx'), leer('simulador', '[id]', 'page.tsx'), leer('simulador', '[id]', 'loading.tsx')]) {
      expect(otra).not.toMatch(/data-tema/)
    }
  })

  it('cada paleta de la consola da todos los colores: el que falte se queda con el de la original', () => {
    const DEBE = ['--c-fondo', '--c-panel', '--c-panel-2', '--c-linea', '--c-linea-fuerte', '--c-texto', '--c-texto-2', '--c-rotulo', '--c-acento', '--c-acento-solido', '--c-acento-tenue', '--c-lienzo-1', '--c-lienzo-2', '--c-lienzo-3']
    for (const tema of NUEVAS) {
      const propios = tokensDe(DE_LA_CONSOLA, `.consola[data-tema='${tema}']`)
      for (const token of DEBE) expect(Object.keys(propios), `${tema} · ${token}`).toContain(token)
    }
  })

  it('cada paleta del taller da todos los colores del sitio que el taller usa', () => {
    const DEBE = ['--papel', '--superficie', '--superficie-2', '--linea', '--linea-suave', '--linea-fuerte', '--tinta', '--pizarra', '--mudo', '--marca', '--marca-honda', '--marca-tenue', '--cian', '--cian-tenue', '--lienzo-3d']
    for (const tema of NUEVAS) {
      const propios = tokensDe(DEL_PANEL, `.atlas-con-pestanas[data-tema='${tema}']`)
      for (const token of DEBE) expect(Object.keys(propios), `${tema} · ${token}`).toContain(token)
    }
  })

  it('las dos oscuras traen además sus tonos de aviso: los del sitio son para papel blanco', () => {
    for (const tema of ['oscura-fria', 'verde-quirofano'] as const) {
      const propios = tokensDe(DEL_PANEL, `.atlas-con-pestanas[data-tema='${tema}']`)
      for (const token of ['--alerta', '--alerta-honda', '--alerta-tenue', '--verde', '--verde-tenue', '--ambar', '--ambar-texto', '--ambar-tenue']) {
        expect(Object.keys(propios), `${tema} · ${token}`).toContain(token)
      }
      expect(propios['color-scheme'] ?? 'dark').toBe('dark')
    }
  })
})

describe('el contraste de cada paleta de la consola', () => {
  const FONDOS = ['--c-fondo', '--c-panel', '--c-panel-2']
  // Todo lo que la consola escribe: los tres textos, el acento cuando es letra y los tres tonos del registro.
  const TEXTOS = ['--c-texto', '--c-texto-2', '--c-rotulo', '--c-acento', '--c-bien', '--c-atencion', '--c-grave']

  for (const { valor: tema } of TEMAS) {
    it(`«${tema}»: cada texto llega a 4,5:1 sobre los tres fondos`, () => {
      const paleta = paletaDeLaConsola(tema)
      for (const fondo of FONDOS) {
        for (const texto of TEXTOS) {
          expect(contraste(color(paleta, texto), color(paleta, fondo)), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`«${tema}»: la letra blanca de lo que va lleno, y el contorno de lo que se toca`, () => {
      const paleta = paletaDeLaConsola(tema)
      // «Aplicar paso», la posición elegida, el paso actual: blanco fijo sobre el acento sólido.
      expect(contraste('#ffffff', color(paleta, '--c-acento-solido'))).toBeGreaterThanOrEqual(4.5)
      // WCAG 1.4.11: el borde de un mando, 3:1 contra lo que tiene al lado.
      for (const fondo of FONDOS) {
        expect(contraste(color(paleta, '--c-linea-fuerte'), color(paleta, fondo)), `contorno sobre ${fondo}`).toBeGreaterThanOrEqual(3)
      }
    })

    it(`«${tema}»: lo que se escribe directamente sobre el lienzo se lee del centro al borde`, () => {
      const paleta = paletaDeLaConsola(tema)
      for (const tramo of ['--c-lienzo-1', '--c-lienzo-2', '--c-lienzo-3']) {
        expect(contraste(color(paleta, '--c-texto'), color(paleta, tramo)), tramo).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})

describe('el contraste de cada paleta del taller', () => {
  const FONDOS = ['--superficie', '--superficie-2', '--papel', '--lienzo-3d']
  const TEXTOS = ['--tinta', '--pizarra', '--mudo', '--marca', '--alerta', '--verde', '--ambar-texto']

  for (const tema of NUEVAS) {
    it(`«${tema}»: cada texto llega a 4,5:1 sobre los fondos del taller`, () => {
      const paleta = paletaDelTaller(tema)
      for (const fondo of FONDOS) {
        for (const texto of TEXTOS) {
          expect(contraste(color(paleta, texto), color(paleta, fondo)), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`«${tema}»: lo que va lleno se escribe con el color de la superficie, y se lee`, () => {
      const paleta = paletaDelTaller(tema)
      // La herramienta elegida y «Guardar preparación» (marca), su estado al pasar el ratón (marca honda), los
      // rótulos flotantes sobre el lienzo (tinta) y el botón de borrar (alerta).
      for (const lleno of ['--marca', '--marca-honda', '--tinta', '--alerta']) {
        expect(contraste(color(paleta, '--superficie'), color(paleta, lleno)), `superficie sobre ${lleno}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`«${tema}»: los avisos y las insignias, sobre su fondo tenue`, () => {
      const paleta = paletaDelTaller(tema)
      const PAREJAS: [string, string][] = [
        ['--marca', '--marca-tenue'],
        ['--verde', '--verde-tenue'],
        ['--ambar-texto', '--ambar-tenue'],
        ['--alerta', '--alerta-tenue'],
        // El texto de un aviso es tinta corriente sobre el tenue de su tipo.
        ['--tinta', '--marca-tenue'],
        ['--tinta', '--verde-tenue'],
        ['--tinta', '--ambar-tenue'],
        ['--tinta', '--alerta-tenue'],
      ]
      for (const [texto, fondo] of PAREJAS) {
        expect(contraste(color(paleta, texto), color(paleta, fondo)), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`«${tema}»: el contorno de un campo, 3:1 contra el fondo`, () => {
      const paleta = paletaDelTaller(tema)
      for (const fondo of ['--superficie', '--superficie-2', '--papel']) {
        expect(contraste(color(paleta, '--linea-fuerte'), color(paleta, fondo)), `contorno sobre ${fondo}`).toBeGreaterThanOrEqual(3)
      }
    })
  }

  it('lo que no sale de los tokens tiene su excepción escrita: el botón lleno, el marcador y los rótulos de medida', () => {
    const hoja = leer('admin-panel', 'admin.css').replace(/\/\*[\s\S]*?\*\//g, '')
    // `ui.css` escribe el botón lleno en blanco fijo: sobre la marca clara de las oscuras daba 1,9:1.
    expect(leer('ui.css')).toMatch(/\.admin-btn-primary\s*\{[^}]*color:\s*#fff/)
    expect(hoja).toMatch(/\.atlas-con-pestanas:is\([^)]*'oscura-fria'[^)]*'verde-quirofano'[^)]*\)\s+:is\(\.admin-btn-primary,\s*\.admin-btn-danger\)\s*\{\s*color:\s*var\(--superficie\)/)
    expect(hoja).toMatch(/\.atlas-con-pestanas:where\([^)]*\)\s+:where\(input,\s*textarea\)::placeholder\s*\{\s*color:\s*var\(--mudo\)/)
    expect(hoja).toMatch(/:is\(\.atlas-marca-distancia,\s*\.atlas-marca-angulo\)\s*\{\s*color:\s*#fff/)
  })
})
