import { describe, it, expect } from 'vitest'
import { COLECCIONES, SLUGS_DE_MODULOS } from '@/collections'

const peticionAnonima = { req: { user: null } } as never

describe('inventario de colecciones', () => {
  it('define los cinco módulos de la plataforma', () => {
    expect(SLUGS_DE_MODULOS).toEqual([
      'patologias',
      'maniobras',
      'casos-ao',
      'cirugias',
      'estudios-ia',
    ])
  })

  it('cada módulo tiene su colección registrada', () => {
    const registrados = COLECCIONES.map((c) => c.slug)
    for (const slug of SLUGS_DE_MODULOS) {
      expect(registrados).toContain(slug)
    }
  })

  it('incluye las colecciones de soporte', () => {
    const registrados = COLECCIONES.map((c) => c.slug)
    expect(registrados).toContain('usuarios')
    expect(registrados).toContain('segmentos')
    expect(registrados).toContain('medios')
    expect(registrados).toContain('modelos-3d')
  })

  it('no registra dos veces el mismo identificador', () => {
    const slugs = COLECCIONES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('invariantes de seguridad de las colecciones', () => {
  it('toda colección declara las cuatro operaciones de acceso, sin excepción', () => {
    for (const coleccion of COLECCIONES) {
      const acceso = coleccion.access ?? {}
      expect(
        typeof acceso.read,
        `${coleccion.slug} no declara acceso de lectura`,
      ).toBe('function')
      expect(
        typeof acceso.create,
        `${coleccion.slug} no declara acceso de creación`,
      ).toBe('function')
      expect(
        typeof acceso.update,
        `${coleccion.slug} no declara acceso de modificación`,
      ).toBe('function')
      expect(
        typeof acceso.delete,
        `${coleccion.slug} no declara acceso de borrado`,
      ).toBe('function')
    }
  })

  it('ninguna colección deja leer sin sesión: la plataforma es cerrada (D-020)', async () => {
    for (const coleccion of COLECCIONES) {
      const permitido = await coleccion.access!.read!(peticionAnonima)
      expect(permitido, `${coleccion.slug} permite lectura anónima`).toBe(false)
    }
  })

  it('ninguna colección deja escribir sin sesión', async () => {
    for (const coleccion of COLECCIONES) {
      for (const op of ['create', 'update', 'delete'] as const) {
        const permitido = await coleccion.access![op]!(peticionAnonima)
        expect(permitido, `${coleccion.slug} permite ${op} anónimo`).toBe(false)
      }
    }
  })

  it('los módulos de contenido guardan versiones con borradores, para que publicar sea un acto explícito', () => {
    for (const slug of SLUGS_DE_MODULOS) {
      const coleccion = COLECCIONES.find((c) => c.slug === slug)!
      expect(coleccion.versions, `${slug} no versiona`).toBeTruthy()
      expect(
        (coleccion.versions as { drafts?: unknown }).drafts,
        `${slug} no tiene borradores`,
      ).toBeTruthy()
    }
  })
  it('solo las colecciones con borradores filtran por estado de publicación', async () => {
    // El filtro { _status: ... } exige una columna que solo existe en las
    // colecciones versionadas. Aplicarlo a las demás rompe la consulta con
    // "Cannot find field for path at _status", y el lector se queda sin poder
    // leer segmentos, medios ni modelos.
    const lectorActivo = { req: { user: { rol: 'lector', activo: true } } } as never

    for (const coleccion of COLECCIONES) {
      const resultado = await coleccion.access!.read!(lectorActivo)
      const filtraPorEstado =
        typeof resultado === 'object' && resultado !== null && '_status' in resultado
      const tieneBorradores = Boolean(
        coleccion.versions && (coleccion.versions as { drafts?: unknown }).drafts,
      )

      if (filtraPorEstado) {
        expect(
          tieneBorradores,
          `${coleccion.slug} filtra por _status pero no tiene borradores`,
        ).toBe(true)
      }
    }
  })
})
