import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SLUGS_DE_MODULOS } from '@/collections'
import { Requisitos } from '@/collections/Requisitos'
import { edicionDeRequisito, soloAdministracion } from '@/access/payload'
import { mensajeDeRequisitoNuevo, mensajeDeRequisitoRespondido } from '@/correo/mensajes'
import { MODULOS_ANUNCIADOS, ROTULO_PROXIMAMENTE } from '@/lib/modulosAnunciados'
import {
  ESTADOS_DE_REQUISITO,
  LARGO_MAXIMO_DE_LA_DESCRIPCION,
  LARGO_MAXIMO_DEL_TITULO,
  estadoDeRequisitoEnPalabras,
} from '@/lib/requisitos'
import { ErrorDeValidacion, exigirEstadoDeRequisito, exigirRequisito, respuestaOpcional } from '@/lib/validacion'

/**
 * El módulo 06 anunciado y su buzón de requisitos (D-163, E7).
 */

const leer = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')
const peticion = (user: Record<string, unknown> | null) => ({ req: { user } }) as never

describe('el módulo anunciado', () => {
  it('es el 06, con su ruta y su insignia, y no es uno de los cinco', () => {
    expect(MODULOS_ANUNCIADOS).toHaveLength(1)
    const [m] = MODULOS_ANUNCIADOS
    expect(m).toMatchObject({ numero: '06', slug: 'planificacion', ruta: '/planificacion', estado: 'proximamente' })
    expect(ROTULO_PROXIMAMENTE).toBe('Próximamente')
    // Un módulo de verdad manda en permisos, enumerados y seguimiento: este no.
    expect(SLUGS_DE_MODULOS as readonly string[]).not.toContain(m.slug)
  })

  it('ni la base ni los permisos lo conocen', () => {
    const opciones = readFileSync(join(process.cwd(), 'src', 'collections', 'opcionesDeModulo.ts'), 'utf8')
    expect(opciones).not.toContain('planificacion')
  })

  it('la portada, con y sin sesión, lo enseña con su insignia', () => {
    const portada = leer('src', 'app', '(frontend)', 'page.tsx')
    expect(portada).toContain("import { MODULOS_ANUNCIADOS, ROTULO_PROXIMAMENTE } from '@/lib/modulosAnunciados'")
    // Dos veces: la tira de la portada pública y la rejilla de quien entró.
    expect(portada.match(/MODULOS_ANUNCIADOS\.map/g)).toHaveLength(2)
    expect(portada).toContain('portada-tira-anunciado')
    expect(portada).toContain('className="modulo-anunciado"')
  })

  it('no se cuenta entre lo que se lee: sus tarjetas no llevan conteo ni avance', () => {
    const portada = leer('src', 'app', '(frontend)', 'page.tsx')
    const tarjeta = portada.slice(portada.indexOf('className="modulo-anunciado"'), portada.indexOf(') : (\n        // Cuenta cuyo'))
    expect(tarjeta).not.toContain('conteos[')
    expect(tarjeta).not.toContain('modulo-avance')
  })

  it('la barra superior no lo enseña: se reserva para lo que ya se puede usar', () => {
    expect(leer('src', 'components', 'Navegacion.tsx')).not.toContain('MODULOS_ANUNCIADOS')
  })

  it('su página la ve toda cuenta activa y el buzón, solo quien edita, con el usuario efectivo', () => {
    const pagina = leer('src', 'app', '(frontend)', 'planificacion', 'page.tsx')
    expect(pagina).toContain('if (!activo) return <SinAcceso')
    expect(pagina).toContain('usuarioDeSesion(usuarioEfectivo)')
    expect(pagina).toContain('puedeEditarContenido(sesion)')
    expect(pagina).toContain('<BuzonDeRequisitos esAdmin={esAdmin} />')
  })
})

describe('un requisito que llega de fuera', () => {
  it('se acepta con título y descripción, recortados', () => {
    expect(exigirRequisito('  Medir  ', ' Sobre la tomografía ')).toEqual({
      titulo: 'Medir',
      descripcion: 'Sobre la tomografía',
    })
  })

  it('se rechaza vacío, sin texto o pasado de largo', () => {
    expect(() => exigirRequisito('', 'x')).toThrow(ErrorDeValidacion)
    expect(() => exigirRequisito('x', '   ')).toThrow(ErrorDeValidacion)
    expect(() => exigirRequisito(5, 'x')).toThrow(ErrorDeValidacion)
    expect(() => exigirRequisito('x'.repeat(LARGO_MAXIMO_DEL_TITULO + 1), 'x')).toThrow(/no puede superar/)
    expect(() => exigirRequisito('x', 'x'.repeat(LARGO_MAXIMO_DE_LA_DESCRIPCION + 1))).toThrow(/no puede superar/)
  })

  it('los cinco estados existen y los demás no', () => {
    expect(ESTADOS_DE_REQUISITO.map((e) => e.value)).toEqual(['propuesto', 'en-estudio', 'aceptado', 'hecho', 'descartado'])
    expect(exigirEstadoDeRequisito('aceptado')).toBe('aceptado')
    expect(() => exigirEstadoDeRequisito('aprobado')).toThrow(ErrorDeValidacion)
    expect(estadoDeRequisitoEnPalabras('en-estudio')).toBe('En estudio')
  })

  it('la respuesta puede ir vacía —solo cambia el estado— pero no pasarse de largo', () => {
    expect(respuestaOpcional(undefined)).toBe('')
    expect(respuestaOpcional('')).toBe('')
    expect(respuestaOpcional(' Lo hacemos. ')).toBe('Lo hacemos.')
    expect(() => respuestaOpcional('x'.repeat(2001))).toThrow(/no puede superar/)
  })
})

describe('quién toca un requisito', () => {
  const admin = { id: 1, rol: 'admin', activo: true }
  const editor = { id: 2, rol: 'editor', activo: true }
  const lector = { id: 3, rol: 'lector', activo: true }
  const editorDeBaja = { id: 4, rol: 'editor', activo: false }

  it('el administrador lo modifica todo', () => {
    expect(edicionDeRequisito(peticion(admin))).toBe(true)
  })

  it('el editor, solo lo suyo y solo mientras esté propuesto: es un filtro de consulta', () => {
    expect(edicionDeRequisito(peticion(editor))).toEqual({
      and: [{ autor: { equals: '2' } }, { estado: { equals: 'propuesto' } }],
    })
  })

  it('ni el lector, ni la cuenta de baja, ni nadie sin sesión', () => {
    expect(edicionDeRequisito(peticion(lector))).toBe(false)
    expect(edicionDeRequisito(peticion(editorDeBaja))).toBe(false)
    expect(edicionDeRequisito(peticion(null))).toBe(false)
  })

  it('el estado y la respuesta solo los escribe el administrador', () => {
    const campo = (nombre: string) =>
      Requisitos.fields.find((f) => 'name' in f && f.name === nombre) as {
        access?: { create?: unknown; update?: unknown }
      }
    for (const nombre of ['estado', 'respuesta']) {
      expect(campo(nombre).access?.create, nombre).toBe(soloAdministracion)
      expect(campo(nombre).access?.update, nombre).toBe(soloAdministracion)
    }
    const datos = { req: { user: admin }, doc: {} } as never
    expect(soloAdministracion(datos)).toBe(true)
    expect(soloAdministracion({ req: { user: editor }, doc: {} } as never)).toBe(false)
  })

  it('los votos, el autor y el módulo no se escriben por la API', () => {
    for (const nombre of ['votos', 'autor', 'modulo']) {
      const campo = Requisitos.fields.find((f) => 'name' in f && f.name === nombre) as {
        access?: { update?: () => boolean }
      }
      expect(campo.access?.update?.(), nombre).toBe(false)
    }
  })

  it('lo lee y lo crea quien cuida el contenido, y lo borra el administrador', () => {
    expect(typeof Requisitos.access?.read).toBe('function')
    expect(typeof Requisitos.access?.create).toBe('function')
    expect(Requisitos.access?.update).toBe(edicionDeRequisito)
  })
})

describe('los avisos por correo', () => {
  it('el de un requisito nuevo dice quién, qué y lleva al buzón', () => {
    const c = mensajeDeRequisitoNuevo({
      autor: 'Cristóbal',
      titulo: 'Medir fragmentos',
      descripcion: 'Sobre la tomografía.',
      enlace: 'https://ejemplo.invalid/planificacion#requisito-4',
    })
    expect(c.asunto).toContain('Medir fragmentos')
    expect(c.boton?.enlace).toContain('/planificacion#requisito-4')
    expect(c.motivoDelEnvio).toMatch(/administrador/)
  })

  it('el de la respuesta saluda, dice el estado y cita la respuesta solo si la hay', () => {
    const con = mensajeDeRequisitoRespondido({
      nombre: 'Ana',
      titulo: 'Medir fragmentos',
      estado: 'Aceptado',
      respuesta: 'Lo hacemos en la segunda versión.',
      enlace: 'https://ejemplo.invalid/planificacion',
    })
    expect(con.asunto).toContain('aceptado')
    expect(con.bloques.some((b) => b.tipo === 'cita')).toBe(true)
    const sin = mensajeDeRequisitoRespondido({
      titulo: 'x',
      estado: 'Descartado',
      respuesta: '  ',
      enlace: 'https://ejemplo.invalid/planificacion',
    })
    expect(sin.bloques.some((b) => b.tipo === 'cita')).toBe(false)
  })
})

describe('el buzón en el navegador', () => {
  it('lo que importa el componente de cliente no arrastra la base', () => {
    // `validacion.ts` importa `@/collections` y con él Payload: en el navegador
    // no resuelve `fs` y la página entera se queda en «Cargando…».
    const puro = leer('src', 'lib', 'requisitos.ts')
    expect(puro).not.toMatch(/^import /m)
    expect(leer('src', 'components', 'BuzonDeRequisitos.tsx')).not.toContain('@/lib/validacion')
  })
})

describe('las acciones', () => {
  const acciones = leer('src', 'app', '(frontend)', 'acciones', 'requisitos.ts')

  it('votar es un interruptor por cuenta y no se vota lo cerrado', () => {
    expect(acciones).toContain('votantes.filter((v) => v !== usuarioId)')
    expect(acciones).toContain("actual.estado === 'hecho' || actual.estado === 'descartado'")
  })

  it('los votos viajan como números: con identificadores enteros, Payload rechaza «2» como relación', () => {
    expect(acciones).toContain(String.raw`nuevos.map((v) => (/^\d+$/.test(v) ? Number(v) : v))`)
  })

  it('reescribir pregunta a la colección y no a una copia de su regla', () => {
    const cuerpo = acciones.slice(acciones.indexOf('export async function editarRequisito'), acciones.indexOf('export async function responderRequisito'))
    expect(cuerpo).toContain('overrideAccess: false')
  })

  it('proponer tiene freno', () => {
    expect(acciones).toContain('LIMITE_DE_PROPUESTAS.permitir(usuarioId)')
  })
})
