import { describe, expect, it } from 'vitest'
import {
  ACCIONES_DEL_REGISTRO,
  COLECCIONES_SIN_REGISTRO,
  cambiosDePermisos,
  diaLocal,
  duracionCorta,
  fotoDePermisos,
  segundosDelLatido,
  LATIDO_DE_ACTIVIDAD_MS,
} from '@/lib/registro'
import { capacidadesPorRol } from '@/lib/permisos'
import { COLECCIONES } from '@/collections'
import { dondeDelRegistro } from '@/lib/registroPanel'

describe('segundosDelLatido', () => {
  const t0 = Date.parse('2026-09-30T10:00:00Z')
  it('el primer latido de la jornada no abona nada', () => {
    expect(segundosDelLatido(null, t0)).toBe(0)
  })
  it('abona lo que pasó desde el anterior', () => {
    expect(segundosDelLatido(t0, t0 + 60_000)).toBe(60)
  })
  it('recorta las ráfagas y el reloj que va hacia atrás', () => {
    expect(segundosDelLatido(t0, t0)).toBe(0)
    expect(segundosDelLatido(t0, t0 - 5_000)).toBe(0)
  })
  it('techo: un latido más la tolerancia de la red', () => {
    expect(segundosDelLatido(t0, t0 + LATIDO_DE_ACTIVIDAD_MS * 2)).toBe(75)
  })
  it('un hueco largo no se abona: no se sabe si hubo alguien', () => {
    expect(segundosDelLatido(t0, t0 + LATIDO_DE_ACTIVIDAD_MS * 2 + 1)).toBe(0)
    expect(segundosDelLatido(t0, t0 + 3_600_000)).toBe(0)
  })
})

describe('cambiosDePermisos', () => {
  it('solo mira los cinco campos de permisos', () => {
    const antes = { rol: 'lector', activo: false, password: 'a', ultimoAcceso: 'x', modulosVisibles: [] }
    const despues = { rol: 'editor', activo: true, password: 'b', ultimoAcceso: 'y', modulosVisibles: [] }
    const campos = cambiosDePermisos(antes, despues).map((c) => c.campo)
    expect(campos).toEqual(['rol', 'activo'])
  })
  it('las listas con los mismos módulos en otro orden no son un cambio', () => {
    expect(cambiosDePermisos({ modulosEditables: ['a', 'b'] }, { modulosEditables: ['b', 'a'] })).toEqual([])
  })
  it('null y ausente son lo mismo', () => {
    expect(cambiosDePermisos({ pendiente: null }, {})).toEqual([])
  })
  it('una cuenta nueva cuenta todo lo que trae como cambio', () => {
    expect(cambiosDePermisos(null, { rol: 'lector', activo: true }).map((c) => c.campo)).toEqual(['rol', 'activo'])
  })
})

describe('fotoDePermisos', () => {
  it('sin rol no hay foto', () => {
    expect(fotoDePermisos({ id: 1 })).toBeNull()
    expect(fotoDePermisos(null)).toBeNull()
  })
  it('activo solo si es exactamente true', () => {
    expect(fotoDePermisos({ rol: 'editor', activo: 'yes' })?.activo).toBe(false)
    expect(fotoDePermisos({ rol: 'editor', activo: true, modulosVisibles: ['cirugias', 3] })?.modulosVisibles).toEqual(['cirugias'])
  })
})

describe('formato de tiempos', () => {
  it('duracionCorta', () => {
    expect(duracionCorta(45)).toBe('45 s')
    expect(duracionCorta(720)).toBe('12 min')
    expect(duracionCorta(7500)).toBe('2 h 05 min')
  })
  it('diaLocal', () => {
    expect(diaLocal(new Date(2026, 8, 3, 23, 59))).toBe('2026-09-03')
  })
})

describe('el registro en las colecciones', () => {
  it('toda colección, salvo las nombradas, lleva los dos ganchos', () => {
    for (const c of COLECCIONES) {
      const lleva = (c.hooks?.afterChange?.length ?? 0) > 0 && (c.hooks?.afterDelete?.length ?? 0) > 0
      expect(lleva, c.slug).toBe(!COLECCIONES_SIN_REGISTRO.includes(c.slug))
    }
  })
  it('las colecciones sin registro existen', () => {
    const slugs = COLECCIONES.map((c) => c.slug)
    for (const s of COLECCIONES_SIN_REGISTRO) expect(slugs, s).toContain(s)
  })
  it('las acciones tienen etiqueta y no se repiten', () => {
    const v = ACCIONES_DEL_REGISTRO.map((a) => a.value)
    expect(new Set(v).size).toBe(v.length)
  })
})

describe('permisos por rol', () => {
  const por = Object.fromEntries(capacidadesPorRol().map((c) => [c.clave, c]))
  it('el lector solo lee', () => {
    const c = capacidadesPorRol().filter((x) => x.lector).map((x) => x.clave)
    expect(c).toEqual(['leer', 'modulos'])
  })
  it('administrar es solo del administrador', () => {
    for (const k of ['cuentas', 'seguimiento', 'sistema', 'publicar-revision']) {
      expect([por[k].admin, por[k].editor, por[k].lector], k).toEqual([true, false, false])
    }
  })
  it('el editor edita y valida pero no administra', () => {
    expect(por.editar.editor && por.validar.editor && por.publicar.editor).toBe(true)
  })
})

describe('dondeDelRegistro', () => {
  it('ignora lo que no es un identificador ni una fecha', () => {
    expect(dondeDelRegistro({ usuario: '1 OR 1=1', desde: 'ayer' })).toEqual({})
  })
  it('las fechas son días completos', () => {
    const w = dondeDelRegistro({ desde: '2026-09-01', hasta: '2026-09-30' }) as { and: unknown[] }
    expect(w.and).toHaveLength(2)
  })
})
