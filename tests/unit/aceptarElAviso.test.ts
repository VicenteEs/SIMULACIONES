import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Aceptar el aviso de privacidad al entrar (D-292): sobre qué cuenta se anota,
 * con qué versión y qué queda en el registro.
 *
 * Es la prueba del consentimiento de todas las cuentas que no pasaron por
 * `/registro`, y la ley pide poder demostrarlo: una aceptación anotada con un
 * texto que la persona no vio, o sobre una cuenta que no es la suya, no
 * demuestra nada. A quién se le pide el aviso está en
 * `avisoDePrivacidad.test.ts`; que sin sesión no se llega a la acción, en la
 * matriz de `accionesConGuardia.test.ts`.
 */

const { estado, escrituras, anotadas, revalidadas } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null, activo: false },
  escrituras: [] as Record<string, unknown>[],
  anotadas: [] as Record<string, unknown>[],
  revalidadas: [] as unknown[][],
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.activo,
    rolReal: (estado.usuario?.rol as string) ?? null,
    rol: (estado.usuario?.rol as string) ?? null,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => ({
    update: async (argumentos: Record<string, unknown>) => {
      escrituras.push(argumentos)
      return {}
    },
  }),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/registroServidor', () => ({
  registrarAccion: async (_payload: unknown, entrada: Record<string, unknown>) => {
    anotadas.push(entrada)
  },
}))
vi.mock('next/cache', () => ({
  revalidatePath: (...argumentos: unknown[]) => {
    revalidadas.push(argumentos)
  },
}))

import { aceptarElAvisoDePrivacidad } from '@/app/(frontend)/acciones/privacidad'
import { AVISO_CAMBIADO, VERSION_DEL_AVISO_DE_PRIVACIDAD } from '@/lib/avisoDePrivacidad'

const FULANA = { id: 7, nombre: 'Fulana de Tal', email: 'fulana@prueba.invalid', rol: 'lector', activo: true }

beforeEach(() => {
  estado.usuario = { ...FULANA }
  estado.activo = true
  escrituras.length = 0
  anotadas.length = 0
  revalidadas.length = 0
  // `accion` anota en la consola los rechazos que no son de acceso; aquí son
  // lo que se prueba, no un fallo.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('aceptar el aviso al entrar', () => {
  it('se anota sobre la cuenta de la sesión, con la versión que enseñó la pantalla', async () => {
    const antes = Date.now()
    expect(await aceptarElAvisoDePrivacidad(VERSION_DEL_AVISO_DE_PRIVACIDAD)).toEqual({ exito: true, datos: null })

    expect(escrituras).toEqual([
      {
        collection: 'usuarios',
        id: FULANA.id,
        data: { privacidadAceptadaEn: expect.any(String), versionDelAvisoDePrivacidad: VERSION_DEL_AVISO_DE_PRIVACIDAD },
        // Por la API, esas dos columnas están cerradas a todos (D-264).
        overrideAccess: true,
      },
    ])
    const cuando = Date.parse((escrituras[0].data as { privacidadAceptadaEn: string }).privacidadAceptadaEn)
    expect(cuando).toBeGreaterThanOrEqual(antes)
    expect(cuando).toBeLessThanOrEqual(Date.now())
  })

  it('el registro guarda cuándo se aceptó cada versión: la cuenta solo guarda la última', async () => {
    await aceptarElAvisoDePrivacidad(VERSION_DEL_AVISO_DE_PRIVACIDAD)
    expect(anotadas).toEqual([
      expect.objectContaining({
        accion: 'aviso-aceptado',
        coleccion: 'usuarios',
        documentoId: FULANA.id,
        detalle: `versión ${VERSION_DEL_AVISO_DE_PRIVACIDAD}`,
        usuario: expect.objectContaining({ id: FULANA.id }),
      }),
    ])
  })

  it('la plantilla se vuelve a pintar, para que el aviso deje paso a la página', async () => {
    await aceptarElAvisoDePrivacidad(VERSION_DEL_AVISO_DE_PRIVACIDAD)
    expect(revalidadas).toEqual([['/', 'layout']])
  })

  it('una versión que no es la vigente no se anota: el aviso cambió mientras se leía', async () => {
    for (const version of ['2026-11-04', '', ' 2026-11-05', true, null, undefined, {}]) {
      const respuesta = await aceptarElAvisoDePrivacidad(version)
      expect(respuesta, String(version)).toEqual({ exito: false, mensaje: AVISO_CAMBIADO })
    }
    expect(escrituras).toEqual([])
    expect(anotadas).toEqual([])
  })

  it('sin sesión activa no se anota nada', async () => {
    estado.activo = false
    estado.usuario = { ...FULANA, activo: false }
    expect((await aceptarElAvisoDePrivacidad(VERSION_DEL_AVISO_DE_PRIVACIDAD)).exito).toBe(false)
    estado.usuario = null
    expect((await aceptarElAvisoDePrivacidad(VERSION_DEL_AVISO_DE_PRIVACIDAD)).exito).toBe(false)
    expect(escrituras).toEqual([])
    expect(anotadas).toEqual([])
  })
})
