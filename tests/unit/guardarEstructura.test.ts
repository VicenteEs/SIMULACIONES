import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { CAMPOS_DE_LA_FICHA, LARGO_MAXIMO_DEL_CAMPO } from '@/lib/estructuras'
import {
  guardarFicha,
  leerFicha,
  leerVersiones,
  restaurarVersion,
  type CambiosDeLaFicha,
} from '@/lib/estructurasServidor'

/**
 * Guardar una ficha sin pisar lo que otra persona escribió (D-179, P-003 E8.4).
 *
 * Contra una base en memoria. Lo que se prueba es la regla que el dueño pidió —«que
 * no se pierda información»—: solo se escribe lo que esta persona tocó, un campo que
 * otra persona cambió mientras tanto frena el guardado, y restaurar no destruye lo
 * que había.
 */

type Fila = Record<string, unknown> & { id: number }

function baseEnMemoria(iniciales: Partial<Fila>[] = []) {
  const filas = new Map<number, Fila>()
  const versiones: { id: number; parent: number; updatedAt: string; version: Record<string, unknown> }[] = []
  let siguiente = 1
  let reloj = 0
  const sellar = (fila: Fila) => {
    reloj += 1
    const sello = new Date(Date.UTC(2026, 9, 17, 12, 0, reloj)).toISOString()
    fila.updatedAt = sello
    versiones.push({ id: versiones.length + 1, parent: fila.id, updatedAt: sello, version: { ...fila } })
  }
  for (const inicial of iniciales) {
    const fila = { id: siguiente++, ...inicial } as Fila
    filas.set(fila.id, fila)
    sellar(fila)
  }
  const escrituras: { operacion: 'create' | 'update'; data: Record<string, unknown> }[] = []

  const payload = {
    find: async ({ where }: { where: { atlasId: { equals: string } } }) => ({
      docs: [...filas.values()].filter((f) => f.atlasId === where.atlasId.equals).map((f) => ({ ...f })),
    }),
    findVersions: async ({ where }: { where: { parent: { equals: number } } }) => ({
      docs: versiones
        .filter((v) => v.parent === where.parent.equals)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((v) => ({ ...v })),
    }),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const fila = { id: siguiente++, ...data } as Fila
      filas.set(fila.id, fila)
      sellar(fila)
      escrituras.push({ operacion: 'create', data })
      return { ...fila }
    },
    update: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const fila = filas.get(id)!
      Object.assign(fila, data)
      sellar(fila)
      escrituras.push({ operacion: 'update', data })
      return { ...fila }
    },
  } as unknown as Payload

  return { payload, filas, escrituras, versiones }
}

const pieza = (id: string, nombre: string, sistema = 'skeletal', region = 'miembro-inferior-derecho'): PiezaDelAtlas =>
  ({ id, nombre, sistema, region }) as unknown as PiezaDelAtlas
const catalogo = {
  version: 'prueba',
  piezas: [pieza('FJ1', 'Right tibia'), pieza('FJ2', 'Right fibularis brevis', 'muscular')],
} as unknown as CatalogoDelAtlas

const cambios = (campos: CambiosDeLaFicha['campos'], base: CambiosDeLaFicha['base'] = {}): CambiosDeLaFicha => ({
  campos,
  base,
})

describe('guardar una ficha', () => {
  it('escribe solo lo que se tocó, y lo guarda normalizado', async () => {
    const { payload, filas, escrituras } = baseEnMemoria([
      { atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'Hueso largo.', origen: 'Algo previo' },
    ])
    const resultado = await guardarFicha(
      payload,
      catalogo,
      'FJ1',
      cambios(
        { definicion: 'Hueso largo.', irrigacion: '  Arteria nutricia\r\nde la tibia  ', origen: 'Algo previo' },
        { definicion: 'Hueso largo.', irrigacion: '', origen: 'Algo previo' },
      ),
    )
    expect(resultado.tipo).toBe('guardada')
    expect(escrituras).toHaveLength(1)
    // Solo el campo que cambió: ni la definición ni el origen se vuelven a mandar.
    expect(escrituras[0].data).toEqual({ irrigacion: 'Arteria nutricia\nde la tibia' })
    expect(filas.get(1)?.definicion).toBe('Hueso largo.')
  })

  it('sin cambios no escribe nada: no deja una versión de relleno', async () => {
    const { payload, escrituras, versiones } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'Hueso.' }])
    const antes = versiones.length
    const resultado = await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Hueso.' }, { definicion: 'Hueso.' }))
    expect(resultado).toMatchObject({ tipo: 'guardada', cambiados: [] })
    expect(escrituras).toHaveLength(0)
    expect(versiones).toHaveLength(antes)
  })

  it('si otra persona escribió el mismo campo mientras tanto, no guarda nada y devuelve las dos versiones', async () => {
    const { payload, filas, escrituras } = baseEnMemoria([
      { atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'Lo que escribió la otra persona.' },
    ])
    const resultado = await guardarFicha(
      payload,
      catalogo,
      'FJ1',
      // Al abrir la ventana la definición estaba vacía; esta persona escribió la suya.
      cambios({ definicion: 'Lo que escribí yo.' }, { definicion: '' }),
    )
    expect(resultado.tipo).toBe('conflicto')
    if (resultado.tipo !== 'conflicto') return
    expect(resultado.campos).toEqual(['definicion'])
    expect(resultado.actual.definicion).toBe('Lo que escribió la otra persona.')
    expect(escrituras).toHaveLength(0)
    expect(filas.get(1)?.definicion).toBe('Lo que escribió la otra persona.')
  })

  it('un conflicto en un campo frena también los demás: no se guarda a medias', async () => {
    const { payload, filas, escrituras } = baseEnMemoria([
      { atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'De la otra persona.' },
    ])
    const resultado = await guardarFicha(
      payload,
      catalogo,
      'FJ1',
      cambios({ definicion: 'Mía', irrigacion: 'Arteria nutricia' }, { definicion: '', irrigacion: '' }),
    )
    expect(resultado.tipo).toBe('conflicto')
    expect(escrituras).toHaveLength(0)
    expect(filas.get(1)?.irrigacion).toBeUndefined()
  })

  it('dos personas que tocan campos distintos no se estorban', async () => {
    const { payload, filas } = baseEnMemoria([
      { atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'De la otra persona.' },
    ])
    // Esta persona no tocó la definición (su base y su texto son los del momento en que abrió: vacío).
    const resultado = await guardarFicha(
      payload,
      catalogo,
      'FJ1',
      cambios({ definicion: '', irrigacion: 'Arteria nutricia' }, { definicion: '', irrigacion: '' }),
    )
    expect(resultado.tipo).toBe('guardada')
    expect(filas.get(1)).toMatchObject({ definicion: 'De la otra persona.', irrigacion: 'Arteria nutricia' })
  })

  it('si la otra persona escribió exactamente lo mismo, no es un conflicto', async () => {
    const { payload, escrituras } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'Igual.' }])
    const resultado = await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Igual.' }, { definicion: '' }))
    expect(resultado).toMatchObject({ tipo: 'guardada', cambiados: [] })
    expect(escrituras).toHaveLength(0)
  })

  it('con «forzar» guarda igual, y lo de la otra persona queda en las versiones', async () => {
    const { payload, filas } = baseEnMemoria([
      { atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'De la otra persona.' },
    ])
    const resultado = await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Mía' }, { definicion: '' }), { forzar: true })
    expect(resultado.tipo).toBe('guardada')
    expect(filas.get(1)?.definicion).toBe('Mía')
    const anteriores = await leerVersiones(payload, 'FJ1')
    expect(anteriores.map((v) => v.textos.definicion)).toContain('De la otra persona.')
  })

  it('«No mostrar» solo escribe cuando cambia algo de verdad', async () => {
    const { payload, filas, escrituras } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia', oculta: true }])
    // La abrió visible y quiere ocultarla, pero otra persona ya la ocultó: nada que hacer.
    const yaOculta = await guardarFicha(payload, catalogo, 'FJ1', { campos: {}, base: {}, oculta: true, ocultaBase: false })
    expect(yaOculta).toMatchObject({ tipo: 'guardada', cambiados: [] })
    // No tocó la casilla: no se manda.
    const sinTocar = await guardarFicha(payload, catalogo, 'FJ1', { campos: {}, base: {}, oculta: false, ocultaBase: false })
    expect(sinTocar).toMatchObject({ tipo: 'guardada', cambiados: [] })
    expect(escrituras).toHaveLength(0)
    expect(filas.get(1)?.oculta).toBe(true)
    // La abrió oculta y la devuelve a visible.
    const visible = await guardarFicha(payload, catalogo, 'FJ1', { campos: {}, base: {}, oculta: false, ocultaBase: true })
    expect(visible).toMatchObject({ tipo: 'guardada', cambiados: ['oculta'] })
    expect(filas.get(1)?.oculta).toBe(false)
  })

  it('un texto que pasa del tope se rechaza con el nombre del campo, sin cortarlo ni guardar nada', async () => {
    const { payload, escrituras } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia' }])
    const largo = 'a'.repeat(LARGO_MAXIMO_DEL_CAMPO.definicion + 1)
    await expect(
      guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: largo, irrigacion: 'Sí' }, { definicion: '', irrigacion: '' })),
    ).rejects.toThrow(/«Definición» pasa de 3000 caracteres/)
    expect(escrituras).toHaveLength(0)
  })

  it('una pieza del atlas sin fila todavía se crea al guardar, con los datos del atlas', async () => {
    const { payload, filas } = baseEnMemoria()
    const resultado = await guardarFicha(payload, catalogo, 'FJ2', cambios({ definicion: 'Músculo corto.' }, { definicion: '' }))
    expect(resultado.tipo).toBe('guardada')
    expect([...filas.values()][0]).toMatchObject({
      atlasId: 'FJ2',
      nombreOriginal: 'Right fibularis brevis',
      sistema: 'muscular',
      lado: 'derecho',
      definicion: 'Músculo corto.',
      oculta: false,
      huerfana: false,
    })
  })

  it('una pieza que no está ni en el atlas ni en el listado no existe', async () => {
    const { payload } = baseEnMemoria()
    await expect(guardarFicha(payload, catalogo, 'FJ-INVENTADO', cambios({ definicion: 'x' }, {}))).rejects.toThrow(/no está en el atlas/)
    expect(await leerFicha(payload, catalogo, 'FJ-INVENTADO')).toBeNull()
  })

  it('ignora campos que no son de la ficha', async () => {
    const { payload, filas } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia' }])
    await guardarFicha(
      payload,
      catalogo,
      'FJ1',
      cambios({ definicion: 'Hueso.', atlasId: 'FJ99', nombreOriginal: 'Otra cosa', sistema: 'muscular' } as never, { definicion: '' }),
    )
    expect(filas.get(1)).toMatchObject({ atlasId: 'FJ1', nombreOriginal: 'Right tibia', definicion: 'Hueso.' })
    expect(filas.get(1)?.sistema).toBeUndefined()
  })
})

describe('las versiones de una ficha', () => {
  it('lista las anteriores, la más reciente primero, sin la vigente', async () => {
    const { payload } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia' }])
    await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Uno' }, { definicion: '' }))
    await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Dos' }, { definicion: 'Uno' }))
    const anteriores = await leerVersiones(payload, 'FJ1')
    expect(anteriores.map((v) => v.textos.definicion)).toEqual(['Uno', undefined])
  })

  it('restaurar devuelve el texto de entonces y deja lo de ahora como una versión más', async () => {
    const { payload, filas } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia', sistema: 'skeletal' }])
    await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Uno', notas: 'Una nota' }, { definicion: '', notas: '' }))
    await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Dos' }, { definicion: 'Uno' }))
    const [uno] = await leerVersiones(payload, 'FJ1')
    expect(uno.textos).toEqual({ definicion: 'Uno', notas: 'Una nota' })

    await restaurarVersion(payload, 'FJ1', uno.id)
    expect(filas.get(1)).toMatchObject({ definicion: 'Uno', notas: 'Una nota' })
    // Lo que había antes de restaurar sigue ahí, para poder volver atrás.
    const despues = await leerVersiones(payload, 'FJ1')
    expect(despues.map((v) => v.textos.definicion)).toContain('Dos')
  })

  it('restaurar no toca los datos del atlas', async () => {
    const { payload, filas, versiones } = baseEnMemoria([{ atlasId: 'FJ1', nombreOriginal: 'Right tibia', sistema: 'skeletal' }])
    await guardarFicha(payload, catalogo, 'FJ1', cambios({ definicion: 'Uno' }, { definicion: '' }))
    // La clasificación se corrigió después de la versión vieja.
    filas.get(1)!.sistema = 'muscular'
    versiones[0].version.sistema = 'skeletal'
    const [vieja] = await leerVersiones(payload, 'FJ1')
    await restaurarVersion(payload, 'FJ1', vieja.id)
    expect(filas.get(1)?.sistema).toBe('muscular')
  })

  it('no restaura una versión que no es de esta ficha', async () => {
    const { payload } = baseEnMemoria([
      { atlasId: 'FJ1', nombreOriginal: 'Right tibia' },
      { atlasId: 'FJ2', nombreOriginal: 'Right fibularis brevis' },
    ])
    await guardarFicha(payload, catalogo, 'FJ2', cambios({ definicion: 'De otra pieza' }, { definicion: '' }))
    const deLaOtra = await leerVersiones(payload, 'FJ2')
    await expect(restaurarVersion(payload, 'FJ1', deLaOtra[0].id)).rejects.toThrow(/no es de esta ficha/)
  })
})

describe('los campos de la ficha', () => {
  it('son los que la colección declara', () => {
    expect(CAMPOS_DE_LA_FICHA).toHaveLength(8)
  })
})
