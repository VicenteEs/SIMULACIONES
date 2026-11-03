import { describe, it, expect } from 'vitest'
import {
  buscarManiobras,
  maniobraDelAncla,
  normalizarBusqueda,
  segmentoDe,
  separarVideo,
  textoBuscable,
  vecinasDe,
  type SegmentoDeLaLista,
} from '@/lib/listaDeManiobras'

/**
 * La lista del examen físico en dos columnas (D-237).
 *
 * Lo que se sostiene aquí no se ve en ninguna captura: que el buscador
 * encuentre lo que dice la fila, que «Siguiente» no salte de segmento y que un
 * ancla escrita a mano no deje el detalle en blanco.
 */

const maniobra = (id: string, nombre: string, evalua: string) => ({
  id,
  nombre,
  evalua,
  busqueda: textoBuscable({ nombre, evalua }),
  leida: false,
})

const SEGMENTOS: SegmentoDeLaLista[] = [
  {
    clave: 'segmento-1',
    titulo: 'Hombro',
    maniobras: [maniobra('10', 'Jobe', 'Supraespinoso'), maniobra('11', 'Neer', 'Pinzamiento subacromial')],
  },
  {
    clave: 'segmento-2',
    titulo: 'Rodilla',
    maniobras: [
      maniobra('20', 'Maniobra de Lachman', 'Integridad del ligamento cruzado anterior'),
      maniobra('21', 'Cajón anterior', 'Traslación anterior de la tibia'),
      maniobra('22', 'McMurray', 'Lesión de menisco'),
    ],
  },
]

describe('la búsqueda', () => {
  it('no distingue tildes ni mayúsculas, en ninguno de los dos lados', () => {
    expect(normalizarBusqueda('  Traslación   ANTERIOR ')).toBe('traslacion anterior')
    expect(buscarManiobras(SEGMENTOS, 'cajon').map((r) => r.maniobra.id)).toEqual(['21'])
    expect(buscarManiobras(SEGMENTOS, 'CAJÓN').map((r) => r.maniobra.id)).toEqual(['21'])
  })

  it('busca en lo que evalúa, no solo en el nombre', () => {
    expect(buscarManiobras(SEGMENTOS, 'menisco').map((r) => r.maniobra.id)).toEqual(['22'])
  })

  it('pide cada palabra, en cualquier orden', () => {
    expect(buscarManiobras(SEGMENTOS, 'anterior tibia').map((r) => r.maniobra.id)).toEqual(['21'])
    expect(buscarManiobras(SEGMENTOS, 'anterior').map((r) => r.maniobra.id)).toEqual(['20', '21'])
    expect(buscarManiobras(SEGMENTOS, 'anterior hombro')).toEqual([])
  })

  it('cruza segmentos, en el orden de la página, y dice de cuál es cada una', () => {
    const resultado = buscarManiobras(SEGMENTOS, 'e')
    expect(resultado.map((r) => r.maniobra.id)).toEqual(['10', '11', '20', '21', '22'])
    expect(resultado[2].segmento.titulo).toBe('Rodilla')
  })

  it('vacía no devuelve nada: entonces manda el segmento elegido', () => {
    expect(buscarManiobras(SEGMENTOS, '')).toEqual([])
    expect(buscarManiobras(SEGMENTOS, '   ')).toEqual([])
  })
})

describe('la anterior y la siguiente', () => {
  it('son las filas de arriba y de abajo del mismo segmento', () => {
    const { anterior, siguiente } = vecinasDe(SEGMENTOS, '21')
    expect(anterior?.id).toBe('20')
    expect(siguiente?.id).toBe('22')
  })

  it('no saltan a otro segmento ni dan la vuelta', () => {
    expect(vecinasDe(SEGMENTOS, '11')).toEqual({ anterior: SEGMENTOS[0].maniobras[0], siguiente: null })
    expect(vecinasDe(SEGMENTOS, '20').anterior).toBeNull()
  })

  it('una maniobra que no está en la lista no tiene vecinas', () => {
    expect(vecinasDe(SEGMENTOS, '999')).toEqual({ anterior: null, siguiente: null })
  })
})

describe('el ancla', () => {
  it('elige la maniobra que nombra, y encuentra su segmento', () => {
    expect(maniobraDelAncla(SEGMENTOS, '#maniobra-22', '#maniobra-')).toBe('22')
    expect(segmentoDe(SEGMENTOS, '22')?.titulo).toBe('Rodilla')
  })

  it('ignora la que no está pintada y la que no es de maniobra', () => {
    // Escrita a mano en la barra de direcciones: se queda la que había, en vez
    // de dejar el detalle en blanco.
    expect(maniobraDelAncla(SEGMENTOS, '#maniobra-999', '#maniobra-')).toBeNull()
    expect(maniobraDelAncla(SEGMENTOS, '#clasificacion', '#maniobra-')).toBeNull()
    expect(maniobraDelAncla(SEGMENTOS, '', '#maniobra-')).toBeNull()
  })
})

describe('el video del material adicional', () => {
  it('sube el primero y deja el resto donde estaba', () => {
    const bloques = [
      { blockType: 'texto', id: 'a' },
      { blockType: 'video', id: 'b' },
      { blockType: 'imagen', id: 'c' },
      { blockType: 'video', id: 'd' },
    ]
    const { video, resto } = separarVideo<{ blockType: string; id: string }>(bloques)
    expect(video?.id).toBe('b')
    expect(resto.map((b) => b.id)).toEqual(['a', 'c', 'd'])
  })

  it('sin video, o sin bloques, no inventa nada', () => {
    expect(separarVideo([{ blockType: 'texto' }])).toEqual({ video: null, resto: [{ blockType: 'texto' }] })
    expect(separarVideo(undefined)).toEqual({ video: null, resto: [] })
    expect(separarVideo(null)).toEqual({ video: null, resto: [] })
  })
})
