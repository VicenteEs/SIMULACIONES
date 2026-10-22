import { describe, it, expect } from 'vitest'
import { COLECCIONES } from '@/collections'
import { ESQUEMAS, esColeccionEditable, esquemaDe } from '@/admin/esquema'
import { puedeEditar } from '@/lib/guardias'

/**
 * El equipo del inicio: lo lee toda cuenta activa y lo escribe solo el administrador.
 *
 * La matriz de roles de `tests/integration/roles.test.ts` lo comprueba contra la base; esto es lo que se puede
 * comprobar sin ella: las reglas de acceso de la colección y la puerta del panel.
 */

const equipo = COLECCIONES.find((c) => c.slug === 'equipo')!
const peticion = (rol: string, activo = true) => ({ req: { user: { id: '1', rol, activo } } }) as never

describe('la colección «equipo»', () => {
  it('está registrada y es editable desde el panel', () => {
    expect(equipo).toBeTruthy()
    expect(esColeccionEditable('equipo')).toBe(true)
  })

  it('la lee toda cuenta activa, residentes incluidos', async () => {
    for (const rol of ['admin', 'editor', 'lector']) {
      expect(await equipo.access!.read!(peticion(rol)), rol).toBe(true)
    }
  })

  it('no la lee una cuenta sin activar', async () => {
    expect(await equipo.access!.read!(peticion('lector', false))).toBe(false)
  })

  it('solo el administrador la escribe: ni el editor ni el residente', async () => {
    for (const operacion of ['create', 'update', 'delete'] as const) {
      expect(await equipo.access![operacion]!(peticion('admin')), `admin ${operacion}`).toBe(true)
      expect(await equipo.access![operacion]!(peticion('editor')), `editor ${operacion}`).toBe(false)
      expect(await equipo.access![operacion]!(peticion('lector')), `lector ${operacion}`).toBe(false)
    }
  })

  it('la foto es opcional: se da de alta a alguien antes de tener su retrato', () => {
    const obligatorios = equipo.fields.filter((f) => 'required' in f && f.required).map((f) => ('name' in f ? f.name : ''))
    expect(obligatorios.sort()).toEqual(['cargo', 'nombre'])
  })
})

describe('la puerta del panel para «equipo»', () => {
  it('su esquema se declara reservado al administrador', () => {
    expect(esquemaDe('equipo').soloAdmin).toBe(true)
  })

  it('el administrador la edita', () => {
    expect(puedeEditar({ rol: 'admin' }, 'equipo')).toBe(true)
  })

  it('un editor no, aunque no tenga restricción de módulos (la lista vacía es «todos» en un módulo)', () => {
    expect(puedeEditar({ rol: 'editor' }, 'equipo')).toBe(false)
    expect(puedeEditar({ rol: 'editor', modulosEditables: [], modulosVisibles: [] }, 'equipo')).toBe(false)
  })

  it('reservar «equipo» no cierra el resto de las colecciones al editor', () => {
    for (const esquema of ESQUEMAS.filter((e) => !e.soloAdmin)) {
      expect(puedeEditar({ rol: 'editor' }, esquema.slug), esquema.slug).toBe(true)
    }
  })
})
