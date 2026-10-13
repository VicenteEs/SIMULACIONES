import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOGOS_AMPLIABLES,
  esCatalogoAmpliable,
  filtrarOpciones,
  hayQueOfrecerAgregar,
  opcionIgualA,
  paraComparar,
  tipoDeLaClasificacion,
} from '@/lib/catalogosAmpliables'

/**
 * El buscador con «¿No está? Agregar» de hueso, clasificación, técnica y fase.
 *
 * La petición fue: que se pueda escribir, que la lista se filtre con lo escrito,
 * que aparezca «¿no está? agrégalo» y que lo agregado quede en la base para la
 * próxima vez. Aquí se fija la parte que decide si ofrece agregar o si lo escrito
 * ya existe, y la acción que escribe.
 */
const lista = [
  { id: '1', etiqueta: 'Tibia (diáfisis)' },
  { id: '2', etiqueta: 'Fémur (diáfisis)' },
  { id: '3', etiqueta: 'Húmero (diáfisis)' },
  { id: '4', etiqueta: 'Radio (extremo distal)' },
]

describe('filtrar con lo escrito', () => {
  it('sin nada escrito devuelve todo, en su orden', () => {
    expect(filtrarOpciones(lista, '').map((o) => o.id)).toEqual(['1', '2', '3', '4'])
    expect(filtrarOpciones(lista, '   ').map((o) => o.id)).toEqual(['1', '2', '3', '4'])
  })

  it('no distingue tildes ni mayúsculas', () => {
    expect(filtrarOpciones(lista, 'femur').map((o) => o.id)).toEqual(['2'])
    expect(filtrarOpciones(lista, 'HÚMERO').map((o) => o.id)).toEqual(['3'])
    expect(filtrarOpciones(lista, 'diafisis').map((o) => o.id)).toEqual(['1', '2', '3'])
  })

  it('busca por palabras, en cualquier orden', () => {
    expect(filtrarOpciones(lista, 'diafisis tibia').map((o) => o.id)).toEqual(['1'])
    expect(filtrarOpciones(lista, 'distal radio').map((o) => o.id)).toEqual(['4'])
    expect(filtrarOpciones(lista, 'tib diaf').map((o) => o.id)).toEqual(['1'])
  })

  it('una escritura que no coincide con nada deja la lista vacía', () => {
    expect(filtrarOpciones(lista, 'peroné')).toEqual([])
  })
})

describe('cuándo ofrecer agregar', () => {
  it('ofrece agregar lo escrito que no está, y no cuando no hay nada escrito', () => {
    expect(hayQueOfrecerAgregar(lista, 'Peroné (diáfisis)')).toBe(true)
    expect(hayQueOfrecerAgregar(lista, '')).toBe(false)
    expect(hayQueOfrecerAgregar(lista, '   ')).toBe(false)
  })

  it('no ofrece agregar lo que ya existe, aunque difiera en tildes, mayúsculas o espacios', () => {
    expect(hayQueOfrecerAgregar(lista, 'fémur (diáfisis)')).toBe(false)
    expect(hayQueOfrecerAgregar(lista, 'FEMUR  (DIAFISIS)')).toBe(false)
    expect(opcionIgualA(lista, ' tibia (diafisis) ')?.id).toBe('1')
  })

  it('escribir solo una parte del nombre sigue ofreciendo agregar: «tibia» no es «Tibia (diáfisis)»', () => {
    expect(hayQueOfrecerAgregar(lista, 'Tibia')).toBe(true)
  })

  it('compara con la misma función que usa el buscador', () => {
    expect(paraComparar('  Fémur  (Diáfisis) ')).toBe('femur (diafisis)')
  })
})

describe('qué catálogos se ensanchan', () => {
  it('son hueso, clasificación, técnica y fase, y nada más', () => {
    expect(Object.keys(CATALOGOS_AMPLIABLES).sort()).toEqual([
      'clasificaciones-ao',
      'fases-quirurgicas',
      'huesos-ao',
      'tecnicas-quirurgicas',
    ])
    expect(esCatalogoAmpliable('tecnicas-quirurgicas')).toBe(true)
    // El resto de colecciones tienen su propio formulario y sus propias reglas.
    for (const otra of ['usuarios', 'cirugias', 'instrumental', 'modelos-3d', '__proto__', 'constructor', 7, null]) {
      expect(esCatalogoAmpliable(otra), String(otra)).toBe(false)
    }
  })

  it('el hueso pide el número AO sin exigirlo, y la clasificación pide su código', () => {
    expect(CATALOGOS_AMPLIABLES['huesos-ao'].extra?.requerido).toBe(false)
    expect(CATALOGOS_AMPLIABLES['clasificaciones-ao'].extra?.requerido).toBe(true)
    expect(CATALOGOS_AMPLIABLES['tecnicas-quirurgicas'].extra).toBeUndefined()
  })

  it('el tipo de la clasificación sale de la letra del código', () => {
    expect(tipoDeLaClasificacion('A2')).toBe('A')
    expect(tipoDeLaClasificacion(' c3')).toBe('C')
    expect(tipoDeLaClasificacion('B1')).toBe('B')
    expect(tipoDeLaClasificacion('Z9')).toBeUndefined()
    expect(tipoDeLaClasificacion('')).toBeUndefined()
  })
})

// ------------------------------------------------------------- la acción

const { estado, buscar, crear } = vi.hoisted(() => ({
  estado: {
    usuario: null as Record<string, unknown> | null,
    activo: true,
    rolReal: 'editor' as string | null,
  },
  buscar: vi.fn(),
  crear: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.activo,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))
vi.mock('payload', () => ({ getPayload: async () => ({ find: buscar, create: crear }) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { agregarAlCatalogo } from '@/app/(frontend)/acciones/contenido'

describe('agregarAlCatalogo', () => {
  beforeEach(() => {
    buscar.mockReset()
    crear.mockReset()
    buscar.mockResolvedValue({
      docs: [
        { id: 1, nombre: 'prueba técnica', orden: 0 },
        { id: 2, nombre: 'Clavo endomedular', orden: 10 },
      ],
    })
    crear.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 99, ...data }))
    estado.usuario = { id: 7, rol: 'editor', activo: true, modulosEditables: [] }
    estado.activo = true
    estado.rolReal = 'editor'
  })

  it('un editor agrega una técnica nueva, al final de la lista', async () => {
    const r = await agregarAlCatalogo('tecnicas-quirurgicas', { nombre: '  Fijador externo  ' })
    expect(r.exito).toBe(true)
    expect(r.datos).toEqual({ id: '99', etiqueta: 'Fijador externo', yaExistia: false })
    const datos = crear.mock.calls[0][0].data
    expect(datos.nombre).toBe('Fijador externo')
    // Detrás de la última (10), de diez en diez: lo que alguien ordenó a mano no se toca.
    expect(datos.orden).toBe(20)
  })

  it('no duplica: si ya está —sin mirar tildes ni mayúsculas— devuelve la que hay', async () => {
    const r = await agregarAlCatalogo('tecnicas-quirurgicas', { nombre: 'CLAVO ENDOMEDULAR' })
    expect(r.exito).toBe(true)
    expect(r.datos).toEqual({ id: '2', etiqueta: 'Clavo endomedular', yaExistia: true })
    expect(crear).not.toHaveBeenCalled()
  })

  it('la clasificación exige su código y deduce el tipo de su letra', async () => {
    const sin = await agregarAlCatalogo('clasificaciones-ao', { nombre: 'Compleja irregular' })
    expect(sin.exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
    const con = await agregarAlCatalogo('clasificaciones-ao', { nombre: 'Compleja irregular', codigo: 'C3' })
    expect(con.exito).toBe(true)
    expect(crear.mock.calls[0][0].data).toMatchObject({ nombre: 'Compleja irregular', codigo: 'C3', tipo: 'C' })
  })

  it('el hueso guarda su número AO si lo traen, y se crea sin él si no', async () => {
    await agregarAlCatalogo('huesos-ao', { nombre: 'Peroné (diáfisis)', codigo: '4F2' })
    expect(crear.mock.calls[0][0].data).toMatchObject({ nombre: 'Peroné (diáfisis)', codigo: '4F2' })
    crear.mockClear()
    await agregarAlCatalogo('huesos-ao', { nombre: 'Clavícula' })
    expect(crear.mock.calls[0][0].data).not.toHaveProperty('codigo')
  })

  it('rechaza un nombre vacío o desmesurado', async () => {
    expect((await agregarAlCatalogo('fases-quirurgicas', { nombre: '   ' })).exito).toBe(false)
    expect((await agregarAlCatalogo('fases-quirurgicas', { nombre: 'x'.repeat(121) })).exito).toBe(false)
    expect((await agregarAlCatalogo('fases-quirurgicas', null)).exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
  })

  it('no sirve para crear filas en otras colecciones', async () => {
    for (const otra of ['usuarios', 'cirugias', 'instrumental', 'payload-preferences']) {
      const r = await agregarAlCatalogo(otra, { nombre: 'x' })
      expect(r.exito, otra).toBe(false)
    }
    expect(crear).not.toHaveBeenCalled()
  })

  it('el lector no puede agregar', async () => {
    estado.usuario = { id: 9, rol: 'lector', activo: true }
    estado.rolReal = 'lector'
    const r = await agregarAlCatalogo('tecnicas-quirurgicas', { nombre: 'Nueva' })
    expect(r.exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
  })

  it('un editor apartado del simulador tampoco', async () => {
    estado.usuario = { id: 7, rol: 'editor', activo: true, modulosEditables: ['patologias'] }
    const r = await agregarAlCatalogo('tecnicas-quirurgicas', { nombre: 'Nueva' })
    expect(r.exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
  })
})
