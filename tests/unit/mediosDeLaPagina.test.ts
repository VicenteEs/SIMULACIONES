import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLECCIONES } from '@/collections'
import { cabecerasDeArchivoPublico } from '@/collections/hooks/cacheDeArchivos'
import { esquemaDe } from '@/admin/esquema'
import { puedeEditar } from '@/lib/guardias'
import { fotoPublica, leerCambios, leerLaPagina, type ClienteDeLectura } from '@/lib/mediosDeLaPagina'
import { ruta } from '@/lib/rutas'

/**
 * Lo cambiado en las páginas públicas y la puerta pública de sus fotos
 * (P-007 E2).
 *
 * Lo que importa probar es que las tres que preguntan por la foto vigente —la
 * portada, la pestaña y la ruta pública— reciben la misma respuesta, y que la
 * ruta no entrega nada más que eso.
 */

type Fila = Record<string, unknown>

/** Un Payload de mentira que filtra por igualdad y ordena por fecha e id, como la consulta de verdad. */
function cliente(filas: Record<string, Fila[]>, { falla = false } = {}): ClienteDeLectura {
  return {
    find: (async (opciones: { collection: string; where?: Record<string, { equals: unknown }>; sort?: string[]; limit?: number }) => {
      if (falla) throw new Error('la base no responde')
      let docs = [...(filas[opciones.collection] ?? [])]
      for (const [campo, condicion] of Object.entries(opciones.where ?? {})) {
        docs = docs.filter((d) => d[campo] === condicion.equals)
      }
      const fecha = (opciones.sort?.[0] ?? '-createdAt').replace('-', '')
      docs.sort((a, b) => String(b[fecha]).localeCompare(String(a[fecha])) || Number(b.id) - Number(a.id))
      return { docs: opciones.limit ? docs.slice(0, opciones.limit) : docs }
    }) as unknown as ClienteDeLectura['find'],
  }
}

const FOTOS: Fila[] = [
  { id: 1, espacio: 'portada.capas.piel', alt: 'Vieja', filename: 'portada-capas-piel-aaaaaaaaaaaa.png', mimeType: 'image/png', createdAt: '2026-11-01T10:00:00.000Z' },
  { id: 2, espacio: 'portada.capas.piel', alt: 'Nueva', filename: 'portada-capas-piel-bbbbbbbbbbbb.webp', mimeType: 'image/webp', width: 690, height: 1736, createdAt: '2026-11-02T10:00:00.000Z' },
  // De un espacio que ya no existe en el registro: no se pinta ni se sirve.
  { id: 3, espacio: 'portada.retirado', alt: 'x', filename: 'portada-retirado-cccccccccccc.png', mimeType: 'image/png', createdAt: '2026-11-03T10:00:00.000Z' },
]
const TEXTOS: Fila[] = [
  { id: 7, espacio: 'portada.hero.titular', texto: 'Otro titular', updatedAt: '2026-11-02T10:00:00.000Z' },
  { id: 8, espacio: 'portada.preguntas.pregunta-1', texto: '', updatedAt: '2026-11-02T10:00:00.000Z' },
]
const BASE = { 'medios-pagina': FOTOS, 'textos-pagina': TEXTOS }

describe('lo cambiado', () => {
  it('la foto vigente de un espacio es la más reciente, y las otras quedan para retirar', async () => {
    const cambios = await leerCambios(cliente(BASE))
    expect(cambios.fotos.get('portada.capas.piel')).toMatchObject({ id: '2', alt: 'Nueva', ancho: 690, alto: 1736 })
    // Con `ruta()`: el prefijo de la plataforma sale del entorno, y en esta
    // máquina `.env` trae uno.
    expect(cambios.fotos.get('portada.capas.piel')?.src).toBe(ruta('/api/pagina/portada-capas-piel-bbbbbbbbbbbb.webp'))
    expect(cambios.fotosAnteriores.get('portada.capas.piel')).toEqual(['1'])
    expect(cambios.fotos.has('portada.retirado')).toBe(false)
  })

  it('la página pinta lo cambiado y, donde no hay nada, el original', async () => {
    const pagina = await leerLaPagina(cliente(BASE), { piezas: 2231 })
    expect(pagina.texto('portada.hero.titular')).toBe('Otro titular')
    expect(pagina.texto('portada.hero.antetitulo')).toBe('Plataforma docente de traumatología')
    // Vaciado a propósito: la pregunta no se pinta.
    expect(pagina.texto('portada.preguntas.pregunta-1')).toBe('')
    expect(pagina.texto('portada.estudia.bajada')).toContain('las 2.231 piezas')
    expect(pagina.foto('portada.capas.musculo')).toBeNull()
    expect(pagina.sinBase).toBe(false)
  })

  it('si la base no responde, la página sale entera con sus originales y no se cae', async () => {
    const pagina = await leerLaPagina(cliente(BASE, { falla: true }))
    expect(pagina.sinBase).toBe(true)
    expect(pagina.texto('portada.hero.titular')).toBe('Ensaya la cirugía antes de entrar *al pabellón.*')
    expect(pagina.foto('portada.capas.piel')).toBeNull()
    expect(pagina.texto('portada.estudia.bajada')).toContain('Cada una de las piezas del atlas')
  })
})

describe('la puerta pública de las fotos', () => {
  it('entrega la vigente de su espacio, con su tipo', async () => {
    expect(await fotoPublica(cliente(BASE), 'portada-capas-piel-bbbbbbbbbbbb.webp')).toEqual({
      nombre: 'portada-capas-piel-bbbbbbbbbbbb.webp',
      tipo: 'image/webp',
    })
  })

  it('no entrega una anterior todavía sin retirar, ni la de un espacio que ya no existe, ni un nombre sin fila', async () => {
    expect(await fotoPublica(cliente(BASE), 'portada-capas-piel-aaaaaaaaaaaa.png')).toBeNull()
    expect(await fotoPublica(cliente(BASE), 'portada-retirado-cccccccccccc.png')).toBeNull()
    expect(await fotoPublica(cliente(BASE), 'portada-capas-hueso-dddddddddddd.png')).toBeNull()
  })

  it('un nombre que no pasa el filtro no llega ni a consultar la base', async () => {
    const espia = cliente(BASE, { falla: true })
    expect(await fotoPublica(espia, '../../.env')).toBeNull()
    expect(await fotoPublica(espia, 'foto.svg')).toBeNull()
  })

  it('sale con caché pública e inmutable, sin poder ejecutar nada', () => {
    const cabeceras = cabecerasDeArchivoPublico(new Headers())
    expect(cabeceras.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(cabeceras.get('X-Content-Type-Options')).toBe('nosniff')
    expect(cabeceras.get('Content-Security-Policy')).toMatch(/default-src 'none'.*sandbox/)
  })

  it('la ruta pública pregunta a `fotoPublica` y no arma el camino con lo que llega', () => {
    const fuente = readFileSync(resolve('src/app/(frontend)/api/pagina/[archivo]/route.ts'), 'utf8')
    expect(fuente).toContain('fotoPublica(payload, archivo)')
    expect(fuente).toContain('resolve(CARPETA, foto.nombre)')
    expect(fuente).toContain('startsWith(CARPETA + sep)')
  })
})

describe('quién puede cambiar las fotos de la página', () => {
  const editor = { rol: 'editor', activo: true, modulosEditables: [], modulosVisibles: [] }
  const admin = { rol: 'admin', activo: true }

  it('solo el administrador: ningún editor, ni el que no tiene restricción de módulos', () => {
    expect(puedeEditar(editor, 'medios-pagina')).toBe(false)
    expect(puedeEditar(admin, 'medios-pagina')).toBe(true)
    // Los medios del contenido siguen abiertos al editor, como antes.
    expect(puedeEditar(editor, 'medios')).toBe(true)
  })

  it('la ruta de subida pregunta lo mismo: `exigirEdicionDe` y no `exigirEditor` a secas', () => {
    const fuente = readFileSync(resolve('src/app/(frontend)/api/subidas/[coleccion]/route.ts'), 'utf8')
    expect(fuente).toContain('await exigirEdicionDe(esquema.slug)')
    expect(fuente).not.toMatch(/await exigirEditor\(\)/)
  })

  it('se administra desde su pestaña: el listado genérico de «Contenido» redirige a ella', () => {
    expect(esquemaDe('medios-pagina').pantallaPropia).toBe('/admin-panel/medios-pagina')
  })

  it('la colección no admite SVG, y su esquema del panel tampoco lo ofrece', () => {
    const coleccion = COLECCIONES.find((c) => c.slug === 'medios-pagina')
    const tipos = typeof coleccion?.upload === 'object' ? coleccion.upload.mimeTypes : []
    expect(tipos).toEqual(['image/png', 'image/jpeg', 'image/webp'])
    expect(esquemaDe('medios-pagina').subida?.acepta).not.toContain('svg')
  })
})
