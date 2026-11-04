/**
 * El encuadre de cada paso (P-009, mejora de uso 1): de los diez números que guarda el paso a la cámara, y de vuelta.
 * Un paso de antes de P-009 trae las diez columnas vacías, y eso tiene que leerse como «sin encuadre» y no como una
 * cámara en el origen mirando a ninguna parte.
 */
import { describe, expect, it } from 'vitest'

import { encuadreDelGrupo, grupoDelEncuadre, posicionDelPaso, type EncuadreDelPaso } from '@/lib/encuadreDelPaso'

const ENCUADRE: EncuadreDelPaso = {
  direccion: [0, 0, 1],
  arriba: [0, 1, 0],
  centro: [0.014, -0.079, -0.032],
  distancia: 0.23,
}

describe('el encuadre del paso', () => {
  it('va y vuelve por los diez números sin perder nada', () => {
    const grupo = grupoDelEncuadre(ENCUADRE)
    expect(Object.keys(grupo)).toHaveLength(10)
    expect(encuadreDelGrupo(grupo)).toEqual(ENCUADRE)
  })

  it('deja unitarias la dirección y el arriba: el formulario puede guardar cualquier largo', () => {
    const e = encuadreDelGrupo({ ...grupoDelEncuadre(ENCUADRE), dx: 0, dy: 0, dz: 4, ax: 0, ay: 2, az: 0 })
    expect(e?.direccion).toEqual([0, 0, 1])
    expect(e?.arriba).toEqual([0, 1, 0])
  })

  it('un grupo a medias, vacío o con la dirección nula no es un encuadre', () => {
    expect(encuadreDelGrupo(null)).toBeNull()
    expect(encuadreDelGrupo({})).toBeNull()
    // Lo que trae un paso de antes de P-009: las diez columnas, todas vacías.
    expect(
      encuadreDelGrupo({
        dx: null,
        dy: null,
        dz: null,
        ax: null,
        ay: null,
        az: null,
        cx: null,
        cy: null,
        cz: null,
        distancia: null,
      }),
    ).toBeNull()
    expect(encuadreDelGrupo({ ...grupoDelEncuadre(ENCUADRE), cz: undefined })).toBeNull()
    expect(encuadreDelGrupo({ ...grupoDelEncuadre(ENCUADRE), dx: 0, dy: 0, dz: 0 })).toBeNull()
    expect(encuadreDelGrupo({ ...grupoDelEncuadre(ENCUADRE), distancia: 0 })).toBeNull()
    expect(encuadreDelGrupo({ ...grupoDelEncuadre(ENCUADRE), cx: Number.NaN })).toBeNull()
  })

  it('la posición del paciente es una de las tres, o ninguna', () => {
    expect(posicionDelPaso('supino')).toBe('supino')
    expect(posicionDelPaso('de-pie')).toBe('de-pie')
    expect(posicionDelPaso('prono')).toBe('prono')
    expect(posicionDelPaso('sentado')).toBeNull()
    expect(posicionDelPaso(null)).toBeNull()
  })
})
