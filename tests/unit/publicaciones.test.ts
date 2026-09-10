import { describe, it, expect, beforeEach } from 'vitest'
import type { CollectionConfig } from 'payload'
import { COLECCIONES, SLUGS_DE_MODULOS } from '@/collections'
import { olvidarPublicaciones, versionActual } from '@/lib/publicaciones'

/**
 * El aviso de contenido nuevo llega desde los cinco módulos.
 *
 * Durante meses solo avisaron las patologías: el gancho estaba escrito a mano
 * dentro de esa colección y las otras cuatro no lo tenían. Publicar una
 * maniobra o una cirugía no interrumpía a nadie, y nadie lo notó porque no hay
 * error que ver: el aviso sencillamente no aparece.
 *
 * Se prueba el **comportamiento** y no el cableado: se ejecutan los ganchos que
 * la colección declare y se mira si el registro se movió. Así vale igual si
 * mañana el gancho se aplica de otra manera.
 */

const coleccionDe = (slug: string) => COLECCIONES.find((c) => c.slug === slug)!

/** Ejecuta los `afterChange` de una colección como lo haría Payload. */
async function publicar(coleccion: CollectionConfig, estado: 'published' | 'draft') {
  const doc = {
    id: 1,
    _status: estado,
    nombre: 'Fractura de tibia',
    titulo: 'Fractura de tibia',
    alt: 'Fractura de tibia',
  }
  for (const gancho of coleccion.hooks?.afterChange ?? []) {
    await gancho({
      collection: coleccion as never,
      context: {},
      data: doc,
      doc,
      operation: 'update',
      previousDoc: { ...doc, _status: 'draft' },
      req: {} as never,
    })
  }
}

describe('avisar al publicar', () => {
  beforeEach(() => olvidarPublicaciones())

  it('los cinco módulos avisan', async () => {
    for (const slug of SLUGS_DE_MODULOS) {
      olvidarPublicaciones()
      await publicar(coleccionDe(slug), 'published')
      const estado = versionActual()
      expect(estado.version, `${slug} no avisa al publicar`).toBeGreaterThan(0)
      expect(estado.modulo, `${slug} avisa sin decir de qué módulo`).toBe(slug)
    }
  })

  it('guardar un borrador no interrumpe a nadie', async () => {
    for (const slug of SLUGS_DE_MODULOS) {
      await publicar(coleccionDe(slug), 'draft')
    }
    expect(versionActual().version).toBe(0)
  })

  it('el material de apoyo no avisa', async () => {
    // Subir una imagen no es publicar una ficha. Si algún día alguien copia el
    // gancho a `medios`, el residente recibiría un aviso por cada archivo.
    const auxiliares = COLECCIONES.filter(
      (c) => !(SLUGS_DE_MODULOS as readonly string[]).includes(c.slug),
    )
    for (const coleccion of auxiliares) {
      await publicar(coleccion, 'published')
    }
    expect(versionActual().version, 'una colección auxiliar está avisando').toBe(0)
  })

  it('el aviso toma el título del campo que cada colección usa como tal', async () => {
    // Cuatro módulos titulan con `nombre` y los casos AO con `titulo`. El
    // gancho lo lee de la colección en vez de recibirlo, que es lo que hacía
    // imposible copiar y pegar el de patologías.
    await publicar(coleccionDe('casos-ao'), 'published')
    expect(versionActual().titulo).toBe('Fractura de tibia')
  })
})

describe('a cada cuenta se le cuenta solo lo suyo', () => {
  beforeEach(() => olvidarPublicaciones())

  it('un lector restringido no se entera de lo publicado en otro módulo', async () => {
    // Enterarse es la fuga: el aviso nombra el módulo, y aunque no lo nombrara,
    // le haría recargar para no encontrar nada (decisión D-020).
    await publicar(coleccionDe('cirugias'), 'published')

    const soloPatologias = (modulo: string) => modulo === 'patologias'
    expect(versionActual(soloPatologias).version).toBe(0)
    expect(versionActual(soloPatologias).modulo).toBeNull()

    // Y quien sí lo ve, lo ve.
    expect(versionActual().modulo).toBe('cirugias')
  })

  it('la versión solo crece cuando publica un módulo que la cuenta ve', async () => {
    const soloPatologias = (modulo: string) => modulo === 'patologias'

    await publicar(coleccionDe('patologias'), 'published')
    const primera = versionActual(soloPatologias).version
    expect(primera).toBeGreaterThan(0)

    await publicar(coleccionDe('maniobras'), 'published')
    expect(versionActual(soloPatologias).version, 'se movió por un módulo ajeno').toBe(primera)

    await publicar(coleccionDe('patologias'), 'published')
    expect(versionActual(soloPatologias).version).toBeGreaterThan(primera)
  })
})
