import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  condicionDeLugares,
  difusionLlegaA,
  enlaceParaElLugar,
  lugarDeLaCuenta,
  normalizarLugares,
  restoDentroDeLaPlataforma,
} from '@/lib/destinoDeDifusion'
import { avisosDeLaCuenta } from '@/lib/avisosServidor'
import { olvidarAvisos } from '@/lib/avisosEnMemoria'
import { botonesDisponibles, destinatariosElegidos } from '@/app/(frontend)/admin-panel/difusion/PanelDeDifusion'
import { marcarAvisosLeidos } from '@/app/(frontend)/acciones/avisos'

// Para `marcarAvisosLeidos`, que pide la sesión y el Payload por su cuenta.
const { sesion, falso } = vi.hoisted(() => ({
  sesion: { actual: null as unknown },
  falso: { payload: null as unknown },
}))
vi.mock('@/lib/sesion', () => ({ obtenerSesion: async () => sesion.actual }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', async (original) => ({
  ...((await original()) as object),
  getPayload: async () => falso.payload,
}))

/**
 * A qué lugares va una difusión y qué ve cada cuenta en la campana (P-016 E6,
 * D-375, D-406).
 *
 * Lo que se cuida aquí es que las tres maneras de decir «a quién le llega» —la
 * condición de la base que arma la cola del correo, la regla en memoria de la
 * barra y la cuenta del formulario— digan lo mismo. Si una se separa, el
 * botón promete «40 personas», el correo sale a 38 y el aviso lo ven 41. Que
 * la barrera de la base no deje a una institución ver lo de otra se prueba en
 * `tests/integration/avisos.test.ts`, contra la base de verdad.
 */

describe('los lugares de una difusión', () => {
  it('se guardan limpios: solo TraumaHub o identificadores, sin repetidos, y sin nada es «todos»', () => {
    expect(normalizarLugares(['traumahub', '7', 7, ' 8 ', '7'])).toEqual(['traumahub', '7', '8'])
    expect(normalizarLugares(['central', '7a', '', null, -3])).toBeNull()
    expect(normalizarLugares([])).toBeNull()
    expect(normalizarLugares(null)).toBeNull()
    expect(normalizarLugares('traumahub')).toBeNull()
  })

  it('el lugar de una cuenta es TraumaHub sin institución, y si no el número de la suya', () => {
    expect(lugarDeLaCuenta(null)).toBe('traumahub')
    expect(lugarDeLaCuenta(undefined)).toBe('traumahub')
    expect(lugarDeLaCuenta('')).toBe('traumahub')
    expect(lugarDeLaCuenta(7)).toBe('7')
  })

  it('la condición de la base y la regla en memoria dicen lo mismo', () => {
    expect(condicionDeLugares(null)).toBeNull()
    expect(condicionDeLugares(['traumahub'])).toEqual({ or: [{ institucion: { exists: false } }] })
    expect(condicionDeLugares(['7', '9'])).toEqual({ or: [{ institucion: { in: [7, 9] } }] })

    const cuentas = [
      { rol: 'lector', institucion: null },
      { rol: 'lector', institucion: 7 },
      { rol: 'editor', institucion: 9 },
    ]
    const llegan = (audiencia: string, lugares: string[] | null) =>
      cuentas.filter((c) => difusionLlegaA({ audiencia, lugares }, c)).length
    expect(llegan('todas', null)).toBe(3)
    expect(llegan('lector', null)).toBe(2)
    expect(llegan('todas', ['traumahub'])).toBe(1)
    expect(llegan('todas', ['7', '9'])).toBe(2)
    expect(llegan('editor', ['7'])).toBe(0)
  })
})

describe('el enlace del botón, para el lugar de cada cuenta', () => {
  const central = 'https://traumahub.cl'

  it('uno a la plataforma va al lugar; uno de fuera queda igual', () => {
    const sur = 'https://sur.traumahub.cl'
    expect(enlaceParaElLugar('https://traumahub.cl/biblioteca?tema=pelvis#a', central, sur)).toBe(
      'https://sur.traumahub.cl/biblioteca?tema=pelvis#a',
    )
    expect(enlaceParaElLugar('https://traumahub.cl', central, sur)).toBe('https://sur.traumahub.cl')
    expect(enlaceParaElLugar('https://traumahub.cl/', central, sur)).toBe('https://sur.traumahub.cl')
    expect(enlaceParaElLugar('https://youtube.com/watch?v=1', central, sur)).toBe('https://youtube.com/watch?v=1')
    // Empieza igual y no es la plataforma.
    expect(enlaceParaElLugar('https://traumahub.cl.otro.sitio/x', central, sur)).toBe('https://traumahub.cl.otro.sitio/x')
    // Sin dirección del lugar no se toca.
    expect(enlaceParaElLugar('https://traumahub.cl/x', central, '')).toBe('https://traumahub.cl/x')
  })

  it('con prefijo, como en ved, la ruta sale sin él: va dentro de la dirección pública', () => {
    const ved = 'https://ved.example:10000/traumahub'
    expect(restoDentroDeLaPlataforma('https://ved.example:10000/traumahub/biblioteca', ved)).toBe('/biblioteca')
    expect(restoDentroDeLaPlataforma('https://ved.example:10000/traumahub?x=1', ved)).toBe('/?x=1')
    expect(restoDentroDeLaPlataforma('https://ved.example:10000/traumahub', ved)).toBe('/')
    expect(restoDentroDeLaPlataforma('https://ved.example:10000/otra', ved)).toBeNull()
    expect(enlaceParaElLugar('https://ved.example:10000/traumahub/biblioteca', ved, `${ved}/lugar/sur`)).toBe(
      'https://ved.example:10000/traumahub/lugar/sur/biblioteca',
    )
    // Sin dirección pública no hay plataforma que reconocer.
    expect(restoDentroDeLaPlataforma('https://traumahub.cl/x', '')).toBeNull()
  })
})

describe('el formulario', () => {
  const conteos = [
    { lugar: 'traumahub', rol: 'lector', cuantos: 3, primera: { id: 4, nombre: 'Ana', email: 'ana@a.cl' } },
    { lugar: 'traumahub', rol: 'editor', cuantos: 1, primera: { id: 2, nombre: 'Beto', email: 'beto@a.cl' } },
    { lugar: '7', rol: 'lector', cuantos: 5, primera: { id: 1, nombre: '', email: 'carla@sur.cl' } },
  ]

  it('cuenta lo elegido y saluda a la primera de la cola, la de identificador más bajo', () => {
    expect(destinatariosElegidos(conteos, 'todas', null)).toEqual({
      cuantos: 9,
      primera: { nombre: '', email: 'carla@sur.cl' },
    })
    expect(destinatariosElegidos(conteos, 'lector', ['traumahub'])).toEqual({
      cuantos: 3,
      primera: { nombre: 'Ana', email: 'ana@a.cl' },
    })
    expect(destinatariosElegidos(conteos, 'admin', null)).toEqual({ cuantos: 0, primera: null })
    expect(destinatariosElegidos(conteos, 'todas', [])).toEqual({ cuantos: 0, primera: null })
  })

  it('solo como aviso se ofrece sin correo y con otra difusión saliendo; la prueba sigue pidiendo correo', () => {
    const listo = { problema: null, problemaDelDestino: null, ocupado: false, cuantos: 2 }
    expect(botonesDisponibles({ ...listo, hayCorreo: false, algunaEnCurso: true, porCorreo: false })).toEqual({
      probar: false,
      enviar: true,
    })
    expect(botonesDisponibles({ ...listo, hayCorreo: true, algunaEnCurso: true, porCorreo: true })).toEqual({
      probar: true,
      enviar: false,
    })
    // Lo que falla en el destino no impide la prueba, que va a quien la pide.
    expect(
      botonesDisponibles({ ...listo, problemaDelDestino: 'Elija al menos un lugar.', hayCorreo: true, algunaEnCurso: false }),
    ).toEqual({ probar: true, enviar: false })
    expect(botonesDisponibles({ ...listo, cuantos: 0, hayCorreo: true, algunaEnCurso: false, porCorreo: false })).toEqual({
      probar: true,
      enviar: false,
    })
  })
})

describe('la campana de cada cuenta', () => {
  const ahora = new Date('2026-11-16T12:00:00.000Z')
  let difusiones: Record<string, unknown>[]
  let lecturas: { usuario: number; difusion: number }[]
  let find: ReturnType<typeof vi.fn>

  const aviso = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    asunto: `Aviso ${id}`,
    mensaje: 'Texto',
    botonTexto: null,
    botonEnlace: null,
    audiencia: 'todas',
    lugares: null,
    comoAviso: true,
    avisoHasta: '2026-11-20T00:00:00.000Z',
    createdAt: '2026-11-15T00:00:00.000Z',
    ...extra,
  })

  beforeEach(() => {
    olvidarAvisos()
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://traumahub.cl')
    difusiones = []
    lecturas = []
    find = vi.fn(async ({ collection, where }: { collection: string; where: unknown }) => {
      if (collection === 'difusiones') return { docs: difusiones }
      const usuario = JSON.stringify(where).match(/"usuario":\{"equals":(\d+)\}/)?.[1]
      return { docs: lecturas.filter((l) => String(l.usuario) === usuario) }
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    olvidarAvisos()
  })

  const pedir = (cuenta: Record<string, unknown>) => avisosDeLaCuenta({ find } as unknown as Payload, cuenta, ahora)

  it('ve solo los que le llegan por rol y lugar, con los leídos marcados', async () => {
    difusiones = [
      aviso(1),
      aviso(2, { audiencia: 'editor' }),
      aviso(3, { lugares: ['7'] }),
      aviso(4, { lugares: ['traumahub'] }),
    ]
    lecturas = [{ usuario: 10, difusion: 4 }]

    const central = await pedir({ id: 10, activo: true, rol: 'lector', institucion: null })
    expect(central.map((a) => [a.id, a.leido])).toEqual([
      ['1', false],
      ['4', true],
    ])
    const deLaSiete = await pedir({ id: 11, activo: true, rol: 'lector', institucion: { id: 7 } })
    expect(deLaSiete.map((a) => a.id)).toEqual(['1', '3'])
  })

  it('una cuenta inactiva, sin sesión o el soporte dentro de una institución no ven ninguno', async () => {
    difusiones = [aviso(1)]
    expect(await pedir({ id: 10, activo: false, rol: 'lector' })).toEqual([])
    expect(await avisosDeLaCuenta({ find } as unknown as Payload, null, ahora)).toEqual([])
    expect(await pedir({ id: 1, activo: true, rol: 'admin', institucion: 7, fantasma: true })).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })

  it('el botón de la plataforma se abre dentro, en el lugar donde se está; el de fuera, aparte', async () => {
    difusiones = [
      aviso(1, { botonTexto: 'Abrir', botonEnlace: 'https://traumahub.cl/biblioteca?x=1' }),
      aviso(2, { botonTexto: 'Ver', botonEnlace: 'https://youtube.com/v' }),
      aviso(3, { botonTexto: 'Solo texto', botonEnlace: '' }),
    ]
    const avisos = await pedir({ id: 10, activo: true, rol: 'lector' })
    expect(avisos.map((a) => a.boton)).toEqual([
      { texto: 'Abrir', interno: '/biblioteca?x=1' },
      { texto: 'Ver', externo: 'https://youtube.com/v' },
      null,
    ])
  })

  it('los vigentes se preguntan una vez por medio minuto, y se olvidan al escribir una difusión', async () => {
    difusiones = [aviso(1)]
    const cuenta = { id: 10, activo: true, rol: 'lector' }
    await pedir(cuenta)
    await pedir(cuenta)
    const preguntasDeVigentes = () => find.mock.calls.filter(([a]) => a.collection === 'difusiones').length
    expect(preguntasDeVigentes()).toBe(1)
    // Lo que hace el gancho de `Difusiones` al guardar una.
    olvidarAvisos()
    await pedir(cuenta)
    expect(preguntasDeVigentes()).toBe(2)
    // Y la consulta pide solo los que siguen a la vista.
    expect(JSON.stringify(find.mock.calls[0][0].where)).toContain('"avisoHasta":{"greater_than":"2026-11-16T12:00:00.000Z"}')
  })

  // Lo que pasaba con `next start`: la acción y las páginas cargaban cada una
  // su copia de `avisosEnMemoria`, el gancho borraba la suya y la barra seguía
  // medio minuto con la otra. Con una variable del módulo esta prueba falla.
  it('se olvidan aunque los borre otra copia del módulo', async () => {
    difusiones = [aviso(1)]
    const cuenta = { id: 10, activo: true, rol: 'lector' }
    await pedir(cuenta)
    vi.resetModules()
    const otraCopia = await import('@/lib/avisosEnMemoria')
    expect(otraCopia.olvidarAvisos).not.toBe(olvidarAvisos)
    otraCopia.olvidarAvisos()
    await pedir(cuenta)
    expect(find.mock.calls.filter(([a]) => a.collection === 'difusiones')).toHaveLength(2)
  })

  describe('al cerrarlos', () => {
    let create: ReturnType<typeof vi.fn>
    beforeEach(() => {
      create = vi.fn(async () => ({}))
      falso.payload = { find, create }
      sesion.actual = { activo: true, usuario: { id: 10, activo: true, rol: 'lector' } }
      difusiones = [
        aviso(1, { botonTexto: 'Abrir', botonEnlace: 'https://traumahub.cl/x' }),
        aviso(2),
        aviso(3, { audiencia: 'editor' }),
        aviso(4),
      ]
      lecturas = [{ usuario: 10, difusion: 4 }]
    })
    const anotadas = () =>
      create.mock.calls.map(([a]) => [(a as { data: { difusion: number } }).data.difusion, (a as { data: { via: string } }).data.via])

    it('anota los suyos sin leer, el del botón seguido como «boton», y nada que no le llegue', async () => {
      await marcarAvisosLeidos(['1', '2', '3', '4', '99'], '1')
      expect(anotadas()).toEqual([
        [1, 'boton'],
        [2, 'ventana'],
      ])
      expect(create.mock.calls.every(([a]) => (a as { collection: string }).collection === 'lecturas-de-avisos')).toBe(true)
    })

    it('cerrar la ventana los anota todos por ella', async () => {
      await marcarAvisosLeidos(['1', '2'])
      expect(anotadas()).toEqual([
        [1, 'ventana'],
        [2, 'ventana'],
      ])
    })

    it('sin sesión activa, o sin lista, no anota nada', async () => {
      sesion.actual = { activo: false, usuario: { id: 10, activo: false, rol: 'lector' } }
      await marcarAvisosLeidos(['1'])
      sesion.actual = { activo: true, usuario: { id: 10, activo: true, rol: 'lector' } }
      await marcarAvisosLeidos('1')
      await marcarAvisosLeidos([])
      expect(create).not.toHaveBeenCalled()
    })

    it('una fila que ya estaba, de otra pestaña, no impide anotar las demás', async () => {
      create.mockImplementationOnce(async () => {
        throw new Error('llave duplicada')
      })
      await marcarAvisosLeidos(['1', '2'])
      expect(anotadas()).toHaveLength(2)
    })
  })
})
