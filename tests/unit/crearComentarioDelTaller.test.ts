import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `crearComentario` y `listarComentariosDe` sobre una preparación del taller
 * (E2, D-158), con un Payload de mentira que apunta lo que le piden.
 *
 * `accionesConGuardia.test.ts` ya comprueba que la lista no se alcanza sin ser
 * editor; aquí se mira lo que ese arnés no ve: la rama del taller de
 * `crearComentario` —quién puede, qué existe, qué se guarda—.
 */

const { estado, llamadas } = vi.hoisted(() => ({
  estado: { sesion: null as unknown, existe: true },
  llamadas: [] as { metodo: string; argumentos: unknown }[],
}))

vi.mock('@/lib/sesion', () => ({ obtenerSesion: async () => estado.sesion }))
vi.mock('@/lib/modulosEnMantencion', () => ({ modulosEnMantencion: async () => [] }))
vi.mock('payload', async (original) => ({
  ...((await original()) as object),
  getPayload: async () => ({
    findByID: async (a: unknown) => {
      llamadas.push({ metodo: 'findByID', argumentos: a })
      if (!estado.existe) throw new Error('no existe')
      return { id: 12 }
    },
    find: async (a: unknown) => {
      llamadas.push({ metodo: 'find', argumentos: a })
      return {
        docs: [
          {
            id: 5,
            texto: 'Falta el peroné',
            estado: 'pendiente',
            createdAt: '2026-10-07T10:00:00.000Z',
            usuario: { id: 4, nombre: 'Cristóbal' },
            ancla: { pieza: 'FJ3387', punto: [1, 2, 3], intruso: 'x' },
          },
          { id: 6, texto: 'Ancla rota', estado: 'resuelto', createdAt: '', usuario: null, ancla: { pieza: 'no válida!' } },
        ],
      }
    },
    create: async (a: unknown) => {
      llamadas.push({ metodo: 'create', argumentos: a })
      return { id: 99 }
    },
  }),
}))
vi.mock('@payload-config', () => ({ default: {} }))

const cuenta = (rol: string) => ({ id: 4, rol, activo: true, email: `${rol}@prueba.invalid` })
const sesionDe = (rol: string, rolEfectivo = rol) => {
  const usuario = cuenta(rol)
  return {
    usuario,
    activo: true,
    rolReal: rol,
    rol: rolEfectivo,
    simulando: rol !== rolEfectivo,
    usuarioEfectivo: { ...usuario, rol: rolEfectivo },
  }
}

const importar = () => import('@/app/(frontend)/acciones/comentarios')

beforeEach(() => {
  llamadas.length = 0
  estado.existe = true
  estado.sesion = sesionDe('editor')
})

describe('comentar una preparación del taller', () => {
  it('el editor deja el comentario, con la colección del taller y el ancla reconstruida', async () => {
    const { crearComentario } = await importar()
    await crearComentario('instancias-atlas', '12', 'Falta el peroné', {
      pieza: 'FJ3387',
      punto: [1, 2, 3],
      vista: { camara: [0, 0, 1], objetivo: [0, 0, 0] },
      intruso: 'no se guarda',
    })
    const creada = llamadas.find((l) => l.metodo === 'create')
    expect(creada).toBeDefined()
    expect((creada!.argumentos as { data: Record<string, unknown> }).data).toEqual({
      coleccion: 'instancias-atlas',
      documentoId: '12',
      texto: 'Falta el peroné',
      estado: 'pendiente',
      ancla: { pieza: 'FJ3387', punto: [1, 2, 3], vista: { camara: [0, 0, 1], objetivo: [0, 0, 0] } },
    })
  })

  it('sin ancla comenta la preparación entera', async () => {
    const { crearComentario } = await importar()
    await crearComentario('instancias-atlas', '12', 'Todo bien')
    const data = (llamadas.find((l) => l.metodo === 'create')!.argumentos as { data: Record<string, unknown> }).data
    expect(data.ancla).toBeUndefined()
  })

  it('el residente no puede, y no se toca nada', async () => {
    estado.sesion = sesionDe('lector')
    const { crearComentario } = await importar()
    await expect(crearComentario('instancias-atlas', '12', 'hola')).rejects.toThrow(/taller anatómico/)
    expect(llamadas).toEqual([])
  })

  it('un administrador con la vista de residente puesta sigue comentando como administrador', async () => {
    // El taller es del panel: se mira el rol real, como el resto de sus guardias.
    estado.sesion = sesionDe('admin', 'lector')
    const { crearComentario } = await importar()
    await crearComentario('instancias-atlas', '12', 'hola')
    expect(llamadas.some((l) => l.metodo === 'create')).toBe(true)
  })

  it('un residente con una vista de administrador falsa no comenta', async () => {
    estado.sesion = sesionDe('lector', 'admin')
    const { crearComentario } = await importar()
    await expect(crearComentario('instancias-atlas', '12', 'hola')).rejects.toThrow()
    expect(llamadas).toEqual([])
  })

  it('una preparación que no existe no recibe comentarios', async () => {
    estado.existe = false
    const { crearComentario } = await importar()
    await expect(crearComentario('instancias-atlas', '12', 'hola')).rejects.toThrow(/Guárdela con nombre/)
    expect(llamadas.some((l) => l.metodo === 'create')).toBe(false)
  })

  it('un ancla mal formada se rechaza antes de escribir', async () => {
    const { crearComentario } = await importar()
    await expect(crearComentario('instancias-atlas', '12', 'hola', { pieza: 'no válida!' })).rejects.toThrow(/pieza/)
    expect(llamadas.some((l) => l.metodo === 'create')).toBe(false)
  })

  it('un comentario de módulo no admite ancla', async () => {
    estado.sesion = sesionDe('lector')
    const { crearComentario } = await importar()
    await expect(crearComentario('patologias', '12', 'hola', { pieza: 'FJ1' })).rejects.toThrow(/taller anatómico/)
    expect(llamadas.some((l) => l.metodo === 'create')).toBe(false)
  })

  it('un destino que no existe se rechaza', async () => {
    const { crearComentario } = await importar()
    await expect(crearComentario('usuarios', '12', 'hola')).rejects.toThrow(/no se puede comentar/)
  })
})

describe('leer los comentarios de una preparación', () => {
  it('devuelve autor, estado y ancla, y descarta un ancla guardada que ya no vale', async () => {
    const { listarComentariosDe } = await importar()
    const r = await listarComentariosDe('instancias-atlas', '12')
    expect(r.exito).toBe(true)
    expect(r.datos).toEqual([
      {
        id: '5',
        texto: 'Falta el peroné',
        estado: 'pendiente',
        creado: '2026-10-07T10:00:00.000Z',
        autor: 'Cristóbal',
        autorId: '4',
        ancla: { pieza: 'FJ3387', punto: [1, 2, 3] },
      },
      { id: '6', texto: 'Ancla rota', estado: 'resuelto', creado: '', autor: null, autorId: null, ancla: null },
    ])
    const consulta = llamadas.find((l) => l.metodo === 'find')!.argumentos as { where: unknown }
    expect(JSON.stringify(consulta.where)).toContain('instancias-atlas')
    expect(JSON.stringify(consulta.where)).toContain('"12"')
  })

  it('solo contesta por el taller', async () => {
    const { listarComentariosDe } = await importar()
    const r = await listarComentariosDe('patologias', '12')
    expect(r.exito).toBe(false)
  })
})
