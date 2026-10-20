import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLASES_DE_MODELO, ESQUEMAS, esquemaDe, type Campo } from '@/admin/esquema'
import { opcionesParaElCampo, type Relaciones } from '@/admin/opcionesParaElCampo'
import { Modelos3D } from '@/collections/Modelos3D'
import { Instrumental } from '@/collections/catalogos'
import { Cirugias } from '@/collections/Cirugias'

/**
 * Los modelos 3D en dos carpetas: herramientas y cuerpo (P-004 E1).
 *
 * Lo que se promete: cada desplegable de modelo ofrece solo su carpeta, los modelos nuevos nacen en la que
 * les toca, y la colección también lo exige, porque el panel no es la única puerta.
 */

const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')

function* campos(lista: readonly Campo[]): Generator<Campo> {
  for (const c of lista) {
    yield c
    if (c.tipo === 'lista' || c.tipo === 'grupo') yield* campos(c.campos)
  }
}

const relacionesDeModelos = (): Extract<Campo, { tipo: 'relacion' }>[] =>
  ESQUEMAS.flatMap((e) => e.secciones.flatMap((s) => [...campos(s.campos)])).filter(
    (c): c is Extract<Campo, { tipo: 'relacion' }> => c.tipo === 'relacion' && c.coleccion === 'modelos-3d',
  )

const relaciones: Relaciones = {
  'modelos-3d': [
    { id: '1', etiqueta: 'Cuerpo A', clase: 'cuerpo' },
    { id: '2', etiqueta: 'Placa DCP', clase: 'herramienta' },
    { id: '3', etiqueta: 'Fémur', clase: 'cuerpo' },
    { id: '4', etiqueta: 'Broca', clase: 'herramienta' },
    { id: '5', etiqueta: 'Sin clase' },
  ],
}

describe('las dos carpetas', () => {
  it('son herramientas y modelos del cuerpo, con el valor que guarda la base', () => {
    expect(CLASES_DE_MODELO.map((c) => c.valor)).toEqual(['herramienta', 'cuerpo'])
    expect(CLASES_DE_MODELO.map((c) => c.etiqueta)).toEqual(['Herramientas', 'Modelos del cuerpo'])
  })

  it('la colección tiene el campo, obligatorio, con `cuerpo` por omisión y con índice', () => {
    const campo = Modelos3D.fields.find((f) => 'name' in f && f.name === 'clase') as unknown as Record<string, unknown>
    expect(campo).toBeTruthy()
    expect(campo.type).toBe('select')
    expect(campo.required).toBe(true)
    expect(campo.defaultValue).toBe('cuerpo')
    expect(campo.index).toBe(true)
    expect((campo.options as { value: string }[]).map((o) => o.value)).toEqual(['herramienta', 'cuerpo'])
  })

  it('el panel lo describe y parte el listado por él', () => {
    const esquema = esquemaDe('modelos-3d')
    expect(esquema.carpetas?.campo).toBe('clase')
    expect(esquema.carpetas?.opciones.map((o) => o.valor)).toEqual(['herramienta', 'cuerpo'])
    const nombres = esquema.secciones.flatMap((s) => [...campos(s.campos)]).map((c) => c.nombre)
    expect(nombres).toContain('clase')
    // La carpeta ya es la pestaña: una columna que la repitiera enseñaría el valor crudo («herramienta»).
    expect(esquema.columnas.map((c) => c.nombre)).not.toContain('clase')
  })
})

describe('cada desplegable de modelo pide su carpeta', () => {
  it('el del instrumento es de herramientas y el del caso, del cuerpo', () => {
    const delInstrumento = relacionesDeModelos().find((c) => c.etiqueta === 'Modelo 3D del instrumento')
    const delCaso = relacionesDeModelos().find((c) => c.etiqueta === 'Modelo 3D del caso')
    expect(delInstrumento?.clase).toBe('herramienta')
    expect(delCaso?.clase).toBe('cuerpo')
  })

  it('la colección lo exige también: filterOptions en el modelo del instrumento y en el del caso', () => {
    const modeloDe = (lista: readonly unknown[]) =>
      lista.find((f) => (f as { name?: string }).name === 'modelo') as { filterOptions?: unknown }
    expect(modeloDe(Instrumental.fields).filterOptions).toEqual({ clase: { equals: 'herramienta' } })
    expect(modeloDe(Cirugias.fields).filterOptions).toEqual({ clase: { equals: 'cuerpo' } })
  })
})

describe('opcionesParaElCampo', () => {
  const campoDe = (clase?: 'herramienta' | 'cuerpo') =>
    ({ tipo: 'relacion', nombre: 'modelo', etiqueta: 'Modelo', coleccion: 'modelos-3d', clase }) as Extract<
      Campo,
      { tipo: 'relacion' }
    >

  it('con carpeta, solo las suyas (y las que no tienen clase)', () => {
    expect(opcionesParaElCampo(campoDe('herramienta'), relaciones, null).map((o) => o.id)).toEqual(['2', '4', '5'])
    expect(opcionesParaElCampo(campoDe('cuerpo'), relaciones, null).map((o) => o.id)).toEqual(['1', '3', '5'])
  })

  it('sin carpeta, las dos, con las herramientas primero y su rótulo delante', () => {
    const opciones = opcionesParaElCampo(campoDe(), relaciones, null)
    expect(opciones.map((o) => o.etiqueta)).toEqual([
      'Herramienta · Placa DCP',
      'Herramienta · Broca',
      'Cuerpo · Cuerpo A',
      'Cuerpo · Fémur',
      'Sin clase',
    ])
  })

  it('lo que ya está elegido no desaparece aunque sea de la otra carpeta', () => {
    expect(opcionesParaElCampo(campoDe('herramienta'), relaciones, { id: 3 }).map((o) => o.id)).toContain('3')
    expect(opcionesParaElCampo(campoDe('herramienta'), relaciones, '1').map((o) => o.id)).toContain('1')
  })

  it('no toca las demás relaciones', () => {
    const otras: Relaciones = { medios: [{ id: '9', etiqueta: 'Imagen' }] }
    const campo = { tipo: 'relacion', nombre: 'm', etiqueta: 'M', coleccion: 'medios' } as Extract<
      Campo,
      { tipo: 'relacion' }
    >
    expect(opcionesParaElCampo(campo, otras, null)).toEqual(otras.medios)
  })
})

describe('los modelos nuevos nacen en su carpeta', () => {
  it('el taller de instrumental sube a herramientas', () => {
    expect(fuente('src', 'components', 'admin', 'atlas', 'TallerDeInstrumental.tsx')).toMatch(
      /formulario\.set\('clase', 'herramienta'\)/,
    )
  })

  it('la exportación del atlas crea en el cuerpo', () => {
    expect(fuente('src', 'lib', 'exportarPreparacion.ts')).toMatch(/clase: 'cuerpo'/)
  })

  it('el guion que inserta los modelos de instrumental los pone en herramientas', () => {
    expect(fuente('scripts', 'instrumental-a-sql.ts')).toContain(`'herramienta'::enum_modelos_3d_clase`)
  })

  it('subir desde el listado cae en la carpeta que se está viendo', () => {
    const tabla = fuente('src', 'components', 'admin', 'TablaDocumentos.tsx')
    expect(tabla).toMatch(/formulario\.set\(esquema\.carpetas\.campo, carpeta\)/)
    expect(tabla).toMatch(/<SubidorDeArchivos[\s\S]{0,120}carpeta=\{carpeta\}/)
  })

  it('el selector pide sus opciones con la carpeta que dice el campo', () => {
    expect(fuente('src', 'components', 'admin', 'formulario', 'Campos.tsx')).toMatch(
      /opcionesParaElCampo\(campo, relaciones, valor\)/,
    )
  })
})

describe('la migración reparte lo que ya había', () => {
  const carpeta = join(process.cwd(), 'src', 'migrations')
  const nombre = readdirSync(carpeta)
    .sort()
    .find((n) => n.endsWith('_modelos_en_dos_carpetas.ts'))
  const migracion = nombre ? readFileSync(join(carpeta, nombre), 'utf8') : ''

  it('existe', () => {
    expect(nombre).toBeTruthy()
  })

  it('crea el enum, la columna con `cuerpo` por omisión y el índice', () => {
    expect(migracion).toContain(`CREATE TYPE "public"."enum_modelos_3d_clase" AS ENUM('herramienta', 'cuerpo')`)
    expect(migracion).toContain(`ADD COLUMN "clase" "enum_modelos_3d_clase" DEFAULT 'cuerpo' NOT NULL`)
    expect(migracion).toContain('modelos_3d_clase_idx')
  })

  it('herramienta es lo que algún instrumento usa, salvo lo que también usa una cirugía', () => {
    expect(migracion).toMatch(/UPDATE "modelos_3d" SET "clase" = 'herramienta'/)
    expect(migracion).toMatch(/SELECT "modelo_id" FROM "instrumental"/)
    expect(migracion).toMatch(/"id" NOT IN \(SELECT "modelo_id" FROM "cirugias"/)
  })
})
