import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  borradoTrasElAviso,
  cambioElPlazo,
  diaEnPalabras,
  estaBloqueada,
  etapaDelBloqueo,
  sumarMeses,
} from '@/lib/instituciones'
import { resumenDeLaConservacion, type ResultadoDeLaConservacion } from '@/lib/conservacionServidor'
import { mensajeDeBorradoProximo } from '@/correo/mensajes'
import { crearZip, crc32 } from '@/lib/zip'
import { exportarInstitucion } from '@/lib/exportarInstitucionServidor'
import { AUTORIA } from '@/lib/autoria'
import { leerZip, textoDe } from '../leerZip'

/**
 * El bloqueo de una institución vencida y sus doce meses (P-016 E5.8, D-403),
 * sin base: las fechas que deciden cada paso, lo que se anota, el correo y la
 * exportación con sus archivos. Lo que pasa con una base de verdad —nadie
 * entra, el aviso sale una vez, el borrado se lleva las cuentas— está en
 * `tests/integration/bloqueoDeInstituciones.test.ts`.
 */

// El 30 de enero de 2026 entero en Chile, que en verano va tres horas atrás.
const VENCE = '2026-01-31T02:59:59.999Z'

describe('cuándo está bloqueada', () => {
  it('desde que vence, y nunca sin término', () => {
    expect(estaBloqueada(VENCE, new Date('2026-01-31T02:59:59.998Z'))).toBe(false)
    expect(estaBloqueada(VENCE, new Date('2026-01-31T03:00:00.000Z'))).toBe(true)
    expect(estaBloqueada(null)).toBe(false)
    expect(estaBloqueada(undefined)).toBe(false)
  })

  it('una fecha que no se puede leer bloquea', () => {
    expect(estaBloqueada('no es una fecha')).toBe(true)
  })
})

describe('los doce meses', () => {
  it('abierta mientras no vence; bloqueada, con el día del aviso, hasta cumplir el año', () => {
    expect(etapaDelBloqueo({ vence: VENCE }, new Date('2026-01-20T12:00:00Z'))).toEqual({ etapa: 'abierta' })
    expect(etapaDelBloqueo({ vence: null }, new Date('2030-01-01T00:00:00Z'))).toEqual({ etapa: 'abierta' })
    expect(etapaDelBloqueo({ vence: VENCE }, new Date('2026-06-01T12:00:00Z'))).toEqual({
      etapa: 'bloqueada',
      avisoEl: new Date('2027-01-31T02:59:59.999Z'),
    })
  })

  it('al año toca avisar, y el borrado se cuenta desde el aviso que salió, no desde el que tocaba', () => {
    expect(etapaDelBloqueo({ vence: VENCE }, new Date('2027-01-31T02:59:59.999Z')).etapa).toBe('por-avisar')
    // El servidor estuvo caído y el aviso salió diez días tarde: el borrado
    // también va diez días tarde, y nadie pierde sus treinta.
    const aviso = '2027-02-10T10:00:00.000Z'
    expect(etapaDelBloqueo({ vence: VENCE, avisoDeBorradoEn: aviso }, new Date('2027-03-11T09:59:59Z'))).toEqual({
      etapa: 'avisada',
      avisadaEl: new Date(aviso),
      borradoEl: new Date('2027-03-12T10:00:00.000Z'),
    })
    expect(etapaDelBloqueo({ vence: VENCE, avisoDeBorradoEn: aviso }, new Date('2027-03-12T10:00:00Z')).etapa).toBe('por-borrar')
    expect(borradoTrasElAviso(new Date(aviso))).toEqual(new Date('2027-03-12T10:00:00.000Z'))
  })

  it('con las cuentas ya borradas, borrada; y extendida, abierta aunque guarde el aviso', () => {
    const borrada = { vence: VENCE, avisoDeBorradoEn: '2027-02-01T00:00:00Z', cuentasBorradasEn: '2027-03-03T00:00:00Z' }
    expect(etapaDelBloqueo(borrada, new Date('2028-01-01T00:00:00Z'))).toEqual({
      etapa: 'borrada',
      borradaEl: new Date('2027-03-03T00:00:00Z'),
    })
    expect(etapaDelBloqueo({ ...borrada, vence: '2029-01-01T00:00:00Z' }, new Date('2028-01-01T00:00:00Z')).etapa).toBe('abierta')
  })

  it('una fecha que no se puede leer cierra la puerta, pero no lleva nunca al borrado', () => {
    expect(etapaDelBloqueo({ vence: 'no es una fecha' }, new Date('2040-01-01T00:00:00Z'))).toEqual({
      etapa: 'bloqueada',
      avisoEl: null,
    })
  })

  it('un 29 de febrero más un año avisa un día después, nunca antes', () => {
    expect(sumarMeses(new Date('2028-02-29T12:00:00Z'), 12).toISOString()).toBe('2029-03-01T12:00:00.000Z')
  })
})

describe('qué es un plazo nuevo', () => {
  it('compara instantes, no textos', () => {
    expect(cambioElPlazo('2026-12-02T02:59:59.999Z', '2026-12-02T02:59:59.999+00:00')).toBe(false)
    expect(cambioElPlazo(null, undefined)).toBe(false)
    expect(cambioElPlazo(null, '')).toBe(false)
    expect(cambioElPlazo('no', 'tampoco')).toBe(false)
  })

  it('poner, quitar o mover la fecha sí lo es', () => {
    expect(cambioElPlazo(null, '2026-12-02T02:59:59.999Z')).toBe(true)
    expect(cambioElPlazo('2026-12-02T02:59:59.999Z', null)).toBe(true)
    expect(cambioElPlazo('2026-12-02T02:59:59.999Z', '2027-12-02T02:59:59.999Z')).toBe(true)
  })
})

describe('lo que se anota y lo que se manda', () => {
  const ceros: ResultadoDeLaConservacion = {
    accionesVencidas: 0,
    cotizacionesVencidas: 0,
    accionesAnonimizadas: 0,
    titulosRetirados: 0,
    difusionesRetocadas: 0,
    preferenciasHuerfanas: 0,
    entradasVencidas: 0,
    entradasHuerfanas: 0,
  }

  it('el resumen de la pasada cuenta a quién avisó y a quién borró', () => {
    expect(resumenDeLaConservacion({ ...ceros, bloqueo: { avisadas: [], borradas: [], avisosSinEnviar: 0 } })).toBe('')
    const texto = resumenDeLaConservacion({
      ...ceros,
      bloqueo: {
        avisadas: [{ nombre: 'Hospital Uno', borradoEl: new Date('2026-12-16T15:00:00Z') }],
        borradas: [
          { nombre: 'Hospital Dos', cuentas: 31 },
          { nombre: 'Hospital Tres', cuentas: 1 },
        ],
        avisosSinEnviar: 1,
      },
    })
    expect(texto.split(' · ')).toEqual([
      'avisó que las cuentas de Hospital Uno se borrarán el 16 de diciembre de 2026',
      'borró las 31 cuentas de Hospital Dos, bloqueada hace más de un año',
      'borró la única cuenta de Hospital Tres, bloqueada hace más de un año',
      'no pudo mandar un aviso de borrado',
    ])
  })

  it('el día, en Chile y en palabras', () => {
    // A las 01:00 UTC del 1 de diciembre, en Chile todavía es 30 de noviembre.
    expect(diaEnPalabras(new Date('2026-12-01T01:00:00Z'))).toBe('30 de noviembre de 2026')
  })

  const datos = { institucion: 'Hospital Uno', vencio: '30 de enero de 2026', borrado: '12 de marzo de 2027', cuentas: 31 }

  it('a la institución: qué se borra, qué se conserva y a quién pedírselo', () => {
    const correo = mensajeDeBorradoProximo(datos)
    const texto = correo.bloques.map((b) => ('texto' in b ? b.texto : '')).join(' ')
    expect(correo.asunto).toBe('TraumaHub · Las cuentas de Hospital Uno se borrarán el 12 de marzo de 2027')
    expect(texto).toMatch(/sus 31 cuentas/)
    expect(texto).toMatch(/El contenido que se creó en la institución se conserva/)
    expect(texto).toContain(AUTORIA.correo)
    expect(correo.boton).toBeUndefined()
  })

  it('a TraumaHub: dónde se extiende el plazo, con el enlace', () => {
    const correo = mensajeDeBorradoProximo({ ...datos, cuentas: 1, enlacePanel: 'https://traumahub.cl/admin-panel/instituciones' })
    expect(correo.resumen).toMatch(/su única cuenta/)
    expect(correo.boton).toEqual({ texto: 'Abrir Instituciones', enlace: 'https://traumahub.cl/admin-panel/instituciones' })
    expect(correo.motivoDelEnvio).toMatch(/administrador de TraumaHub/)
  })
})

describe('el ZIP sin comprimir', () => {
  it('guarda tal cual lo que se pide, y comprime lo demás', () => {
    const binario = new Uint8Array([0, 1, 2, 250, 251, 252])
    const zip = crearZip([
      { nombre: 'modelo.glb', datos: binario, comprimir: false },
      { nombre: 'leeme.txt', datos: 'hola '.repeat(50) },
    ])
    const entradas = leerZip(zip)
    expect(entradas.get('modelo.glb')).toEqual({ metodo: 0, contenido: binario })
    expect(entradas.get('leeme.txt')?.metodo).toBe(8)
    expect(textoDe(entradas, 'leeme.txt')).toBe('hola '.repeat(50))
    // La suma de control de la cabecera es la de los datos, también sin comprimir.
    const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    expect(vista.getUint32(14, true)).toBe(crc32(binario))
    expect(vista.getUint16(4, true)).toBe(10)
  })
})

describe('la exportación', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'exportacion-'))
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }))
  const foto = new Uint8Array(1000).fill(7)
  writeFileSync(join(carpeta, 'foto.png'), foto)
  writeFileSync(join(carpeta, 'grande.glb'), new Uint8Array(3000))

  /** Un Payload de mentira con una institución, una ficha, tres medios y un modelo. */
  const base = {
    findByID: async ({ id }: { id: number }) =>
      id === 7
        ? {
            id: 7,
            nombre: 'Hospital Uno',
            subdominio: 'uno',
            modalidad: 'piloto',
            inicio: '2025-01-01T12:00:00.000Z',
            vence: VENCE,
            cupo: 5,
            correoDelAdministrador: 'admin@uno.invalid',
            codigoDeInvitacion: 'secreto',
          }
        : null,
    find: async ({ collection, where }: { collection: string; where: unknown }) => {
      expect(where).toEqual({ institucion: { equals: 7 } })
      const docs: Record<string, unknown[]> = {
        patologias: [{ id: 9, nombre: 'Ficha de Uno' }],
        medios: [
          { id: 1, filename: 'foto.png' },
          { id: 2, filename: '../fuera.txt' },
          { id: 3, filename: 'no-esta.png' },
        ],
        'modelos-3d': [{ id: 4, filename: 'grande.glb' }],
      }
      return { docs: docs[collection] ?? [] }
    },
    collections: {
      medios: { config: { upload: { staticDir: carpeta } } },
      'modelos-3d': { config: { upload: { staticDir: carpeta } } },
      patologias: { config: {} },
    },
  }

  it('lleva el contenido y los archivos que caben, sin comprimir y sin el código de invitación', async () => {
    const exportacion = await exportarInstitucion(base as never, 7, new Date('2026-11-16T15:00:00Z'), 2000)
    expect(exportacion).not.toBeNull()
    if (!exportacion) return
    expect(exportacion).toMatchObject({ nombre: 'Hospital Uno', subdominio: 'uno', archivos: 1, bytes: 1000 })
    expect(exportacion.documentos).toMatchObject({ patologias: 1, medios: 3, 'modelos-3d': 1 })

    const zip = leerZip(exportacion.zip)
    expect(zip.get('archivos/medios/foto.png')).toEqual({ metodo: 0, contenido: foto })
    expect(JSON.parse(textoDe(zip, 'contenido/patologias.json') ?? '')).toEqual([{ id: 9, nombre: 'Ficha de Uno' }])
    const ficha = JSON.parse(textoDe(zip, 'institucion.json') ?? '{}')
    expect(ficha).toMatchObject({ nombre: 'Hospital Uno', cupo: 5, exportadaEl: '2026-11-16T15:00:00.000Z' })
    expect(ficha).not.toHaveProperty('codigoDeInvitacion')
    expect(JSON.stringify([...zip.keys()])).not.toContain('fuera.txt')
  })

  it('lo que no entra queda nombrado, con su motivo, en el LEEME', async () => {
    const exportacion = await exportarInstitucion(base as never, 7, new Date('2026-11-16T15:00:00Z'), 2000)
    expect(exportacion?.fuera).toEqual([
      'medios/../fuera.txt: el nombre no es válido',
      'medios/no-esta.png: no está en el disco del servidor',
      'modelos-3d/grande.glb: no cupo (0,0 MB)',
    ])
    const leeme = textoDe(leerZip(exportacion!.zip), 'LEEME.txt') ?? ''
    expect(leeme).toMatch(/^Contenido de Hospital Uno en TraumaHub\n/)
    expect(leeme).toMatch(/16 de noviembre de 2026/)
    expect(leeme).toMatch(/Archivos que no se incluyeron[\s\S]*grande\.glb/)
    expect(leeme).toMatch(/las cuentas, ni lo que hizo cada persona/)
  })

  it('una institución que no existe no exporta nada', async () => {
    expect(await exportarInstitucion(base as never, 8)).toBeNull()
  })
})
