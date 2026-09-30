import { describe, expect, it } from 'vitest'
import { claveDeCatalogo, convertirSobre } from '@/ingesta/convertir'

const ids = new Map<string, number>([[claveDeCatalogo('segmentos', 'Rodilla'), 7]])

const sobre = (ficha: unknown, extra: Record<string, unknown> = {}) => ({
  formato: 'traumahub/ingesta-1',
  modulo: 'patologias',
  clave: 'prueba',
  procedencia: { origen: 'ia', libro: 'Libro', lote: 'lote-1', archivoFuente: 'a.pdf' },
  notasParaElRevisor: ['una nota'],
  ficha,
  ...extra,
})

const fichaBuena = {
  nombre: 'Rotura del LCA',
  segmento: 'Rodilla',
  tipo: 'trauma',
  definicion: [
    { bloque: 'texto', titulo: 'Qué es', cuerpo: 'Primer párrafo con **negrita**.\n\n- uno\n- dos' },
    { bloque: 'advertencia', tono: 'perla', texto: 'Ojo.' },
  ],
}

describe('convertirSobre', () => {
  it('convierte una ficha buena: catálogo a id, bloques a blockType, Markdown a Lexical', () => {
    const r = convertirSobre(sobre(fichaBuena), ids, 'prueba')
    expect(r.errores).toEqual([])
    expect(r.documento.segmento).toBe(7)
    const bloques = r.documento.definicion as Record<string, unknown>[]
    expect(bloques.map((b) => b.blockType)).toEqual(['texto', 'advertencia'])
    expect(JSON.stringify(bloques[0].cuerpo)).toContain('negrita')
    expect(r.notasParaElRevisor).toEqual(['una nota'])
    expect(r.procedencia.archivoFuente).toBe('a.pdf')
  })

  it('un segmento que no está en el catálogo se pide por nombre y no se inventa', () => {
    const r = convertirSobre(sobre({ ...fichaBuena, segmento: 'Columna' }), ids)
    expect(r.faltanEnCatalogo).toEqual([{ catalogo: 'segmentos', valor: 'Columna' }])
    expect(r.errores.join(' ')).toContain('Columna')
  })

  it('rechaza lo que el formato no admite, sin tocarlo', () => {
    const tabla = convertirSobre(sobre({ ...fichaBuena, definicion: [{ bloque: 'texto', cuerpo: '| a | b |\n|---|---|\n| 1 | 2 |' }] }), ids)
    expect(tabla.errores.length).toBeGreaterThan(0)
    const video = convertirSobre(sobre({ ...fichaBuena, definicion: [{ bloque: 'video' }] }), ids)
    expect(video.errores.join(' ')).toContain('video')
  })

  it('avisa del campo que no es del panel en vez de perderlo en silencio', () => {
    const r = convertirSobre(sobre({ ...fichaBuena, inventado: 'x' }), ids)
    expect(r.errores).toEqual([])
    expect(r.avisos.join(' ')).toContain('inventado')
  })

  it('valida el sobre', () => {
    expect(convertirSobre(null, ids).errores).not.toEqual([])
    expect(convertirSobre(sobre(fichaBuena, { formato: 'otro' }), ids).errores.join(' ')).toContain('formato')
    expect(convertirSobre(sobre(fichaBuena, { clave: 'Mala Clave' }), ids).errores.join(' ')).toContain('clave')
    expect(convertirSobre(sobre(fichaBuena), ids, 'otro-nombre').errores.join(' ')).toContain('no coincide')
    expect(convertirSobre(sobre(fichaBuena, { procedencia: { origen: 'ia' } }), ids).errores.join(' ')).toContain('procedencia.libro')
  })

  it('las cirugías no se importan', () => {
    const r = convertirSobre(sobre({}, { modulo: 'cirugias' }), ids)
    expect(r.errores.join(' ')).toContain('cirugías')
  })

  it('un valor de selección fuera de la lista es un error, no un valor corregido', () => {
    const r = convertirSobre(sobre({ ...fichaBuena, tipo: 'otro' }), ids)
    expect(r.errores.join(' ')).toContain('tipo')
  })
})
