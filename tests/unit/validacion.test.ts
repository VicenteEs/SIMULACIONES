import { describe, it, expect } from 'vitest'
import {
  escaparHtml,
  esRol,
  esSlugDeModulo,
  exigirContrasena,
  exigirCorreo,
  exigirIdentificador,
  exigirRol,
  exigirSlugDeModulo,
  exigirTexto,
  textoOpcional,
} from '@/lib/validacion'

/**
 * Estas comprobaciones son la frontera de las acciones de servidor.
 *
 * Una acción de servidor se puede invocar por HTTP con los argumentos que
 * quiera quien tenga sesión, así que lo que aquí se rechace es exactamente lo
 * que no llegará nunca a la base.
 */

describe('slugs de módulo', () => {
  it('acepta los cinco módulos reales', () => {
    for (const slug of ['patologias', 'maniobras', 'casos-ao', 'cirugias', 'estudios-ia']) {
      expect(esSlugDeModulo(slug)).toBe(true)
      expect(exigirSlugDeModulo(slug)).toBe(slug)
    }
  })

  it('rechaza una colección inventada', () => {
    expect(esSlugDeModulo('usuarios')).toBe(false)
    expect(() => exigirSlugDeModulo('usuarios')).toThrow(/no existe/)
  })

  it('rechaza lo que no es texto', () => {
    for (const valor of [null, undefined, 42, {}, ['patologias']]) {
      expect(esSlugDeModulo(valor)).toBe(false)
    }
  })
})

describe('roles', () => {
  it('acepta los tres roles y ninguno más', () => {
    expect(esRol('admin')).toBe(true)
    expect(esRol('editor')).toBe(true)
    expect(esRol('lector')).toBe(true)
    expect(esRol('superadmin')).toBe(false)
    expect(esRol('')).toBe(false)
  })

  it('un rol inventado no se cuela por la acción de servidor', () => {
    expect(() => exigirRol('root')).toThrow(/no existe/)
    expect(() => exigirRol(undefined)).toThrow()
  })
})

describe('identificadores', () => {
  it('normaliza los enteros de PostgreSQL a texto', () => {
    expect(exigirIdentificador(7)).toBe('7')
    expect(exigirIdentificador('7')).toBe('7')
  })

  it('rechaza lo que podría salirse de una ruta o de una consulta', () => {
    for (const valor of ['../../.env', '1 or 1=1', '', 0, -3, 1.5, null]) {
      expect(() => exigirIdentificador(valor), String(valor)).toThrow()
    }
  })
})

describe('textos', () => {
  it('recorta los espacios sobrantes', () => {
    expect(exigirTexto('  Fractura  ', 'El nombre', 50)).toBe('Fractura')
  })

  it('rechaza el texto vacío y el que solo tiene espacios', () => {
    expect(() => exigirTexto('   ', 'El comentario', 50)).toThrow(/vacío/)
  })

  it('hace cumplir el techo de longitud', () => {
    expect(() => exigirTexto('x'.repeat(51), 'El comentario', 50)).toThrow(/50 caracteres/)
  })

  it('el texto opcional distingue vacío de ausente', () => {
    expect(textoOpcional('', 'La institución', 50)).toBeUndefined()
    expect(textoOpcional(null, 'La institución', 50)).toBeUndefined()
    expect(textoOpcional(' Hospital ', 'La institución', 50)).toBe('Hospital')
  })
})

describe('correo', () => {
  it('normaliza a minúsculas', () => {
    expect(exigirCorreo('Doctor@Hospital.CL')).toBe('doctor@hospital.cl')
  })

  it('rechaza lo que no tiene forma de dirección', () => {
    for (const valor of ['sin-arroba', 'a@b', '@hospital.cl', 'a b@c.cl', '']) {
      expect(() => exigirCorreo(valor), valor).toThrow()
    }
  })
})

describe('contraseña', () => {
  it('exige doce caracteres', () => {
    expect(() => exigirContrasena('corta123')).toThrow(/12 caracteres/)
    expect(exigirContrasena('doce-caracteres-o-mas')).toBe('doce-caracteres-o-mas')
  })

  it('no la recorta ni la modifica: los espacios pueden ser parte de la clave', () => {
    expect(exigirContrasena('  clave con espacios  ')).toBe('  clave con espacios  ')
  })
})

describe('escape de HTML', () => {
  it('neutraliza el marcado que llegaría al correo del administrador', () => {
    expect(escaparHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('escapa el ampersand primero, para no romper las demás entidades', () => {
    expect(escaparHtml('&lt;')).toBe('&amp;lt;')
  })

  it('deja intacto un texto clínico normal', () => {
    const texto = 'Fractura 32-A1, manejo con clavo endomedular.'
    expect(escaparHtml(texto)).toBe(texto)
  })
})
