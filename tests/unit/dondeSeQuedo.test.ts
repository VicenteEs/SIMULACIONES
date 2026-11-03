import { describe, it, expect } from 'vitest'
import { COLUMNAS_PARA_SABERLO, dondeSeQuedo } from '@/lib/dondeSeQuedo'
import { PESTANAS_FICHA } from '@/lib/fichas'

/**
 * «Continúa leyendo» con el sitio donde se quedó (D-237).
 *
 * La sección se guarda como número sobre la lista fija de pestañas, y lo que
 * se enseña es la posición entre las que la ficha tiene escritas: una ficha sin
 * «Mecanismo» tiene cinco pestañas, y «Clasificación» es la segunda, no la
 * tercera. Si esa traducción se pierde, la tarjeta dice «Pestaña 3 de 5» de
 * una pestaña que en pantalla es la segunda, y nada falla.
 */

const bloque = [{ blockType: 'texto', id: 'x' }]
const fichaCompleta = Object.fromEntries(PESTANAS_FICHA.map((p) => [p.campo, bloque]))

describe('en una ficha de patología', () => {
  it('nombra la pestaña y su ancla', () => {
    expect(dondeSeQuedo('patologias', fichaCompleta, 3)).toEqual({
      rotulo: 'Pestaña',
      numero: 3,
      total: 6,
      nombre: 'Clasificación',
      ancla: '#clasificacion',
    })
  })

  it('cuenta solo las pestañas que la ficha tiene escritas', () => {
    const sinMecanismo = { ...fichaCompleta, mecanismo: [] }
    const donde = dondeSeQuedo('patologias', sinMecanismo, 3)
    expect(donde?.numero).toBe(2)
    expect(donde?.total).toBe(5)
    expect(donde?.nombre).toBe('Clasificación')
  })

  it('la rehabilitación con solo fases también cuenta como pestaña', () => {
    const conFases = { ...fichaCompleta, rehabilitacion: [], fases: [{ nombre: 'Fase 1' }] }
    expect(dondeSeQuedo('patologias', conFases, 6)?.nombre).toBe('Rehabilitación')
  })

  it('una pestaña que la ficha ya no tiene no se ofrece', () => {
    // Se quedó en «Mecanismo» y después el autor la vació: «Pestaña 2» de una
    // pestaña que no existe llevaría a un ancla vacía.
    expect(dondeSeQuedo('patologias', { ...fichaCompleta, mecanismo: [] }, 2)).toBeNull()
    expect(dondeSeQuedo('patologias', fichaCompleta, 7)).toBeNull()
  })
})

describe('en una técnica AO', () => {
  const caso = { titulo: 'Placa', pasos: [{ titulo: 'Reducción' }, { titulo: 'Compresión' }, { titulo: '  ' }] }

  it('nombra el paso y su ancla', () => {
    expect(dondeSeQuedo('casos-ao', caso, 2)).toEqual({
      rotulo: 'Paso',
      numero: 2,
      total: 3,
      nombre: 'Compresión',
      ancla: '#paso-2',
    })
  })

  it('un paso borrado o sin título no se ofrece', () => {
    expect(dondeSeQuedo('casos-ao', caso, 4)).toBeNull()
    expect(dondeSeQuedo('casos-ao', caso, 3)).toBeNull()
    expect(dondeSeQuedo('casos-ao', { titulo: 'Sin pasos' }, 1)).toBeNull()
  })
})

describe('lo que no tiene secciones', () => {
  it('el simulador, el examen físico y las imágenes no dicen dónde', () => {
    // El simulador tiene pasos, pero la consola vuelve siempre al primero:
    // decir «Paso 3 de 7» con «Retomar» sería prometer algo que no hace.
    expect(dondeSeQuedo('cirugias', { pasos: [{ titulo: 'Uno' }] }, 1)).toBeNull()
    expect(dondeSeQuedo('maniobras', {}, 1)).toBeNull()
    expect(dondeSeQuedo('estudios-ia', {}, 1)).toBeNull()
  })

  it('sin sección guardada, o con una que no es un entero positivo, tampoco', () => {
    expect(dondeSeQuedo('patologias', fichaCompleta, null)).toBeNull()
    expect(dondeSeQuedo('patologias', fichaCompleta, undefined)).toBeNull()
    expect(dondeSeQuedo('patologias', fichaCompleta, 0)).toBeNull()
    expect(dondeSeQuedo('patologias', fichaCompleta, 2.5)).toBeNull()
    expect(dondeSeQuedo('patologias', fichaCompleta, '3')).toBeNull()
  })
})

describe('lo que se pide a la base para saberlo', () => {
  it('trae cada campo que mira, y no los documentos enteros', () => {
    for (const p of PESTANAS_FICHA) expect(COLUMNAS_PARA_SABERLO.patologias[p.campo]).toBe(true)
    expect(COLUMNAS_PARA_SABERLO.patologias.fases).toBe(true)
    expect(COLUMNAS_PARA_SABERLO['casos-ao']).toEqual({ titulo: true, pasos: true })
    expect(COLUMNAS_PARA_SABERLO.cirugias).toBeUndefined()
  })
})
