import { describe, it, expect } from 'vitest'
import { bloqueDe } from '@/admin/bloques'
import { coincideConElFiltro, nombreDeArchivoDe, textoDelBloque, type MedioBuscable } from '@/admin/filtroDeBloques'

/**
 * El filtro por texto de los bloques de una pestaña.
 *
 * Existe por las fichas que llegan de un libro (D-144): sus figuras entran como bloques «Imagen» al final de una
 * pestaña, todos con el mismo pie provisional. Lo que se prueba es lo que distingue una figura de otra y la descarga
 * con su nombre de verdad.
 */

const MEDIOS: MedioBuscable[] = [
  { id: '11', etiqueta: 'Figura 3. Fractura de Weber B', url: '/traumahub/api/medios/file/weber-b-p45.png' },
  { id: '12', etiqueta: 'Esquema de la sindesmosis', url: '/api/medios/file/sindesmosis%20tibioperonea.jpg?v=2' },
]

const imagen = (medio: unknown, pie = 'AÑADIR MANUALMENTE') => ({ blockType: 'imagen', imagen: medio, pie })
const esquemaImagen = bloqueDe('imagen')!

describe('nombreDeArchivoDe', () => {
  it('toma el último tramo de la dirección, sin prefijo ni cadena de consulta', () => {
    expect(nombreDeArchivoDe('/traumahub/api/medios/file/weber-b-p45.png')).toBe('weber-b-p45.png')
    expect(nombreDeArchivoDe('/api/medios/file/x.jpg?v=2#a')).toBe('x.jpg')
  })

  it('decodifica los espacios y las tildes que Payload escapa', () => {
    expect(nombreDeArchivoDe('/api/medios/file/sindesmosis%20tibioperonea.jpg')).toBe('sindesmosis tibioperonea.jpg')
  })

  it('con un % suelto devuelve el nombre tal cual en vez de lanzar', () => {
    expect(nombreDeArchivoDe('/api/medios/file/100%.png')).toBe('100%.png')
  })

  it('sin dirección no inventa un nombre', () => {
    expect(nombreDeArchivoDe(undefined)).toBe('')
    expect(nombreDeArchivoDe(null)).toBe('')
  })
})

describe('el texto que se busca en un bloque', () => {
  it('una imagen se busca por su texto alternativo y por el nombre del archivo, no solo por el pie', () => {
    // Todas llevan el mismo pie: el pie no distingue a ninguna.
    const texto = textoDelBloque(esquemaImagen, imagen('11'), MEDIOS)
    expect(coincideConElFiltro(texto, 'weber')).toBe(true)
    expect(coincideConElFiltro(texto, 'p45')).toBe(true)
    expect(coincideConElFiltro(texto, 'sindesmosis')).toBe(false)
  })

  it('la imagen puede venir como id suelto, que se busca en la lista cargada', () => {
    const suelto = textoDelBloque(esquemaImagen, imagen('12'), MEDIOS)
    expect(coincideConElFiltro(suelto, 'sindesmosis')).toBe(true)
  })

  it('o como documento poblado, que se lee sin lista alguna (lo que deja el buscador de archivos)', () => {
    const poblado = textoDelBloque(
      esquemaImagen,
      imagen({ id: 12, alt: 'Esquema del ligamento', filename: 'lig-cruzado-p88.png', url: '/api/medios/file/lig-cruzado-p88.png' }),
      [],
    )
    expect(coincideConElFiltro(poblado, 'ligamento')).toBe(true)
    expect(coincideConElFiltro(poblado, 'p88')).toBe(true)
  })

  it('una imagen sin archivo elegido sigue siendo buscable por su pie', () => {
    const texto = textoDelBloque(esquemaImagen, imagen(null, 'Rx de frente'), MEDIOS)
    expect(coincideConElFiltro(texto, 'rx frente')).toBe(true)
  })

  it('un bloque de texto se busca por su título', () => {
    const esquema = bloqueDe('texto')!
    const texto = textoDelBloque(esquema, { blockType: 'texto', titulo: 'Abordaje posterolateral' }, MEDIOS)
    expect(coincideConElFiltro(texto, 'posterolateral')).toBe(true)
  })
})

describe('coincideConElFiltro', () => {
  const texto = 'imagen figura 3. fractura de weber b weber-b-p45.png'

  it('un filtro vacío o de espacios deja pasar todo', () => {
    expect(coincideConElFiltro(texto, '')).toBe(true)
    expect(coincideConElFiltro(texto, '   ')).toBe(true)
  })

  it('no distingue mayúsculas ni tildes', () => {
    expect(coincideConElFiltro(texto, 'FRÁCTURA')).toBe(true)
  })

  it('pide todas las palabras, en cualquier orden', () => {
    expect(coincideConElFiltro(texto, 'weber figura')).toBe(true)
    expect(coincideConElFiltro(texto, 'weber tibia')).toBe(false)
  })
})
