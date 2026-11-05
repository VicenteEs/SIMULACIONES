import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { cabecerasDeFotoDelEquipo } from '@/collections/hooks/cacheDeArchivos'
import { SobreNosotros, iniciales } from '@/components/portada/SobreNosotros'
import { espacioDeTexto } from '@/lib/espaciosDeLaPagina'
import {
  direccionDeFotoDelEquipo,
  fotoDelEquipoPublica,
  leerEquipoPublico,
  ordenDelEquipo,
  type ClienteDeLectura,
  type ColaboradorPublico,
} from '@/lib/equipoPublico'
import { leerLaPagina } from '@/lib/mediosDeLaPagina'
import { ruta } from '@/lib/rutas'

/**
 * El equipo de la portada pública (D-277): Chesscore primero y después las
 * filas de la pestaña «Equipo», con su foto por una ruta pública que no entrega
 * nada más que eso.
 *
 * Lo que se prueba es lo que el dueño pidió y lo que lo hace seguro: que lo
 * guardado en la pestaña es lo que se ve, en su orden y detrás de la empresa;
 * que la tarjeta escrita a mano ya no está; y que la ruta de la foto no abre
 * `medios` a quien vaya probando números.
 */

type Fila = Record<string, unknown>
type Condicion = { equals?: unknown; in?: unknown[] }
type Consulta = { collection: string; where?: Record<string, Condicion>; limit?: number; select?: Record<string, boolean> }

/** Un Payload de mentira que filtra por igualdad y por lista, y anota cada consulta. */
function cliente(filas: Record<string, Fila[]>, { falla = false } = {}) {
  const consultas: Consulta[] = []
  const find = (async (opciones: Consulta) => {
    consultas.push(opciones)
    if (falla) throw new Error('la base no responde')
    let docs = [...(filas[opciones.collection] ?? [])]
    for (const [campo, condicion] of Object.entries(opciones.where ?? {})) {
      docs = docs.filter((d) =>
        'in' in condicion ? (condicion.in ?? []).includes(d[campo]) : d[campo] === condicion.equals,
      )
    }
    return { docs: opciones.limit ? docs.slice(0, opciones.limit) : docs }
  }) as unknown as ClienteDeLectura['find']
  return { find, consultas }
}

const EQUIPO: Fila[] = [
  { id: 1, nombre: 'Dr. Tomás Ibáñez Rojas', cargo: 'Director clínico', descripcion: '  Traumatólogo.  ', foto: 10, orden: 1 },
  { id: 2, nombre: 'Zoe Araya', cargo: 'Kinesióloga', descripcion: null, foto: null, orden: 2 },
  // A igual orden, el alfabeto del español: «Álvaro» va antes que «Zoe», no después.
  { id: 3, nombre: 'Álvaro Soto', cargo: 'Desarrollo', foto: 11, orden: 2 },
  // Su foto es un vídeo: no se sirve, y la tarjeta pinta las iniciales.
  { id: 4, nombre: 'Ana Pérez', cargo: 'Edición', foto: 12, orden: 3 },
]
const MEDIOS: Fila[] = [
  { id: 10, filename: 'retrato.jpeg', mimeType: 'image/jpeg', sizes: { ancho: { filename: null, mimeType: null } } },
  { id: 11, filename: 'grande.png', mimeType: 'image/png', sizes: { ancho: { filename: 'grande-1400x2100.png', mimeType: 'image/png' } } },
  { id: 12, filename: 'clip.mp4', mimeType: 'video/mp4' },
  // La radiografía de una ficha: es de `medios`, pero no es la foto de nadie.
  { id: 13, filename: 'radiografia.png', mimeType: 'image/png' },
  { id: 14, filename: 'dibujo.svg', mimeType: 'image/svg+xml' },
]
const BASE = { equipo: EQUIPO, medios: MEDIOS }

describe('el equipo que lee la portada', () => {
  it('sale en el orden de la pestaña: el número de aparición y, a igual número, el nombre en español', async () => {
    const equipo = await leerEquipoPublico(cliente(BASE))
    expect(equipo.map((c) => c.nombre)).toEqual(['Dr. Tomás Ibáñez Rojas', 'Álvaro Soto', 'Zoe Araya', 'Ana Pérez'])
  })

  it('cada tarjeta lleva nombre, cargo, descripción y foto, y nada más', async () => {
    const [primero, , sinFoto] = await leerEquipoPublico(cliente(BASE))
    expect(primero).toEqual({
      id: '1',
      nombre: 'Dr. Tomás Ibáñez Rojas',
      cargo: 'Director clínico',
      descripcion: 'Traumatólogo.',
      foto: direccionDeFotoDelEquipo(10),
    })
    expect(sinFoto).toMatchObject({ nombre: 'Zoe Araya', descripcion: '', foto: null })
  })

  it('la foto va por la ruta pública, con el prefijo de la plataforma', () => {
    // Con `ruta()`: el prefijo sale del entorno, y en esta máquina `.env` trae uno.
    expect(direccionDeFotoDelEquipo(10)).toBe(ruta('/api/foto-del-equipo/10'))
  })

  it('una foto que no es imagen no se ofrece: la tarjeta pinta las iniciales y no un recuadro roto', async () => {
    const equipo = await leerEquipoPublico(cliente(BASE))
    expect(equipo.find((c) => c.nombre === 'Ana Pérez')?.foto).toBeNull()
    // Ni la de un archivo que ya no está en `medios`.
    const sinArchivo = await leerEquipoPublico(cliente({ equipo: [{ id: 9, nombre: 'X Y', cargo: 'Z', foto: 99 }], medios: MEDIOS }))
    expect(sinArchivo[0].foto).toBeNull()
  })

  it('pregunta con la regla abierta y pide solo lo que pinta: quien mira no tiene sesión', async () => {
    const { find, consultas } = cliente(BASE)
    await leerEquipoPublico({ find })
    const [deEquipo, deMedios] = consultas as (Consulta & { overrideAccess?: boolean })[]
    expect(deEquipo).toMatchObject({ collection: 'equipo', overrideAccess: true })
    expect(Object.keys(deEquipo.select ?? {}).sort()).toEqual(['cargo', 'descripcion', 'foto', 'nombre', 'orden'])
    expect(deMedios).toMatchObject({ collection: 'medios', overrideAccess: true, where: { id: { in: [10, 11, 12] } } })
  })

  it('sin nadie con foto no pregunta por los medios', async () => {
    const { find, consultas } = cliente({ equipo: [EQUIPO[1]], medios: MEDIOS })
    await leerEquipoPublico({ find })
    expect(consultas.map((c) => c.collection)).toEqual(['equipo'])
  })

  it('la pestaña «Equipo» ordena con la misma regla que la portada', () => {
    const fuente = readFileSync(resolve('src/app/(frontend)/equipo/page.tsx'), 'utf8')
    expect(fuente).toContain('.sort(ordenDelEquipo)')
    expect([{ nombre: 'b', orden: 1 }, { nombre: 'a', orden: null }].sort(ordenDelEquipo).map((p) => p.nombre)).toEqual([
      'a',
      'b',
    ])
  })
})

describe('la puerta pública de las fotos del equipo', () => {
  it('entrega la foto de alguien del equipo, y la reducida si Payload la hizo', async () => {
    expect(await fotoDelEquipoPublica(cliente(BASE), '10')).toEqual({ nombre: 'retrato.jpeg', tipo: 'image/jpeg' })
    expect(await fotoDelEquipoPublica(cliente(BASE), '11')).toEqual({ nombre: 'grande-1400x2100.png', tipo: 'image/png' })
  })

  it('no entrega un archivo de `medios` que no es la foto de nadie, ni uno que no es imagen', async () => {
    expect(await fotoDelEquipoPublica(cliente(BASE), '13')).toBeNull()
    expect(await fotoDelEquipoPublica(cliente(BASE), '12')).toBeNull()
    expect(await fotoDelEquipoPublica(cliente({ equipo: [{ id: 5, nombre: 'A B', cargo: 'C', foto: 14 }], medios: MEDIOS }), '14')).toBeNull()
    expect(await fotoDelEquipoPublica(cliente(BASE), '999')).toBeNull()
  })

  it('lo que no es un número no llega ni a consultar la base', async () => {
    const { find, consultas } = cliente(BASE, { falla: true })
    for (const malo of ['../../.env', 'retrato.jpeg', '10.0', '-1', '0', '', '1e3']) {
      expect(await fotoDelEquipoPublica({ find }, malo), malo).toBeNull()
    }
    expect(consultas).toEqual([])
  })

  it('sale pública por una hora y no por un año, sin poder ejecutar nada', () => {
    const cabeceras = cabecerasDeFotoDelEquipo(new Headers())
    expect(cabeceras.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(cabeceras.get('X-Content-Type-Options')).toBe('nosniff')
    expect(cabeceras.get('Content-Security-Policy')).toMatch(/default-src 'none'.*sandbox/)
  })

  it('la ruta pregunta a `fotoDelEquipoPublica` y no arma el camino con lo que llega', () => {
    const fuente = readFileSync(resolve('src/app/(frontend)/api/foto-del-equipo/[medio]/route.ts'), 'utf8')
    expect(fuente).toContain('fotoDelEquipoPublica(payload, medio)')
    expect(fuente).toContain('resolve(CARPETA, foto.nombre)')
    expect(fuente).toContain('startsWith(CARPETA + sep)')
  })
})

describe('«Sobre nosotros» en la portada', () => {
  const colaborador = (id: string, nombre: string, cargo: string, foto: string | null = null): ColaboradorPublico => ({
    id,
    nombre,
    cargo,
    descripcion: `Descripción de ${nombre}.`,
    foto,
  })
  const pintar = async (equipo: ColaboradorPublico[], textos: Record<string, string> = {}) => {
    const filas = Object.entries(textos).map(([espacio, texto], i) => ({ id: i + 1, espacio, texto, updatedAt: '2026-11-05' }))
    const pagina = await leerLaPagina({
      find: (async ({ collection }: { collection: string }) => ({
        docs: collection === 'textos-pagina' ? filas : [],
      })) as unknown as ClienteDeLectura['find'],
    })
    return renderToStaticMarkup(createElement(SobreNosotros, { pagina, equipo }))
  }
  const titulos = (html: string) => [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1])

  it('Chesscore va primero y después el equipo, en el orden en que llega', async () => {
    const html = await pintar([colaborador('1', 'Tomás Ibáñez', 'Director clínico'), colaborador('2', 'Zoe Araya', 'Kinesióloga')])
    expect(titulos(html)).toEqual(['Chesscore', 'Tomás Ibáñez', 'Zoe Araya'])
    expect(html).toContain('Director clínico')
    expect(html).toContain('Descripción de Zoe Araya.')
  })

  it('solo salen los de la pestaña: la tarjeta de la persona escrita a mano ya no existe', async () => {
    expect(espacioDeTexto('portada.nosotros.persona.nombre')).toBeUndefined()
    expect(espacioDeTexto('portada.nosotros.persona.cargo')).toBeUndefined()
    expect(titulos(await pintar([]))).toEqual(['Chesscore'])
  })

  it('las tarjetas de la columna derecha bajan, contando con la de la empresa', async () => {
    const equipo = [colaborador('1', 'A B', 'x'), colaborador('2', 'C D', 'y'), colaborador('3', 'E F', 'z')]
    const bajas = (html: string) => [...html.matchAll(/<article class="([^"]*)"/g)].map((m) => m[1].includes('baja'))
    expect(bajas(await pintar(equipo))).toEqual([false, true, false, true])
    // Sin la empresa, el primero pasa a la izquierda.
    expect(bajas(await pintar(equipo, { 'portada.nosotros.empresa.nombre': '' }))).toEqual([false, true, false])
  })

  it('del servidor salen todas con su ventana y sin «Ver más», que aparece al medir en el navegador (D-278)', async () => {
    const html = await pintar([colaborador('1', 'Tomás Ibáñez', 'x'), colaborador('2', 'Zoe Araya', 'y')])
    expect(html.match(/<article /g)).toHaveLength(3)
    expect(html.match(/class="p-tarjeta-ventana"/g)).toHaveLength(3)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('data-recortada')
  })

  it('con foto, el círculo la lleva; sin ella, las iniciales', async () => {
    const html = await pintar([colaborador('1', 'Tomás Ibáñez', 'x', '/api/foto-del-equipo/10'), colaborador('2', 'Zoe Araya', 'y')])
    expect(html).toContain('<img src="/api/foto-del-equipo/10" alt=""')
    expect(html).toContain('>ZA</span>')
  })

  it('las iniciales son del primer nombre y del primer apellido, sin el tratamiento', () => {
    expect(iniciales('Ana María Pérez Soto')).toBe('AP')
    expect(iniciales('Dr. Cristian Andrés Fuentes Vega')).toBe('CF')
    expect(iniciales('Dra. Paula Riquelme')).toBe('PR')
    expect(iniciales('Prof. Juan Díaz')).toBe('JD')
    expect(iniciales('dr Juan Díaz')).toBe('JD')
    expect(iniciales('Zoe')).toBe('Z')
  })
})
