import { describe, it, expect } from 'vitest'
import { formatAdminURL } from 'payload/shared'
import { Medios } from '@/collections/Medios'
import { Modelos3D } from '@/collections/Modelos3D'

/**
 * Los archivos subidos: dónde viven y con qué dirección se piden.
 *
 * Dos fallos distintos, los dos invisibles hasta que alguien sube algo, y los
 * dos capaces de volver sin que nadie lo note. Por eso están atados aquí.
 */

describe('los archivos subidos no se sirven como estáticos', () => {
  it('ninguna colección guarda dentro de public/', () => {
    // Dentro de `public/`, Next sirve una copia idéntica sin preguntar por la
    // sesión, y el `access.read` de la colección deja de valer para nada: la
    // radiografía se descarga con solo tener la dirección. La decisión D-020
    // dice que sin sesión no se ve nada.
    for (const coleccion of [Medios, Modelos3D]) {
      const carpeta = (coleccion.upload as { staticDir?: string })?.staticDir ?? ''
      expect(carpeta, `${coleccion.slug} guarda en ${carpeta}`).not.toMatch(/(^|\/)public(\/|$)/)
    }
  })

  it('las dos colecciones comparten raíz, para que baste un volumen', () => {
    // El servidor monta un único volumen en /app/medios. Si una colección se
    // saliera de ahí, sus archivos vivirían dentro del contenedor y
    // desaparecerían en el siguiente despliegue, sin error ninguno.
    for (const coleccion of [Medios, Modelos3D]) {
      const carpeta = (coleccion.upload as { staticDir?: string })?.staticDir ?? ''
      expect(carpeta, coleccion.slug).toMatch(/^medios(\/|$)/)
    }
  })
})

describe('la dirección de un archivo lleva el prefijo una sola vez', () => {
  /** Lo mismo que hace Payload al leer el campo virtual `url`. */
  const direccion = (rutaApi: string) =>
    formatAdminURL({
      apiRoute: rutaApi,
      path: '/medios/file/radiografia.png',
      serverURL: 'https://servidor.example.net:10000',
    })

  it('con prefijo, Payload lo antepone él solo', () => {
    // `formatAdminURL` lee `NEXT_BASE_PATH`, que `withPayload` rellena con el
    // `basePath` de Next al compilar. Escribir el prefijo también en
    // `routes.api` lo duplicaba, y toda imagen, vídeo y modelo 3D de toda ficha
    // era un 404 en el servidor. No se veía en ninguna parte: `url` es un campo
    // virtual que Payload recalcula en cada lectura y no queda escrito.
    const previo = process.env.NEXT_BASE_PATH
    process.env.NEXT_BASE_PATH = '/traumahub'
    try {
      expect(direccion('/api')).toBe(
        'https://servidor.example.net:10000/traumahub/api/medios/file/radiografia.png',
      )
      expect(direccion('/traumahub/api')).toContain('/traumahub/traumahub/')
    } finally {
      if (previo === undefined) delete process.env.NEXT_BASE_PATH
      else process.env.NEXT_BASE_PATH = previo
    }
  })

  it('sin prefijo, la dirección es la de siempre', () => {
    const previo = process.env.NEXT_BASE_PATH
    delete process.env.NEXT_BASE_PATH
    try {
      expect(direccion('/api')).toBe(
        'https://servidor.example.net:10000/api/medios/file/radiografia.png',
      )
    } finally {
      if (previo !== undefined) process.env.NEXT_BASE_PATH = previo
    }
  })
})
