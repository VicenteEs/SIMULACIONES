import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Field } from 'payload'
import { COLECCIONES } from '@/collections'
import { migrations } from '@/migrations'

/**
 * Las migraciones van al día con las colecciones.
 *
 * En desarrollo, Payload ajusta la base al vuelo (`push`), de modo que añadir
 * un campo a una colección funciona en el portátil sin hacer nada más. En
 * producción no: allí solo se aplican las migraciones. Un campo nuevo sin su
 * migración funciona en las pruebas, funciona al desarrollar, y falla al
 * desplegar —o peor, arranca y deja de guardar ese campo en silencio—.
 *
 * Ya pasó una vez en esta plataforma: la base del servidor arrancó con cero
 * tablas porque no había ninguna migración generada. Estas pruebas leen la
 * última instantánea que Payload escribe junto a cada migración y comprueban
 * que describa lo mismo que declaran las colecciones hoy.
 *
 * Si alguna falla, casi siempre la respuesta es la misma:
 *
 *     npx payload migrate:create
 */

const CARPETA = join(process.cwd(), 'src', 'migrations')

/** La instantánea de la migración más reciente. */
function ultimaInstantanea(): {
  nombre: string
  tablas: Record<string, { columns: Record<string, unknown> }>
} {
  const archivos = readdirSync(CARPETA)
    .filter((n) => n.endsWith('.json'))
    .sort()
  const nombre = archivos[archivos.length - 1]
  const contenido = JSON.parse(readFileSync(join(CARPETA, nombre), 'utf8'))
  return { nombre, tablas: contenido.tables ?? {} }
}

/** Payload nombra las tablas y columnas en minúsculas con guion bajo. */
const aTabla = (slug: string) => slug.replace(/-/g, '_')
const aColumna = (nombre: string) =>
  nombre
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()

/**
 * Columnas que un campo debería tener en la tabla de su colección.
 *
 * Se queda deliberadamente en lo que vive en la propia tabla. Los arreglos y
 * los bloques tienen tablas aparte, y los grupos prefijan sus columnas: meterse
 * ahí daría fallos falsos sin cubrir nada que importe más. Lo que esta prueba
 * persigue es el caso frecuente, que es un campo suelto añadido sin migración.
 */
function columnasDe(campos: Field[]): string[] {
  const salida: string[] = []

  const recorrer = (lista: Field[]) => {
    for (const campo of lista) {
      // Pestañas y contenedores sin nombre agrupan en pantalla, no en el dato.
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) {
          if ('name' in pestana) continue
          recorrer(pestana.fields as Field[])
        }
        continue
      }
      if ('fields' in campo && Array.isArray(campo.fields) && !('name' in campo)) {
        recorrer(campo.fields as Field[])
        continue
      }

      if (!('name' in campo) || typeof campo.name !== 'string') continue
      const tipo = campo.type

      // Tablas propias, o nada que guardar.
      if (tipo === 'array' || tipo === 'blocks' || tipo === 'group' || tipo === 'ui') continue
      // Muchos a muchos: también tabla aparte.
      if ((campo as { hasMany?: boolean }).hasMany) continue

      salida.push(
        tipo === 'relationship' || tipo === 'upload'
          ? `${aColumna(campo.name)}_id`
          : aColumna(campo.name),
      )
    }
  }

  recorrer(campos)
  return salida
}

describe('las migraciones siguen a las colecciones', () => {
  it('cada archivo de migración está registrado en el índice', () => {
    // `prodMigrations` recibe esta lista. Un archivo suelto que nadie importa
    // no se aplica nunca, y no hay ningún aviso de que exista.
    const enDisco = readdirSync(CARPETA)
      .filter((n) => n.endsWith('.ts') && n !== 'index.ts')
      .map((n) => n.replace(/\.ts$/, ''))
      .sort()
    const registradas = migrations.map((m) => m.name).sort()
    expect(registradas).toEqual(enDisco)
  })

  it('se aplican en orden cronológico', () => {
    // El nombre empieza por la fecha, así que el orden alfabético es el
    // cronológico. Aplicarlas desordenadas rompe las que dependen de una tabla
    // creada por la anterior.
    const nombres = migrations.map((m) => m.name)
    expect(nombres).toEqual([...nombres].sort())
  })

  it('cada migración trae su instantánea', () => {
    const json = new Set(
      readdirSync(CARPETA)
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.replace(/\.json$/, '')),
    )
    for (const { name } of migrations) {
      expect(json, `falta ${name}.json`).toContain(name)
    }
  })

  it('toda colección tiene su tabla en la última instantánea', () => {
    const { nombre, tablas } = ultimaInstantanea()
    for (const coleccion of COLECCIONES) {
      expect(
        Object.keys(tablas),
        `la colección '${coleccion.slug}' no tiene tabla en ${nombre}: falta una migración`,
      ).toContain(`public.${aTabla(coleccion.slug)}`)
    }
  })

  it('todo campo suelto de una colección tiene su columna', () => {
    const { nombre, tablas } = ultimaInstantanea()
    for (const coleccion of COLECCIONES) {
      const tabla = tablas[`public.${aTabla(coleccion.slug)}`]
      if (!tabla) continue // lo cubre la prueba anterior
      const columnas = Object.keys(tabla.columns ?? {})
      for (const esperada of columnasDe(coleccion.fields)) {
        expect(
          columnas,
          `${coleccion.slug}.${esperada} no está en ${nombre}: genere una migración`,
        ).toContain(esperada)
      }
    }
  })
})
