import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flattenAllFields } from 'payload'
import { ETIQUETA_DE_ROL } from '@/admin/etiquetaDeRol'
import { ROLES_DE_PIEZA } from '@/lib/piezasDelCaso'
import { Cirugias } from '@/collections/Cirugias'

/**
 * El nombre de cada papel de pieza, de una sola fuente.
 *
 * Había una tabla por pantalla y ya se habían separado: el formulario del caso
 * dice «Hueso (fijo)» y el taller de piezas «Hueso fijo». El taller del atlas
 * estrenó la suya con un comentario que prometía que «el panel y el caso digan
 * lo mismo», y ninguna prueba lo miraba: `ROLES_DE_PIEZA` se comparaba con la
 * colección, las etiquetas no.
 *
 * `ETIQUETA_DE_ROL` se lee del esquema del panel. Estas pruebas atan las tres
 * puntas que pueden moverse sin que nada falle: que estén los cinco papeles,
 * que digan lo mismo que la colección de Payload, y que el taller del atlas la
 * use en vez de volver a escribir su tabla.
 */

describe('la etiqueta de cada papel', () => {
  it('existe para los cinco papeles, y para ninguno más', () => {
    // Derivada de un dato, el compilador ya no garantiza que estén todos: un
    // papel nuevo en `ROLES_DE_PIEZA` sin opción en el esquema se enseñaría en
    // crudo en el taller del atlas, y esta es la única alarma.
    expect(Object.keys(ETIQUETA_DE_ROL).sort()).toEqual([...ROLES_DE_PIEZA].sort())
    for (const rol of ROLES_DE_PIEZA) {
      expect(ETIQUETA_DE_ROL[rol]?.trim(), rol).toBeTruthy()
    }
  })

  it('dice lo mismo que la colección de Payload', () => {
    // `esquema.test.ts` compara los campos del esquema con los de la colección,
    // pero no el texto de cada opción. Sin esto, el desplegable del caso y el
    // resumen del taller podían llamar distinto a la misma capa.
    const piezas = flattenAllFields({ fields: Cirugias.fields }).find(
      (c) => c.name === 'piezas',
    ) as unknown as
      | { flattenedFields: { name: string; options?: { value: string; label: unknown }[] }[] }
      | undefined
    const rol = piezas?.flattenedFields.find((c) => c.name === 'rol')
    expect(rol?.options?.length).toBeGreaterThan(0)
    const enLaColeccion = Object.fromEntries(
      (rol?.options ?? []).map((o) => [o.value, o.label]),
    )
    expect(ETIQUETA_DE_ROL).toEqual(enLaColeccion)
  })
})

describe('el taller del atlas la usa', () => {
  const taller = readFileSync(
    join(process.cwd(), 'src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx'),
    'utf8',
  ).replace(/\r\n/g, '\n')

  it('importa la tabla compartida y pinta con ella la capa de cada pieza exportada', () => {
    expect(taller).toMatch(/import \{[^}]*\bETIQUETA_DE_ROL\b[^}]*\} from '@\/admin\/etiquetaDeRol'/)
    const desde = taller.indexOf('{exportado.piezas.map(')
    const hasta = taller.indexOf('exportado.nodos.map(', desde)
    expect(desde).toBeGreaterThan(-1)
    expect(hasta).toBeGreaterThan(desde)
    expect(taller.slice(desde, hasta)).toContain('ETIQUETA_DE_ROL[p.rol] ?? p.rol')
  })

  it('no vuelve a escribir su propia tabla', () => {
    // La forma exacta que tenía la copia: si vuelve, vuelve la divergencia.
    expect(taller).not.toMatch(/Record<RolDePieza, string>\s*=\s*\{/)
    expect(taller).not.toContain("'Hueso (fijo)'")
    expect(taller).not.toContain("'Fragmento móvil'")
  })
})
