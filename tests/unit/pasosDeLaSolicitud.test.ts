import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Usuarios } from '@/collections/Usuarios'
import { mensajeDeNuevaSolicitud } from '@/correo/mensajes'
import {
  CLAVE_MINIMA,
  ETAPAS_DE_FORMACION,
  LARGOS_DE_SOLICITUD,
  PASOS_DE_LA_SOLICITUD,
  esEtapaDeFormacion,
  etiquetaDeEtapa,
  institucionConPrograma,
  problemasDelPaso,
  type DatosDeSolicitud,
} from '@/lib/solicitudDeCuenta'

/**
 * Las reglas de los tres pasos de `/registro` (`src/lib/solicitudDeCuenta.ts`,
 * D-236), que el formulario aplica antes de dejar seguir.
 *
 * Lo que la acción hace con lo que llega está en `solicitudDeCuenta.test.ts`;
 * aquí, que el formulario no deje pasar a un paso siguiente con algo que la
 * acción va a rechazar al final, cuando el campo que falló ya no se ve.
 */

const COMPLETA: DatosDeSolicitud = {
  nombre: 'Ana Pérez',
  correo: 'ana@hospital.cl',
  clave: 'una-frase-larga',
  repetida: 'una-frase-larga',
  institucion: 'Hospital Regional',
  programa: '',
  etapa: '',
  motivo: '',
}

describe('los pasos de la solicitud', () => {
  it('cada campo se valida en un paso, y en uno solo', () => {
    const campos = PASOS_DE_LA_SOLICITUD.flatMap((p) => [...p.campos])
    expect([...campos].sort()).toEqual(Object.keys(COMPLETA).sort())
    expect(new Set(campos).size).toBe(campos.length)
  })

  it('una solicitud completa, con lo opcional vacío, pasa los tres', () => {
    for (let paso = 0; paso < PASOS_DE_LA_SOLICITUD.length; paso++) expect(problemasDelPaso(paso, COMPLETA)).toEqual({})
  })

  it('el primero pide nombre, correo y una contraseña repetida igual', () => {
    const vacia = problemasDelPaso(0, { ...COMPLETA, nombre: ' ', correo: 'ana@', clave: '', repetida: '' })
    expect(Object.keys(vacia).sort()).toEqual(['clave', 'correo', 'nombre'])

    expect(problemasDelPaso(0, { ...COMPLETA, repetida: 'otra-frase-larga' }).repetida).toBeDefined()
    // Corta se dice cuánto falta, y con la corta no se habla todavía de la repetida.
    const corta = problemasDelPaso(0, { ...COMPLETA, clave: 'abc', repetida: 'x' })
    expect(corta.clave).toContain(String(CLAVE_MINIMA - 3))
    expect(corta.repetida).toBeUndefined()
  })

  it('no mira los campos de otro paso', () => {
    expect(problemasDelPaso(0, { ...COMPLETA, institucion: '' })).toEqual({})
    expect(problemasDelPaso(1, { ...COMPLETA, nombre: '' })).toEqual({})
  })

  it('el segundo exige la institución y deja el programa y la etapa como opcionales', () => {
    expect(problemasDelPaso(1, { ...COMPLETA, institucion: '  ' }).institucion).toBeDefined()
    expect(problemasDelPaso(1, { ...COMPLETA, programa: 'Kinesiología', etapa: 'kinesiologia' })).toEqual({})
  })

  it('la institución y el programa juntos caben en el tope de la columna', () => {
    const larga = 'H'.repeat(LARGOS_DE_SOLICITUD.institucion - 5)
    expect(problemasDelPaso(1, { ...COMPLETA, institucion: larga }).programa).toBeUndefined()
    expect(problemasDelPaso(1, { ...COMPLETA, institucion: larga, programa: 'Traumatología' }).programa).toBeDefined()
  })

  it('una etapa que no es de la lista no pasa', () => {
    expect(problemasDelPaso(1, { ...COMPLETA, etapa: 'r9' as DatosDeSolicitud['etapa'] }).etapa).toBeDefined()
  })
})

describe('la etapa de formación', () => {
  it('la columna ofrece las mismas que el formulario', () => {
    const campo = Usuarios.fields.find((f) => 'name' in f && f.name === 'etapaDeFormacion') as { options: { value: string }[]; required?: boolean }
    expect(campo.options.map((o) => o.value)).toEqual(ETAPAS_DE_FORMACION.map((e) => e.valor))
    // Opcional: las cuentas que crea el administrador no la preguntan.
    expect(campo.required).toBeFalsy()
  })

  it('cada una tiene su etiqueta corta, y lo que no es etapa no tiene ninguna', () => {
    for (const e of ETAPAS_DE_FORMACION) {
      expect(esEtapaDeFormacion(e.valor)).toBe(true)
      expect(etiquetaDeEtapa(e.valor)).toBe(e.corta)
    }
    expect(etiquetaDeEtapa(null)).toBe('')
    expect(etiquetaDeEtapa('r9')).toBe('')
  })

  it('el aviso a los administradores la lleva solo si se indicó', () => {
    const base = { nombre: 'Ana', correo: 'ana@hospital.cl', enlacePanel: 'https://x/admin-panel/usuarios' }
    expect(JSON.stringify(mensajeDeNuevaSolicitud({ ...base, etapa: 'R2' }))).toContain('"Etapa de formación","R2"')
    expect(JSON.stringify(mensajeDeNuevaSolicitud(base))).not.toContain('Etapa de formación')
  })
})

describe('el programa va con la institución', () => {
  it('se junta con un punto medio, y sin programa la institución queda sola', () => {
    expect(institucionConPrograma(' Hospital Regional ', ' Traumatología y ortopedia ')).toBe('Hospital Regional · Traumatología y ortopedia')
    expect(institucionConPrograma('Hospital Regional', '  ')).toBe('Hospital Regional')
  })

  it('el tope es el mismo con que el panel guarda la institución', () => {
    // `actualizarUsuario` valida la columna con un número escrito ahí. Si los
    // dos se separan, una cuenta pedida con institución y programa largos ya
    // no se puede editar desde el panel sin recortársela.
    const admin = readFileSync(join(process.cwd(), 'src/app/(frontend)/acciones/admin.ts'), 'utf8')
    const topes = [...admin.matchAll(/textoOpcional\((?:datos\.)?institucion, 'La institución', (\d+)\)/g)].map((m) => Number(m[1]))
    expect(topes.length).toBeGreaterThan(0)
    for (const tope of topes) expect(tope).toBe(LARGOS_DE_SOLICITUD.institucion)
  })
})
