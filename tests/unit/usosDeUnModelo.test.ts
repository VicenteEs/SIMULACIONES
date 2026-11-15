import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/(frontend)/acciones/modelos', () => ({ reemplazarModeloEnTodo: vi.fn() }))

import {
  clasificarColumnas,
  etiquetaDeModelo,
  mensajeDeModeloEnUso,
  mensajeDePreparacionEliminada,
  ModeloEnUso,
  type UsoDelModelo,
} from '@/lib/usosDeUnModelo'
import { UsosDelModelo } from '@/components/admin/UsosDelModelo'
import { Modelos3D } from '@/collections/Modelos3D'
import { negarElBorradoDeUnModeloEnUso } from '@/collections/hooks/modeloEnUso'

/**
 * Un modelo en uso no se borra (D-372): lo que se puede probar sin base. Que el
 * catálogo real se entienda entero, que el borrado se niegue y que el reemplazo
 * llegue a todo lo prueba `tests/integration/usosDeUnModelo.test.ts`.
 */

const SLUGS = ['cirugias', 'casos-ao', 'instrumental']

describe('la clasificación de las columnas', () => {
  it('cada columna sale con su colección y su vía', () => {
    const { donde, sinClasificar } = clasificarColumnas(
      [
        { tabla: 'cirugias', columna: 'modelo_id', padre: null },
        { tabla: '_cirugias_v', columna: 'version_modelo_id', padre: null },
        { tabla: 'casos_ao_pasos', columna: 'modelo_id', padre: 'casos_ao' },
        { tabla: '_casos_ao_v_version_pasos', columna: 'modelo_id', padre: '_casos_ao_v' },
      ],
      SLUGS,
    )
    expect(sinClasificar).toEqual([])
    expect(donde.map((d) => `${d.coleccion}:${d.via}`)).toEqual([
      'cirugias:documento',
      'cirugias:version',
      'casos-ao:hija',
      'casos-ao:hija-de-version',
    ])
  })

  it('las de Payload no cuentan, y lo que no se sabe leer se dice', () => {
    const rara = { tabla: 'casos_ao_pasos_piezas', columna: 'modelo_id', padre: 'casos_ao_pasos' }
    const { donde, sinClasificar } = clasificarColumnas(
      [{ tabla: 'payload_locked_documents_rels', columna: 'modelos_3d_id', padre: null }, rara],
      SLUGS,
    )
    expect(donde).toEqual([])
    // Una lista dentro de una lista: hoy no existe, y el día que exista tiene que pararlo todo (la prueba de
    // integración exige que esta lista esté vacía contra la base real).
    expect(sinClasificar).toEqual([rara])
  })
})

const uso = (n: number, coleccion = 'cirugias', etiqueta = 'Cirugía simulada'): UsoDelModelo => ({
  coleccion,
  id: String(n),
  titulo: `Caso ${n}`,
  etiqueta,
})

describe('el aviso del borrado', () => {
  it('nombra lo que lo usa, con su etiqueta tal cual, y manda a «Reemplazar por…»', () => {
    const texto = mensajeDeModeloEnUso([uso(1), uso(2, 'casos-ao', 'Caso AO')])
    expect(texto).toMatch(/^No se borró: lo usan 2: «Caso 1» \(Cirugía simulada\), «Caso 2» \(Caso AO\)\./)
    expect(texto).toMatch(/se quedarían sin modelo/)
    expect(texto).toMatch(/Cámbielo en todos a la vez con «Reemplazar por…»/)
  })

  it('nombra ocho y cuenta el resto', () => {
    const texto = mensajeDeModeloEnUso(Array.from({ length: 11 }, (_, i) => uso(i + 1)))
    expect(texto).toMatch(/«Caso 8» \(Cirugía simulada\) y 3 más\./)
    expect(texto).not.toMatch(/Caso 9/)
  })

  it('lo de módulos que no edita cuenta sin nombrarse, y el reemplazo pasa a un administrador', () => {
    const texto = mensajeDeModeloEnUso([uso(1), uso(2, 'patologias', 'Patología')], (u) => u.coleccion !== 'patologias')
    expect(texto).toMatch(/lo usan 2: «Caso 1» \(Cirugía simulada\); uno de un módulo que usted no edita\./)
    expect(texto).not.toMatch(/Caso 2/)
    expect(texto).toMatch(/Pídale a un administrador/)
  })

  it('llega por la API con su texto y un 409', () => {
    const error = new ModeloEnUso([uso(1)])
    expect(error.status).toBe(409)
    expect(error.isPublic).toBe(true)
    expect(error.message).toMatch(/^No se borró: lo usa «Caso 1»/)
  })
})

describe('la etiqueta en el desplegable', () => {
  it('lleva el número y la fecha, y «sin usar» solo cuando se sabe', () => {
    const modelo = { id: 112, nombre: 'ejemplo_vicente · del atlas', createdAt: '2026-11-04T16:40:00.000Z' }
    expect(etiquetaDeModelo(modelo, false)).toMatch(/^ejemplo_vicente · del atlas · #112 · 4 nov\.? 2026 · sin usar$/)
    expect(etiquetaDeModelo(modelo, true)).not.toMatch(/sin usar/)
    expect(etiquetaDeModelo(modelo)).not.toMatch(/sin usar/)
    expect(etiquetaDeModelo({ id: 3 })).toBe('Sin nombre · #3')
  })
})

describe('al borrar una preparación', () => {
  it('dice cuántos modelos se fueron con ella y cuáles se quedan', () => {
    expect(mensajeDePreparacionEliminada({ modelosBorrados: 0, modelosQueSeQuedan: [] })).toBe('Preparación eliminada.')
    expect(mensajeDePreparacionEliminada({ modelosBorrados: 1, modelosQueSeQuedan: [] })).toBe(
      'Preparación eliminada, con el modelo que exportó.',
    )
    expect(mensajeDePreparacionEliminada({ modelosBorrados: 3, modelosQueSeQuedan: ['Tibia · #111'] })).toBe(
      'Preparación eliminada, con los 3 modelos que exportó. Se queda «Tibia · #111», porque algo lo usa: en la ficha del modelo se ve qué.',
    )
    expect(mensajeDePreparacionEliminada(undefined)).toBe('Preparación eliminada.')
  })
})

describe('«Dónde se usa» en la ficha del modelo', () => {
  const pintar = (props: Partial<Parameters<typeof UsosDelModelo>[0]>) =>
    renderToStaticMarkup(
      createElement(UsosDelModelo, { modeloId: '7', usos: [], ajenos: 0, candidatos: [], ...props }),
    )

  it('sin usos, dice que se puede borrar', () => {
    expect(pintar({})).toMatch(/Nada usa este modelo/)
  })

  it('con usos, los enlaza y ofrece el reemplazo con los de su carpeta', () => {
    const html = pintar({
      usos: [{ clave: 'cirugias:5', titulo: 'Fractura de tibia', etiqueta: 'Cirugía simulada', href: '/admin-panel/contenido/cirugias/5' }],
      candidatos: [{ id: '8', etiqueta: 'Tibia · #8' }],
    })
    expect(html).toMatch(/Lo usa 1 sitio\./)
    expect(html).toMatch(/href="\/admin-panel\/contenido\/cirugias\/5"/)
    expect(html).toMatch(/Reemplazar por…/)
    expect(html).toMatch(/<option value="8">Tibia · #8<\/option>/)
  })

  it('con usos ajenos, no ofrece el reemplazo', () => {
    const html = pintar({ ajenos: 2, candidatos: [{ id: '8', etiqueta: 'Tibia · #8' }] })
    expect(html).toMatch(/Y 2 de módulos que usted no edita/)
    expect(html).not.toMatch(/<select/)
  })
})

describe('el cable', () => {
  const fuente = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

  it('la colección niega el borrado desde su gancho, que cubre el panel, el listado y la API', () => {
    expect(Modelos3D.hooks?.beforeDelete).toContain(negarElBorradoDeUnModeloEnUso)
  })

  it('borrar una preparación busca sus modelos antes, porque la base pone la relación a nulo al borrarla', () => {
    const atlas = fuente('src/app/(frontend)/acciones/atlas.ts')
    const cuerpo = atlas.slice(atlas.indexOf('export async function eliminarInstancia'))
    const buscar = cuerpo.indexOf("where: { preparacion: { equals: identificador } }")
    const borrar = cuerpo.indexOf("collection: 'instancias-atlas',\n      id: identificador")
    expect(buscar).toBeGreaterThan(-1)
    expect(borrar).toBeGreaterThan(buscar)
    // Y cada modelo pasa por el borrado de siempre, el que niega el gancho si algo lo usa.
    expect(cuerpo.slice(borrar)).toMatch(/payload\.delete\(\{ collection: 'modelos-3d'/)
  })

  it('el desplegable vuelve a pedir su lista al abrirse, pero no en cada clic', () => {
    const selector = fuente('src/components/admin/formulario/SelectorConBusqueda.tsx')
    const abrir = selector.slice(selector.indexOf('function abrir()'), selector.indexOf('function cerrar()'))
    expect(abrir).toMatch(/ahora - pedidaAlAbrir\.current > REFRESCO_AL_ABRIR_MS/)
    expect(abrir).toMatch(/alRecargar\(\)/)
  })

  it('la ficha pinta «Dónde se usa» solo en los modelos', () => {
    const pagina = fuente('src/app/(frontend)/admin-panel/contenido/[coleccion]/[id]/page.tsx')
    expect(pagina).toMatch(/esquema\.slug === 'modelos-3d'\s*\?\s*await anexoDelModelo\(/)
    expect(fuente('src/components/admin/FormularioDocumento.tsx')).toMatch(/\{anexo\}/)
  })
})
