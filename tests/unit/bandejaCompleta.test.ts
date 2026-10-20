import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bandejaDelDocumento,
  casoDesdeElFormulario,
  casoParaLaConsola,
  conCompanerosDeLaPlaca,
  conTodaLaMesa,
} from '@/lib/casoQuirurgico'
import { Cirugias as CirugiasEsquema, camposDe } from '@/admin/esquema'
import { Cirugias } from '@/collections/Cirugias'
import { Actividad } from '@/collections/Actividad'

/**
 * Toda la mesa en la bandeja por omisión (P-004 E3).
 *
 * «Que todo el instrumental parta por defecto en la bandeja; si tengo que ir metiendo, se vuelve engorroso el
 * panel.» Un caso nuevo ve todo el catálogo; uno cuyo editor armó su bandeja la conserva.
 */

const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')

const catalogo = [
  { id: 1, nombre: 'Bisturí', slug: 'bisturi', categoria: 'corte' },
  { id: 2, nombre: 'Farabeuf', slug: 'farabeuf', categoria: 'exposicion' },
  { id: 3, nombre: 'Broca 3,2', slug: 'broca-3-2', categoria: 'fijacion' },
  { id: 4, nombre: 'Placa LCP', slug: 'placa-lcp', categoria: 'placas' },
]

describe('bandejaDelDocumento', () => {
  it('sin decir nada, completa: es lo que hace un caso nuevo', () => {
    expect(bandejaDelDocumento({})).toBe('completa')
    expect(bandejaDelDocumento({ bandeja: 'completa' })).toBe('completa')
    expect(bandejaDelDocumento({ bandeja: 'cualquier cosa' })).toBe('completa')
    expect(bandejaDelDocumento({ bandeja: null })).toBe('completa')
  })

  it('acotada solo si lo dice', () => {
    expect(bandejaDelDocumento({ bandeja: 'acotada' })).toBe('acotada')
  })
})

describe('conTodaLaMesa', () => {
  const caso = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Caso',
    instrumental: [{ id: 2, nombre: 'Farabeuf', slug: 'farabeuf', categoria: 'exposicion' }],
    pasos: [{ id: 'p1', instrumento: { id: 3, nombre: 'Broca 3,2', slug: 'broca-3-2', categoria: 'fijacion' } }],
    ...extra,
  })

  it('con la mesa completa suma el catálogo, marcado «por omisión», sin repetir lo que el caso ya traía', () => {
    const resultado = casoParaLaConsola(conTodaLaMesa(caso(), catalogo))
    expect(resultado.bandeja).toBe('completa')
    expect(resultado.instrumental.map((i) => i.nombre).sort()).toEqual(['Bisturí', 'Broca 3,2', 'Farabeuf', 'Placa LCP'])
    const porOmision = resultado.instrumental.filter((i) => i.porOmision).map((i) => i.nombre).sort()
    // El Farabeuf lo declaró el caso y la broca la pide un paso: no son «por omisión».
    expect(porOmision).toEqual(['Bisturí', 'Placa LCP'])
  })

  it('con «solo lo que elijo» no suma nada: la bandeja es la de antes', () => {
    const resultado = casoParaLaConsola(conTodaLaMesa(caso({ bandeja: 'acotada' }), catalogo))
    expect(resultado.bandeja).toBe('acotada')
    expect(resultado.instrumental.map((i) => i.nombre).sort()).toEqual(['Broca 3,2', 'Farabeuf'])
    expect(resultado.instrumental.some((i) => i.porOmision)).toBe(false)
  })

  it('sin catálogo (el servidor no respondió) la bandeja queda como estaba', () => {
    const original = caso()
    expect(conTodaLaMesa(original, [])).toBe(original)
  })

  it('un caso vacío con la mesa completa tiene todo el catálogo', () => {
    const resultado = casoParaLaConsola(conTodaLaMesa({ nombre: 'Caso' }, catalogo))
    expect(resultado.instrumental).toHaveLength(4)
  })

  it('convive con los compañeros de la placa sin duplicarlos', () => {
    const conPlaca = conCompanerosDeLaPlaca(
      { nombre: 'Caso', instrumental: [{ id: 4, nombre: 'Placa LCP', slug: 'placa-lcp-recta-3-5' }] },
      [{ id: 3, nombre: 'Broca 3,2', slug: 'broca-3-2' }],
    )
    const resultado = casoParaLaConsola(conTodaLaMesa(conPlaca, catalogo))
    const ids = resultado.instrumental.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(resultado.instrumental.find((i) => i.id === '3')?.paraLaPlaca).toBe(true)
  })
})

describe('el editor ve lo mismo que el residente', () => {
  const instrumentos = catalogo.map((i) => ({
    id: String(i.id),
    nombre: i.nombre,
    slug: i.slug,
    icono: 'generico',
    descripcion: '',
    categoria: i.categoria,
    modeloUrl: null,
    ajustes: null,
  }))
  const formulario = (extra: Record<string, unknown>) =>
    casoDesdeElFormulario(
      { nombre: 'Caso', pasos: [], piezas: [], instrumental: [2], ...extra },
      { opciones: {}, instrumentos },
    )

  it('con la mesa completa, la bandeja es el catálogo entero y todos cuentan como «en la bandeja»', () => {
    const caso = formulario({ bandeja: 'completa' })
    expect(caso.bandeja).toBe('completa')
    expect(caso.instrumental).toHaveLength(4)
    expect(caso.instrumental.every((i) => i.enLaBandejaDelCaso)).toBe(true)
  })

  it('con «solo lo que elijo», lo declarado más lo que piden los pasos', () => {
    const caso = formulario({ bandeja: 'acotada' })
    expect(caso.bandeja).toBe('acotada')
    expect(caso.instrumental.map((i) => i.nombre)).toEqual(['Farabeuf'])
    // El catálogo entero queda aparte, para «Añadir a la bandeja».
    expect(caso.catalogoDelEditor).toHaveLength(4)
  })

  it('un caso sin decir nada es de mesa completa', () => {
    expect(formulario({}).bandeja).toBe('completa')
  })
})

describe('el campo', () => {
  it('es un desplegable de dos valores, completa por omisión, en la colección y en el panel', () => {
    const enPayload = Cirugias.fields.find((f) => 'name' in f && f.name === 'bandeja') as unknown as Record<string, unknown>
    expect(enPayload.type).toBe('select')
    expect(enPayload.defaultValue).toBe('completa')
    expect((enPayload.options as { value: string }[]).map((o) => o.value)).toEqual(['completa', 'acotada'])
    const enElPanel = camposDe(CirugiasEsquema).find((c) => c.nombre === 'bandeja')
    expect(enElPanel?.tipo).toBe('seleccion')
    expect(enElPanel && 'porOmision' in enElPanel ? enElPanel.porOmision : null).toBe('completa')
  })
})

describe('el cableado', () => {
  it('la página del residente pide la mesa solo con la bandeja completa, por una ayuda de lib', () => {
    const pagina = fuente('src', 'app', '(frontend)', 'simulador', '[id]', 'page.tsx')
    expect(pagina).toContain("from '@/lib/mesaCompleta'")
    expect(pagina).toMatch(/bandejaDelDocumento\(documentoDelCaso\) === 'completa' \? await traerTodaLaMesa\(/)
    // La página no consulta el catálogo por su cuenta: lo hace `mesaCompleta.ts`.
    expect(pagina).not.toMatch(/collection: 'instrumental'/)
  })

  it('el editor cambia de modo por la bandeja y «Usar como bandeja del caso» la deja acotada', () => {
    const editor = fuente('src', 'components', 'admin', 'formulario', 'EditorDelSimulador.tsx')
    expect(editor).toMatch(/alCambiarLaBandeja: \(modo\) => alCambiar\('bandeja', modo\)/)
    expect(editor).toMatch(/alFijarLaBandeja: \(ids\) => \{\s*alCambiar\('instrumental', ids\)\s*alCambiar\('bandeja', 'acotada'\)/)
  })

  it('la consola no baja de entrada los modelos de lo que está solo porque la mesa es completa', () => {
    const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
    expect(consola).toMatch(/\.filter\(\(i\) => !i\.porOmision \|\| i\.categoria === categoriaAbierta\)/)
  })
})

describe('la migración', () => {
  const carpeta = join(process.cwd(), 'src', 'migrations')
  const nombre = readdirSync(carpeta)
    .sort()
    .find((n) => n.endsWith('_bandeja_completa_o_acotada.ts'))
  const migracion = nombre ? readFileSync(join(carpeta, nombre), 'utf8') : ''

  it('crea la columna con «completa» por omisión, también en las versiones', () => {
    expect(nombre).toBeTruthy()
    expect(migracion).toContain(`ADD COLUMN "bandeja" "enum_cirugias_bandeja" DEFAULT 'completa'`)
    expect(migracion).toContain(`ADD COLUMN "version_bandeja" "enum__cirugias_v_version_bandeja" DEFAULT 'completa'`)
  })

  it('deja acotada la que ya tenía su bandeja armada, en publicadas y en versiones', () => {
    expect(migracion).toMatch(/UPDATE "cirugias" SET "bandeja" = 'acotada'[\s\S]*?"path" = 'instrumental'/)
    expect(migracion).toMatch(/UPDATE "_cirugias_v" SET "version_bandeja" = 'acotada'[\s\S]*?"path" = 'version\.instrumental'/)
  })
})

describe('lo usado queda para los estudiantes (P-004 E3)', () => {
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

  it('la consola manda los insumos con el recorrido, en cada hito, sin leerlos de un estado viejo', () => {
    expect(consola).toContain('(puntajeActual: number, lista: ComplicacionDelCaso[], usados: RegistroDeInsumos)')
    expect(consola).toMatch(/insumos: resumenDeInsumos\(\s*usados,/)
    expect(consola).toContain('guardarRecorrido(puntaje, nuevas, insumos)')
    expect(consola).toContain('guardarRecorrido(puntajeTrasElPaso, complicaciones, insumos)')
  })

  it('el residente los ve al volver, en «Su recorrido anterior»', () => {
    expect(consola).toContain('Insumos que usó')
    expect(consola).toContain('recorridoGuardado.insumos.map(')
  })

  it('la fila de actividad tiene su columna y la migración la crea', () => {
    const columna = Actividad.fields.find((f) => 'name' in f && f.name === 'insumos') as unknown as Record<string, unknown>
    expect(columna?.type).toBe('json')
    const carpeta = join(process.cwd(), 'src', 'migrations')
    const nombre = readdirSync(carpeta).sort().find((n) => n.endsWith('_insumos_del_recorrido.ts'))
    expect(nombre).toBeTruthy()
    expect(readFileSync(join(carpeta, nombre as string), 'utf8')).toContain('ALTER TABLE "actividad" ADD COLUMN "insumos" jsonb')
  })

  it('el editor no lista como «no usado» todo el catálogo cuando la mesa es completa', () => {
    expect(consola).toMatch(/i\.enLaBandejaDelCaso && caso\.bandeja === 'acotada'/)
  })
})
