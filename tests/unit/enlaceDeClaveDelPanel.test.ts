import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * El panel entrega el enlace de contraseña que arma `enlaceDeClave`, y no otro.
 *
 * `enlaceDeClave` se escribió, se probó (`usuarios.test.ts`) y se anunció en su
 * comentario como la única forma de armar `/clave/<testigo>`, «la que usa el
 * panel». El panel no la llamaba: `generarEnlaceDeClave` seguía componiendo su
 * propia plantilla. Las dos daban hoy lo mismo, así que ninguna prueba de
 * comportamiento lo notaba, y es exactamente la forma en que la barra doble
 * había llegado la primera vez: una copia corrige y la otra no.
 *
 * Sin SMTP, este enlace es el único camino para que alguien elija clave, y el
 * testigo caduca en una hora.
 */

const { buscarPorId, pedirClave } = vi.hoisted(() => ({
  buscarPorId: vi.fn(),
  pedirClave: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: { id: 1, rol: 'admin', activo: true },
    activo: true,
    rolReal: 'admin',
    rol: 'admin',
    simulando: false,
    usuarioEfectivo: { id: 1, rol: 'admin', activo: true },
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ findByID: buscarPorId, forgotPassword: pedirClave }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { generarEnlaceDeClave } from '@/app/(frontend)/acciones/admin'
import { direccionPublica, enlaceDeClave } from '@/collections/Usuarios'

const direccionOriginal = process.env.NEXT_PUBLIC_SERVER_URL

beforeEach(() => {
  buscarPorId.mockReset()
  buscarPorId.mockResolvedValue({ id: 7, email: 'residente@hospital.cl' })
  pedirClave.mockReset()
  pedirClave.mockResolvedValue('testigo-de-una-hora')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (direccionOriginal === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
  else process.env.NEXT_PUBLIC_SERVER_URL = direccionOriginal
})

describe('el enlace del panel es el de la colección', () => {
  it.each([
    'https://ved.example.net:10000/traumahub',
    'https://ved.example.net:10000/traumahub/',
    'https://ved.example.net:10000/traumahub///',
    'http://localhost:3000',
  ])('con %s, idéntico a enlaceDeClave', async (direccion) => {
    process.env.NEXT_PUBLIC_SERVER_URL = direccion
    const respuesta = await generarEnlaceDeClave('7')

    expect(respuesta.exito).toBe(true)
    expect(respuesta.datos?.enlace).toBe(enlaceDeClave('testigo-de-una-hora'))
  })

  it('una dirección que es solo barras cuenta como no configurada, y antes del testigo', async () => {
    // `direccionPublica()` la deja vacía, así que el enlace saldría relativo.
    // Una comprobación que mirara la variable a secas la daría por buena.
    process.env.NEXT_PUBLIC_SERVER_URL = '/'
    expect(direccionPublica()).toBe('')

    const respuesta = await generarEnlaceDeClave('7')

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/NEXT_PUBLIC_SERVER_URL/)
    // Cada `forgotPassword` invalida el testigo anterior: fallar después
    // dejaría muerto un enlace que a lo mejor ya se había entregado.
    expect(pedirClave).not.toHaveBeenCalled()
  })
})

describe('nadie más arma /clave/ a mano', () => {
  const RAIZ = process.cwd()

  const archivosDe = (directorio: string): string[] =>
    readdirSync(directorio).flatMap((nombre) => {
      const ruta = join(directorio, nombre)
      if (statSync(ruta).isDirectory()) return archivosDe(ruta)
      return /\.tsx?$/.test(nombre) ? [relative(RAIZ, ruta)] : []
    })

  const sinComentarios = (ruta: string): string =>
    readFileSync(join(RAIZ, ruta), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
      .replace(/\s+/g, ' ')

  it('solo la colección compone la dirección', () => {
    const quienesLaArman = archivosDe(join(RAIZ, 'src'))
      .filter((ruta) => /\/clave\/\$\{/.test(sinComentarios(ruta)))
      .map((ruta) => ruta.split(sep).join('/'))
    expect(quienesLaArman).toEqual(['src/collections/Usuarios.ts'])
  })

  it('la acción del panel pregunta por la dirección antes del testigo y arma con enlaceDeClave', () => {
    const codigo = sinComentarios(join('src', 'app', '(frontend)', 'acciones', 'admin.ts'))
    const cuerpo = codigo.slice(codigo.indexOf('export async function generarEnlaceDeClave'))

    expect(cuerpo).toContain('enlace: enlaceDeClave(testigo)')
    expect(cuerpo.indexOf('if (!direccionPublica())')).toBeGreaterThan(-1)
    expect(cuerpo.indexOf('if (!direccionPublica())')).toBeLessThan(
      cuerpo.indexOf('payload.forgotPassword('),
    )
    expect(cuerpo).not.toContain('process.env.NEXT_PUBLIC_SERVER_URL')
  })
})
