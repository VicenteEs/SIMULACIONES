import { describe, expect, it } from 'vitest'
import { apilar, avanceDeLaFila, avanceValido, INSTANTANEA_VACIA, TOPE_DEL_AVANCE, type AvanceDelCaso } from '@/lib/avanceDelCaso'
import {
  cogerEnLaMesa,
  EN_EL_MENU,
  instrumentoDeLaTecla,
  instrumentosDelMenu,
  MESA_VACIA,
  posicionEnElAro,
  sitiosDeLaMesa,
  type MesaDeMayo,
} from '@/lib/menuRadial'

const avance = (cambios: Partial<AvanceDelCaso> = {}): AvanceDelCaso => ({
  v: 1,
  paso: 3,
  modo: 'practica',
  puntaje: 20,
  resueltos: ['a', 'b'],
  fallados: ['b'],
  complicados: [],
  automaticas: [],
  complicaciones: [],
  insumos: {},
  instantanea: { sesion: '{"v":3}', colocado: '' },
  guardadoEn: '2026-11-04T10:00:00.000Z',
  ...cambios,
})

describe('el avance guardado en la cuenta (P-009, mejora de uso 12)', () => {
  it('pasa entero lo que manda la consola, y `null` es «no hay avance»', () => {
    expect(avanceValido(avance())).toEqual(avance())
    expect(avanceValido(null)).toBeNull()
  })

  it('rechaza lo que no es un avance, con un mensaje que dice qué falla', () => {
    expect(() => avanceValido({ ...avance(), v: 2 })).toThrow(/versión/)
    expect(() => avanceValido({ ...avance(), paso: -1 })).toThrow(/paso/)
    expect(() => avanceValido({ ...avance(), modo: 'examen' })).toThrow(/modo/)
    expect(() => avanceValido({ ...avance(), instantanea: { sesion: 3 } })).toThrow(/paciente/)
    expect(() => avanceValido({ ...avance(), resueltos: [1, 2] })).toThrow(/superados/)
    expect(() => avanceValido({ ...avance(), guardadoEn: 'ayer' })).toThrow(/fecha/)
    expect(() => avanceValido('{}')).toThrow()
  })

  it('no deja que la fila crezca sin freno', () => {
    const enorme = avance({ instantanea: { sesion: 'x'.repeat(TOPE_DEL_AVANCE), colocado: '' } })
    expect(() => avanceValido(enorme)).toThrow(/demasiado/)
  })

  it('al leer la fila no se cae: lo raro y el paso que ya no existe son «sin avance»', () => {
    expect(avanceDeLaFila({ avance: avance() }, 7)?.paso).toBe(3)
    expect(avanceDeLaFila({ avance: avance({ paso: 7 }) }, 7)).toBeNull()
    expect(avanceDeLaFila({ avance: { v: 1 } }, 7)).toBeNull()
    expect(avanceDeLaFila({}, 7)).toBeNull()
    expect(avanceDeLaFila(null, 7)).toBeNull()
  })
})

describe('la pila de «Deshacer» (P-009, mejora de uso 10)', () => {
  const de = (n: number) => ({ sesion: `s${n}`, colocado: '' })

  it('no repite el último estado: la escena que vuelve tras deshacer no se apila otra vez', () => {
    const pila = apilar([INSTANTANEA_VACIA], de(1))
    expect(apilar(pila, de(1))).toBe(pila)
    expect(apilar(pila, de(2))).toHaveLength(3)
  })

  it('con el tope, se cae lo más viejo menos el principio del paso', () => {
    let pila = [de(0)]
    for (let i = 1; i <= 40; i++) pila = apilar(pila, de(i), 10)
    expect(pila).toHaveLength(10)
    expect(pila[0]).toEqual(de(0))
    expect(pila[pila.length - 1]).toEqual(de(40))
    expect(pila[1]).toEqual(de(32))
  })
})

describe('el menú radial y los atajos (P-009, mejora de uso 9)', () => {
  it('los cinco últimos cogidos, sin repetidos', () => {
    expect(instrumentosDelMenu(['a', 'b', 'a', 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(EN_EL_MENU).toBe(5)
  })

  it('el primero arriba y los demás en el sentido del reloj', () => {
    expect(posicionEnElAro(0, 4, 60)).toEqual({ x: 0, y: -60 })
    expect(posicionEnElAro(1, 4, 60)).toEqual({ x: 60, y: 0 })
    expect(posicionEnElAro(2, 4, 60)).toEqual({ x: 0, y: 60 })
  })

  // Coger uno tras otro, como en la consola.
  const cogiendo = (...ids: string[]): MesaDeMayo => ids.reduce(cogerEnLaMesa, MESA_VACIA)

  it('1 a 5 cogen el de su sitio; Q vuelve al anterior, o al último si la mano está vacía', () => {
    // La tornillo se cogió el último, pero sigue en el sitio 3: el sitio es el del orden de llegada.
    const mesa = cogiendo('broca', 'medidor', 'tornillo')
    expect(mesa.sitios).toEqual(['broca', 'medidor', 'tornillo', null, null])
    expect(instrumentoDeLaTecla('2', mesa, 'tornillo')).toBe('medidor')
    expect(instrumentoDeLaTecla('5', mesa, 'tornillo')).toBeNull()
    expect(instrumentoDeLaTecla('q', mesa, 'tornillo')).toBe('medidor')
    expect(instrumentoDeLaTecla('Q', mesa, null)).toBe('tornillo')
    expect(instrumentoDeLaTecla('q', cogiendo('broca'), 'broca')).toBeNull()
    expect(instrumentoDeLaTecla('x', mesa, null)).toBeNull()
    expect(instrumentoDeLaTecla('1', MESA_VACIA, null)).toBeNull()
  })
})

describe('la mesa de Mayo, con sitios fijos (P-012 E5)', () => {
  const cogiendo = (...ids: string[]): MesaDeMayo => ids.reduce(cogerEnLaMesa, MESA_VACIA)

  it('volver a coger uno no mueve a nadie: la broca sigue siendo el 1 después de coger el medidor', () => {
    // Era el fallo de antes: la tecla 1 era siempre la última cogida, y cada instrumento renumeraba a los demás.
    const mesa = cogiendo('broca', 'medidor', 'broca', 'medidor', 'broca')
    expect(mesa.sitios.slice(0, 2)).toEqual(['broca', 'medidor'])
    expect(instrumentoDeLaTecla('1', mesa, 'broca')).toBe('broca')
    expect(instrumentoDeLaTecla('2', mesa, 'broca')).toBe('medidor')
  })

  it('con la mesa llena, el que entra ocupa el sitio del que lleva más tiempo sin usarse', () => {
    const llena = cogiendo('a', 'b', 'c', 'd', 'e')
    expect(llena.sitios).toEqual(['a', 'b', 'c', 'd', 'e'])
    // Se vuelve a la «a»: el que lleva más tiempo sin usarse pasa a ser la «b».
    const conF = cogiendo('a', 'b', 'c', 'd', 'e', 'a', 'f')
    expect(conF.sitios).toEqual(['a', 'f', 'c', 'd', 'e'])
    // Los demás no se movieron de su tecla.
    for (const [i, id] of ['a', null, 'c', 'd', 'e'].entries()) if (id) expect(conF.sitios[i]).toBe(id)
  })

  it('el que vuelve tras salir de la mesa ocupa un sitio libre, no el suyo de antes a la fuerza', () => {
    const mesa = cogiendo('a', 'b', 'c', 'd', 'e', 'f', 'a')
    // La «a» salió al entrar la «f» (que ocupó su sitio, el 1); al volver, sale la «b», la más vieja, y la «a» va al 2.
    expect(mesa.sitios).toEqual(['f', 'a', 'c', 'd', 'e'])
  })

  it('siempre cinco sitios y nunca un instrumento dos veces', () => {
    const ids = ['a', 'b', 'c', 'a', 'd', 'e', 'f', 'g', 'b', 'a', 'h', 'c']
    let mesa = MESA_VACIA
    for (const id of ids) {
      mesa = cogerEnLaMesa(mesa, id)
      const ocupados = mesa.sitios.filter((s): s is string => s !== null)
      expect(mesa.sitios).toHaveLength(EN_EL_MENU)
      expect(new Set(ocupados).size).toBe(ocupados.length)
      // Los de la mesa son justo los cinco últimos cogidos.
      expect([...ocupados].sort()).toEqual([...instrumentosDelMenu(mesa.recientes)].sort())
      expect(mesa.sitios).toContain(id)
    }
  })

  it('un sitio que ya no vale se vacía en vez de correr a los demás', () => {
    // Los recientes ya no traen la «b» (fuera de los cinco): su sitio queda libre para el siguiente.
    expect(sitiosDeLaMesa(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', null, 'c', null, null])
    expect(sitiosDeLaMesa([], ['b', 'a'])).toEqual(['a', 'b', null, null, null])
  })
})
