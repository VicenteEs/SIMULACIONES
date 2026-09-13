import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Qué queda abierto de la API REST de Payload.
 *
 * D-038 retiró la interfaz de Payload y no su API, de modo que quedó una
 * segunda administración de los mismos datos: por `PATCH /api/<coleccion>/<id>`
 * se escribía sin pasar por `depurarDocumento` ni por `faltantes()`, y por
 * `GET /api/medios?limit=500` salía el inventario de archivos —borradores
 * incluidos— para cualquier cuenta activa.
 *
 * Lo único que no se puede cerrar es `<coleccion>/file/<nombre>`: es la ruta con
 * la que Payload sirve cada imagen, vídeo y modelo 3D, y es la que llevan los
 * `<img>` de toda la plataforma. Esta prueba fija esa frontera, porque es la
 * clase de cosa que se afloja sin querer al tocar el comodín.
 */

const { atendido } = vi.hoisted(() => ({
  atendido: vi.fn(async () => new Response('archivo', { status: 200 })),
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@payloadcms/next/routes', () => ({
  REST_GET: () => atendido,
  REST_OPTIONS: () => atendido,
}))

import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from '@/app/(payload)/api/[...slug]/route'

const peticion = new Request('https://ved.example.net/api/lo-que-sea')
const contexto = (...slug: string[]) => ({ params: Promise.resolve({ slug }) })

beforeEach(() => {
  atendido.mockClear()
})

describe('el archivo subido sigue saliendo', () => {
  it('deja pasar `<coleccion>/file/<nombre>` a Payload', async () => {
    const respuesta = await GET(peticion, contexto('medios', 'file', 'radiografia.png'))
    expect(respuesta.status).toBe(200)
    expect(atendido).toHaveBeenCalledTimes(1)
  })

  it('y también el tamaño derivado, que es otro nombre en la misma ruta', async () => {
    // La miniatura y el ancho de `imageSizes` no cuelgan de un camino propio:
    // son `radiografia-400x300.png` en `file/`. Por eso la comprobación mira la
    // forma de la ruta y no el nombre del archivo.
    await GET(peticion, contexto('modelos-3d', 'file', 'femur-400x300.png'))
    expect(atendido).toHaveBeenCalledTimes(1)
  })
})

describe('lo demás está cerrado', () => {
  it('el listado de una colección no llega a Payload', async () => {
    // El caso concreto: `GET /api/medios?limit=500` devolvía nombre, tipo y
    // dirección de todos los archivos a cualquier cuenta activa.
    for (const camino of [['medios'], ['patologias'], ['cirugias', 'versions']]) {
      const respuesta = await GET(peticion, contexto(...camino))
      expect(respuesta.status).toBe(403)
    }
    expect(atendido).not.toHaveBeenCalled()
  })

  it('una ficha suelta tampoco', async () => {
    const respuesta = await GET(peticion, contexto('patologias', '12'))
    expect(respuesta.status).toBe(403)
    expect(atendido).not.toHaveBeenCalled()
  })

  it('ni algo que se le parezca a `file` con un segmento de más', async () => {
    const respuesta = await GET(peticion, contexto('medios', 'file', 'carpeta', 'foto.png'))
    expect(respuesta.status).toBe(403)
    expect(atendido).not.toHaveBeenCalled()
  })

  it('ninguna escritura, y sin tocar Payload', async () => {
    for (const metodo of [POST, PATCH, PUT, DELETE]) {
      const respuesta = await metodo()
      expect(respuesta.status).toBe(403)
    }
    expect(atendido).not.toHaveBeenCalled()
  })

  it('la autenticación por REST tampoco: dejaría la cookie en la raíz', async () => {
    // `generatePayloadCookie` fija `path: '/'` a fuego, y esa cookie gana sobre
    // la del prefijo: quien entrara por aquí dejaría al siguiente autenticado
    // con su cuenta. Ver el comentario de `acciones/sesion.ts`.
    expect((await POST()).status).toBe(403)
  })

  it('el preflight sigue la misma regla que el GET', async () => {
    expect((await OPTIONS(peticion, contexto('medios', 'file', 'foto.png'))).status).toBe(200)
    atendido.mockClear()
    expect((await OPTIONS(peticion, contexto('medios'))).status).toBe(403)
    expect(atendido).not.toHaveBeenCalled()
  })

  it('el motivo va escrito, con la forma de error de Payload', async () => {
    // Para que quien escriba un guion contra esta API lea por qué le dicen que
    // no, en vez de un 405 pelado que invita a probar con otro método.
    const cuerpo = (await POST()).json() as Promise<{ errors: { message: string }[] }>
    expect((await cuerpo).errors[0].message).toContain('panel de TraumaHub')
  })
})
