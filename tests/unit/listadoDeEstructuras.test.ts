import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import { contarEstructuras, type FilaDeEstructura } from '@/lib/estructuras'
import { armarListado } from '@/lib/listadoDeEstructuras'

/** El listado que enseña la pantalla de estructuras (D-179, P-003 E8.4). */

const catalogo = corregirCatalogo(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/atlas/catalogo.json'), 'utf8')) as CatalogoDelAtlas,
)
const idDe = (nombre: string) => catalogo.piezas.find((p) => p.nombre === nombre)!.id
const fila = (atlasId: string, extra: Partial<FilaDeEstructura> = {}): FilaDeEstructura => ({
  id: atlasId,
  atlasId,
  nombreOriginal: 'x',
  ...extra,
})

describe('armar el listado', () => {
  it('sin fichas en la base, enseña todo el atlas como sin empezar y dice cuántas faltan por sembrar', () => {
    const listado = armarListado(catalogo, [])
    expect(listado.filas).toHaveLength(catalogo.piezas.length)
    expect(listado.sinSembrar).toBe(catalogo.piezas.length)
    expect(listado.filas.every((f) => f.estado === 'sin-empezar' && !f.sembrada)).toBe(true)
  })

  it('enseña el nombre del taller, en español, con el original al lado', () => {
    const tibia = armarListado(catalogo, []).filas.find((f) => f.atlasId === idDe('Right tibia'))!
    expect(tibia.nombre).toBe('Tibia derecha')
    expect(tibia.original).toBe('Right tibia')
    expect(tibia.lado).toBe('derecho')
  })

  it('el sistema sale del catálogo corregido, no de lo que quedó guardado en la fila', () => {
    const peroneo = idDe('Right fibularis brevis')
    const listado = armarListado(catalogo, [fila(peroneo, { sistema: 'skeletal', nombreOriginal: 'Right fibularis brevis' })])
    const f = listado.filas.find((x) => x.atlasId === peroneo)!
    expect(f.sistema).toBe('muscular')
    // Como músculo se le piden seis campos, no los dos de un hueso.
    expect(f.faltan).toHaveLength(6)
    expect(f.sembrada).toBe(true)
  })

  it('el estado sale de lo escrito: completa, a medias, oculta', () => {
    const tibia = idDe('Right tibia')
    const femur = idDe('Right femur')
    // Un órgano cualquiera del aparato digestivo: de los que Cristóbal no querrá abrir ficha.
    const higado = catalogo.piezas.find((p) => p.sistema === 'digestive')!.id
    const listado = armarListado(catalogo, [
      fila(tibia, { definicion: 'Hueso medial de la pierna.', irrigacion: 'Arteria nutricia de la tibia.' }),
      fila(femur, { definicion: 'Hueso del muslo.' }),
      fila(higado, { oculta: true }),
    ])
    const estado = (id: string) => listado.filas.find((f) => f.atlasId === id)!.estado
    expect(estado(tibia)).toBe('completa')
    expect(estado(femur)).toBe('a-medias')
    expect(listado.filas.find((f) => f.atlasId === femur)!.faltan).toEqual(['irrigacion'])
    expect(estado(higado)).toBe('oculta')
    expect(estado(idDe('Left tibia'))).toBe('sin-empezar')
  })

  it('una ficha cuya pieza ya no está en el atlas se enseña aparte, no se pierde', () => {
    const listado = armarListado(catalogo, [
      fila('FJ-QUE-YA-NO-ESTA', {
        nombreOriginal: 'Right tibia',
        sistema: 'skeletal',
        region: 'miembro-inferior-derecho',
        lado: 'derecho',
        definicion: 'Escrita antes de regenerar el atlas',
        huerfana: true,
      }),
    ])
    const huerfana = listado.filas.find((f) => f.atlasId === 'FJ-QUE-YA-NO-ESTA')!
    expect(huerfana.estado).toBe('sin-pieza')
    expect(huerfana.nombre).toBe('Tibia derecha')
    expect(listado.filas).toHaveLength(catalogo.piezas.length + 1)
    // Y no cuenta como una pieza más del atlas.
    expect(contarEstructuras(listado.filas).total).toBe(catalogo.piezas.length)
  })

  it('una marca «sin pieza» sobre una pieza que sí está en el catálogo no la saca del listado', () => {
    const tibia = idDe('Right tibia')
    const listado = armarListado(catalogo, [fila(tibia, { huerfana: true, definicion: 'Algo' })])
    expect(listado.filas.find((f) => f.atlasId === tibia)!.estado).toBe('a-medias')
  })

  it('va en el orden de las regiones del atlas y, dentro de cada una, por nombre', () => {
    const { filas, regiones } = armarListado(catalogo, [])
    const orden = regiones.map((r) => r.id)
    let ultimo = -1
    for (const f of filas) {
      const i = orden.indexOf(f.region)
      expect(i).toBeGreaterThanOrEqual(ultimo)
      ultimo = i
    }
    const cabeza = filas.filter((f) => f.region === 'cabeza').map((f) => f.nombre)
    expect(cabeza).toEqual([...cabeza].sort((a, b) => a.localeCompare(b, 'es')))
  })

  it('el contador sobre el atlas real da 2.231 pendientes antes de escribir nada', () => {
    const conteo = contarEstructuras(armarListado(catalogo, []).filas)
    expect(conteo).toMatchObject({ porLlenar: 2231, pendientes: 2231, completas: 0, porcentajeCompletas: 0 })
  })
})
