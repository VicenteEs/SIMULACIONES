import { describe, it, expect, vi } from 'vitest'
import { buscarEnEspanol } from '@/atlas/arbolEnEspanol'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { casaConLaBusqueda } from '@/atlas/nombres'

/**
 * La búsqueda del atlas con la tabla de traducciones ya llena.
 *
 * Va en su propio archivo por el `vi.mock`: se aplica al archivo entero, y
 * `atlasEnEspanol.test.ts` tiene que seguir probando con la semilla de verdad.
 *
 * Por qué hace falta simular la tabla: las nueve traducciones de la semilla
 * usan palabras —tibia, peroné, derecha— que `buscarPiezas` sabe traducir al
 * inglés, así que con ellas la búsqueda por palabras sueltas funcionaba por el
 * camino del nombre original y nadie veía que en español solo casaba la frase
 * seguida. Con los nombres largos de la tabla completa —«Músculo peroneo corto
 * derecho»— el que escribe «peroneo derecho» se quedaba sin nada. Las dos
 * traducciones de aquí tienen la forma de las de la tabla, con palabras que
 * esas equivalencias NO conocen (peroneo, corto, cruzado), que es lo que hace
 * que esta prueba distinga algo.
 */
vi.mock('@/atlas/nombres-es.json', () => ({
  default: {
    'Right tibia': 'Tibia derecha',
    'Right fibularis brevis': 'Músculo peroneo corto derecho',
    'Left fibularis brevis': 'Músculo peroneo corto izquierdo',
    'Right anterior cruciate ligament': 'Ligamento cruzado anterior derecho',
  },
}))

function pieza(id: string, nombre: string): PiezaDelAtlas {
  return {
    id,
    nombre,
    fma: `FMA-${id}`,
    sistema: 'muscular',
    region: 'miembro-inferior-derecho',
    origenRegion: 'anatomia',
    paquete: 0,
    pos: 0,
    nor: 0,
    idx: 0,
    vertices: 0,
    indices: 0,
    caja: [
      [0, 0, 0],
      [0, 0, 0],
    ],
  }
}

const catalogo: CatalogoDelAtlas = {
  version: 'prueba-tabla-llena',
  fuente: 'BodyParts3D 4.0',
  licencia: 'CC BY 4.0',
  sujeto: 'Prueba',
  triangulos: 0,
  sistemas: [{ id: 'muscular', nombre: 'Músculos', color: '#b6544c', orden: 1 }],
  regiones: [{ id: 'miembro-inferior-derecho', nombre: 'Miembro inferior derecho', orden: 1 }],
  paquetes: [],
  piezas: [
    pieza('p0', 'Right tibia'),
    pieza('p1', 'Right fibularis brevis'),
    pieza('p2', 'Left fibularis brevis'),
    pieza('p3', 'Right anterior cruciate ligament'),
  ],
}

const nombres = (consulta: string) => buscarEnEspanol(catalogo, consulta).piezas.map((p) => p.nombre)

describe('la tabla simulada es la que se lee', () => {
  it('«peroneo corto», seguido, ya casaba antes del arreglo', () => {
    // Si esto fallara, el `vi.mock` no estaría llegando a `nombres.ts` y las
    // pruebas de abajo fallarían por la razón equivocada.
    expect(nombres('peroneo corto')).toEqual(['Right fibularis brevis', 'Left fibularis brevis'])
  })
})

describe('casaConLaBusqueda exige todas las palabras, en cualquier orden', () => {
  it('encuentra el nombre en español con las palabras salteadas o cambiadas de orden', () => {
    expect(casaConLaBusqueda('Right fibularis brevis', 'peroneo derecho')).toBe(true)
    expect(casaConLaBusqueda('Right fibularis brevis', 'derecho peroneo')).toBe(true)
    expect(casaConLaBusqueda('Right anterior cruciate ligament', 'cruzado derecho')).toBe(true)
  })

  it('sigue casando a medio escribir, que es como se usa el campo', () => {
    expect(casaConLaBusqueda('Right fibularis brevis', 'peron der')).toBe(true)
  })

  it('no casa si falta una sola palabra', () => {
    expect(casaConLaBusqueda('Right fibularis brevis', 'peroneo izquierdo')).toBe(false)
    expect(casaConLaBusqueda('Right fibularis brevis', 'peroneo largo')).toBe(false)
  })

  it('todas las palabras en el MISMO nombre: no junta media consulta de cada idioma', () => {
    // «brevis» solo está en el original y «derecho» solo en la traducción.
    expect(casaConLaBusqueda('Right fibularis brevis', 'brevis derecho')).toBe(false)
    // Cada idioma por separado sí.
    expect(casaConLaBusqueda('Right fibularis brevis', 'brevis right')).toBe(true)
  })

  it('una consulta vacía lo deja pasar todo, como antes', () => {
    // El taller filtra las piezas encendidas con esto: vacío es «sin filtro».
    expect(casaConLaBusqueda('Right fibularis brevis', '   ')).toBe(true)
  })
})

describe('el árbol encuentra en español sin exigir el orden', () => {
  it('«peroneo derecho» y «derecho peroneo» encuentran el peroneo corto derecho', () => {
    expect(nombres('peroneo derecho')).toEqual(['Right fibularis brevis'])
    expect(nombres('derecho peroneo')).toEqual(['Right fibularis brevis'])
  })

  it('«cruzado derecho» encuentra el ligamento cruzado anterior', () => {
    expect(nombres('cruzado derecho')).toEqual(['Right anterior cruciate ligament'])
  })

  it('cuenta en el total lo que solo casa salteado', () => {
    // «60 de 214» tiene que decir la verdad también para estas: si entraran en
    // la lista y no en el total, o al revés, el árbol diría otra cifra.
    expect(buscarEnEspanol(catalogo, 'corto peroneo').total).toBe(2)
  })
})
