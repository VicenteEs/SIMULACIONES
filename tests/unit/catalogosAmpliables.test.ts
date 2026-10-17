import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOGOS_AMPLIABLES,
  CATALOGOS_CON_AVISO,
  esCatalogoAmpliable,
  filtrarOpciones,
  hayQueOfrecerAgregar,
  opcionIgualA,
  paraComparar,
  textoDelAvisoDeCatalogo,
  tipoDeLaClasificacion,
} from '@/lib/catalogosAmpliables'
import { NOMBRE_DE_CATALOGO, esCatalogoComentable } from '@/app/(frontend)/admin-panel/modulos'

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
  it('son hueso, clasificación, técnica, fase, segmento y tipo, y nada más', () => {
    expect(Object.keys(CATALOGOS_AMPLIABLES).sort()).toEqual([
      'clasificaciones-ao',
      'fases-quirurgicas',
      'huesos-ao',
      'segmentos',
      'tecnicas-quirurgicas',
      'tipos-de-ficha',
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

  it('segmento y tipo se identifican por su nombre, sin campo extra', () => {
    expect(CATALOGOS_AMPLIABLES.segmentos.extra).toBeUndefined()
    expect(CATALOGOS_AMPLIABLES['tipos-de-ficha'].extra).toBeUndefined()
  })

  it('cada catálogo ampliable tiene su nombre en el panel y su valor en el enumerado de los avisos (D-177)', () => {
    // Si se agrega un catálogo a la tabla y no a estas dos listas, el aviso de «Fulano agregó…» falla al guardarse
    // (el enumerado de `comentarios.coleccion` no lo conoce) o sale con el slug a la vista.
    expect([...CATALOGOS_CON_AVISO].sort()).toEqual(Object.keys(CATALOGOS_AMPLIABLES).sort())
    expect(Object.keys(NOMBRE_DE_CATALOGO).sort()).toEqual(Object.keys(CATALOGOS_AMPLIABLES).sort())
    for (const slug of Object.keys(CATALOGOS_AMPLIABLES)) expect(esCatalogoComentable(slug), slug).toBe(true)
    expect(esCatalogoComentable('cirugias')).toBe(false)
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

const { estado, buscar, buscarUno, crear } = vi.hoisted(() => ({
  estado: {
    usuario: null as Record<string, unknown> | null,
    activo: true,
    rolReal: 'editor' as string | null,
  },
  buscar: vi.fn(),
  buscarUno: vi.fn(),
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
vi.mock('payload', () => ({ getPayload: async () => ({ find: buscar, findByID: buscarUno, create: crear }) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { agregarAlCatalogo } from '@/app/(frontend)/acciones/contenido'

describe('agregarAlCatalogo', () => {
  beforeEach(() => {
    buscar.mockReset()
    buscarUno.mockReset()
    crear.mockReset()
    buscarUno.mockResolvedValue({ id: 5, nombre: 'Principios de la artroplastia de cadera' })
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

  it('el segmento y el tipo se agregan desde una patología, por un editor de patologías', async () => {
    // Son material de apoyo, como los segmentos de siempre: no los gobierna el permiso del simulador.
    estado.usuario = { id: 7, rol: 'editor', activo: true, modulosEditables: ['patologias'] }
    for (const catalogo of ['segmentos', 'tipos-de-ficha']) {
      crear.mockClear()
      const r = await agregarAlCatalogo(catalogo, { nombre: 'Columna cervical' })
      expect(r.exito, catalogo).toBe(true)
      expect(crear.mock.calls[0][0].collection).toBe(catalogo)
    }
  })

  describe('el aviso que deja al agregar (P-003, E1)', () => {
    const desdeUnaPatologia = { coleccion: 'patologias', documentoId: '5', campo: 'Segmento anatómico' }

    it('deja un comentario pendiente sobre la fila nueva, a nombre de quien la agregó y desde dónde', async () => {
      estado.usuario = { id: 7, rol: 'editor', activo: true, modulosEditables: [], nombre: 'Cristóbal Cofré' }
      const r = await agregarAlCatalogo('segmentos', { nombre: 'Cadera' }, desdeUnaPatologia)
      expect(r.exito).toBe(true)
      expect(crear).toHaveBeenCalledTimes(2)
      const aviso = crear.mock.calls[1][0]
      expect(aviso.collection).toBe('comentarios')
      // Cuelga de la fila nueva (99), no de la ficha: es sobre la fila que hay que actuar.
      expect(aviso.data).toMatchObject({ coleccion: 'segmentos', documentoId: '99', estado: 'pendiente' })
      expect(aviso.data.texto).toBe(
        'Cristóbal Cofré agregó el segmento «Cadera» al catálogo desde el campo «Segmento anatómico» de ' +
          'la patología «Principios de la artroplastia de cadera». ' +
          'Revise que no sea el mismo de otro que ya estaba con distinto nombre.',
      )
      // El autor es quien agregó: el gancho de `Comentarios` lo toma del usuario que escribe.
      expect(aviso.user).toMatchObject({ id: 7 })
    })

    it('con la ficha todavía sin guardar lo dice así, sin inventar un número', async () => {
      const r = await agregarAlCatalogo('tipos-de-ficha', { nombre: 'Oncología ortopédica' }, {
        coleccion: 'patologias',
        documentoId: null,
        campo: 'Tipo',
      })
      expect(r.exito).toBe(true)
      expect(buscarUno).not.toHaveBeenCalled()
      expect(crear.mock.calls[1][0].data.texto).toContain('de una patología nueva, todavía sin guardar')
    })

    it('el hueso nuevo cuenta su número AO en el aviso', async () => {
      await agregarAlCatalogo('huesos-ao', { nombre: 'Peroné (diáfisis)', codigo: '4F2' }, { coleccion: 'cirugias', documentoId: '3', campo: 'Hueso' })
      expect(crear.mock.calls[1][0].data.texto).toContain('el hueso «Peroné (diáfisis)» (4F2)')
    })

    it('si la fila ya existía no hay nada que avisar', async () => {
      await agregarAlCatalogo('tecnicas-quirurgicas', { nombre: 'CLAVO ENDOMEDULAR' }, desdeUnaPatologia)
      expect(crear).not.toHaveBeenCalled()
    })

    it('un origen que no es de una colección editable no sale en el aviso, pero la fila se agrega', async () => {
      // La acción se puede invocar a mano: lo que no se reconoce se descarta en vez de escribirse en un comentario.
      const r = await agregarAlCatalogo('segmentos', { nombre: 'Cadera' }, { coleccion: 'usuarios', documentoId: '1', campo: 'x' })
      expect(r.exito).toBe(true)
      expect(buscarUno).not.toHaveBeenCalled()
      expect(crear.mock.calls[1][0].data.texto).toContain('al catálogo desde una ficha. Revise')
    })

    it('si el aviso falla, la fila agregada se queda y el editor sigue con su trabajo', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      crear.mockImplementation(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
        if (collection === 'comentarios') throw new Error('se cayó la tabla')
        return { id: 99, ...data }
      })
      const r = await agregarAlCatalogo('segmentos', { nombre: 'Cadera' }, desdeUnaPatologia)
      expect(r).toMatchObject({ exito: true, datos: { id: '99', etiqueta: 'Cadera', yaExistia: false } })
      expect(error).toHaveBeenCalled()
      error.mockRestore()
    })
  })
})

describe('el texto del aviso', () => {
  const catalogo = { articulo: 'la' as const, singular: 'técnica' }

  it('nombra a quien agregó, qué, desde qué campo y de qué ficha', () => {
    expect(
      textoDelAvisoDeCatalogo({
        quien: 'Ana',
        catalogo,
        nombre: 'Fijador externo',
        campo: 'Técnica',
        ficha: { articulo: 'el', singular: 'caso', titulo: 'Fractura de tibia' },
        fichaNueva: null,
      }),
    ).toBe(
      'Ana agregó la técnica «Fijador externo» al catálogo desde el campo «Técnica» del caso «Fractura de tibia». ' +
        'Revise que no sea el mismo de otro que ya estaba con distinto nombre.',
    )
  })

  it('sin ficha ni ficha nueva, se queda en el campo', () => {
    const texto = textoDelAvisoDeCatalogo({ quien: 'Ana', catalogo, nombre: 'X', campo: 'Técnica', ficha: null, fichaNueva: null })
    expect(texto).toContain('desde el campo «Técnica». Revise')
  })
})
