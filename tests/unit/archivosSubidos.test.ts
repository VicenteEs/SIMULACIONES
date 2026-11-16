import { describe, it, expect } from 'vitest'
import { formatAdminURL } from 'payload/shared'
import type { CollectionConfig, Field } from 'payload'
import { Medios } from '@/collections/Medios'
import { MediosPagina } from '@/collections/MediosPagina'
import { Modelos3D } from '@/collections/Modelos3D'
import { COLECCIONES } from '@/collections'
import { guardarSinPrefijo, leerSinOrigen } from '@/collections/hooks/direccionSinPrefijo'

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

describe('lo guardado no lleva el prefijo de la instalación (D-370)', () => {
  /** Los ganchos `beforeChange` del campo `name` dentro de `campos`, si lo hay. */
  const ganchosDe = (campos: Field[], name: string) => {
    const campo = campos.find((c) => 'name' in c && c.name === name) as
      | (Field & { hooks?: { beforeChange?: unknown[]; afterRead?: unknown[] }; fields?: Field[] })
      | undefined
    return campo
  }

  it('toda colección de subida guarda su url con el gancho', () => {
    // La que se olvide guarda `/traumahub/api/…` en ved, y la copia de su base
    // vuelve a llevar el prefijo a Contabo.
    const deSubida = COLECCIONES.filter((c) => c.upload)
    expect(deSubida.map((c) => c.slug).sort()).toEqual(['medios', 'medios-pagina', 'modelos-3d'])
    for (const coleccion of deSubida) {
      expect(ganchosDe(coleccion.fields, 'url')?.hooks?.beforeChange, coleccion.slug).toContain(guardarSinPrefijo)
      // Y la lee sin origen (D-396): en el subdominio de una institución, una
      // dirección a la central llegaría sin la cookie del subdominio.
      expect(ganchosDe(coleccion.fields, 'url')?.hooks?.afterRead, coleccion.slug).toContain(leerSinOrigen)
    }
  })

  it('y también la de cada tamaño de imagen, sin que falte ninguno', () => {
    for (const coleccion of [Medios, MediosPagina, Modelos3D] as CollectionConfig[]) {
      const tamanos = ((coleccion.upload as { imageSizes?: { name: string }[] }).imageSizes ?? []).map((t) => t.name)
      const grupo = ganchosDe(coleccion.fields, 'sizes')
      if (tamanos.length === 0) {
        expect(grupo, coleccion.slug).toBeUndefined()
        continue
      }
      for (const tamano of tamanos) {
        const subgrupo = ganchosDe(grupo?.fields ?? [], tamano)
        expect(ganchosDe(subgrupo?.fields ?? [], 'url')?.hooks?.beforeChange, `${coleccion.slug}.${tamano}`).toContain(
          guardarSinPrefijo,
        )
        expect(ganchosDe(subgrupo?.fields ?? [], 'url')?.hooks?.afterRead, `${coleccion.slug}.${tamano}`).toContain(leerSinOrigen)
      }
    }
  })

  it('el gancho quita lo que Payload puso, y deja lo demás', () => {
    const previo = process.env.NEXT_BASE_PATH
    process.env.NEXT_BASE_PATH = '/traumahub'
    try {
      // Lo que escribe Payload al subir: `formatAdminURL` en modo relativo.
      const escrita = formatAdminURL({ apiRoute: '/api', path: '/modelos-3d/file/tibia.glb', relative: true })
      expect(escrita).toBe('/traumahub/api/modelos-3d/file/tibia.glb')
      const gancho = guardarSinPrefijo as unknown as (args: { value: unknown }) => unknown
      expect(gancho({ value: escrita })).toBe('/api/modelos-3d/file/tibia.glb')
      expect(gancho({ value: '/api/medios/file/a.png' })).toBe('/api/medios/file/a.png')
      expect(gancho({ value: null })).toBeNull()
      expect(gancho({ value: undefined })).toBeUndefined()
    } finally {
      if (previo === undefined) delete process.env.NEXT_BASE_PATH
      else process.env.NEXT_BASE_PATH = previo
    }
  })
})
