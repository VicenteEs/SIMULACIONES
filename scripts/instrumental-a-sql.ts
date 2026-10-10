/**
 * Escribe el SQL que completa el catálogo de instrumental y enlaza sus modelos.
 *
 *   npx tsx scripts/instrumental-a-sql.ts <carpeta con los .glb> [--prefijo /traumahub] [--reemplazar] > carga.sql
 *
 * Por qué SQL y no `payload.create`: en el servidor, la plataforma corre dentro de
 * una imagen que no trae `tsx`, y la «Completar el catálogo» y «Cargar varios
 * modelos…» del panel hacen a mano lo que aquí se hace de una vez. Es lo mismo,
 * escrito con el mismo orden:
 *
 *  1. Cada instrumento de `INSTRUMENTAL_BASE` que todavía no está, por `slug`, se
 *     crea (lo que hace `completarElCatalogo`; no toca los que ya existen).
 *  2. Cada `.glb` cuyo nombre es el `slug` de un instrumento se registra en
 *     «Modelos 3D» (nombre «<instrumento> · instrumental», origen sintético, como
 *     el resto del instrumental) y se enlaza al instrumento (lo que hace
 *     `enlazarModeloPorNombre`). Si el instrumento ya tiene modelo, se deja como
 *     está, salvo con `--reemplazar`, que apunta el instrumento al archivo nuevo
 *     y borra los retoques guardados: apuntaban a los nodos del anterior.
 *
 * Es idempotente: se puede lanzar dos veces y la segunda no cambia nada. Todo va
 * en una transacción. **No copia los archivos**: eso lo hace quien lo ejecuta, a
 * la carpeta de medios (`medios/modelos`), con el mismo nombre que lleva el `.glb`.
 *
 * `--prefijo` es el que lleva la dirección del archivo en esa instalación
 * (`/traumahub` en ved, `/simulaciones` en desarrollo): la plataforma guarda la
 * dirección completa en `url`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { INSTRUMENTAL_BASE } from '../src/lib/instrumental'

const argumentos = process.argv.slice(2)
const indicePrefijo = argumentos.indexOf('--prefijo')
const prefijo = indicePrefijo >= 0 ? (argumentos[indicePrefijo + 1] ?? '') : ''
const carpeta = argumentos.find((a, i) => !a.startsWith('--') && i !== indicePrefijo + 1)
const reemplazar = argumentos.includes('--reemplazar')

if (!carpeta) {
  console.error('Uso: npx tsx scripts/instrumental-a-sql.ts <carpeta> [--prefijo /traumahub] [--reemplazar]')
  process.exit(2)
}

/** Un texto como literal de SQL: comillas simples duplicadas. */
const q = (v: string) => `'${v.replace(/'/g, "''")}'`

/** Triángulos de un GLB, del trozo JSON. `null` si no se puede leer. */
function triangulos(contenido: Buffer): number | null {
  try {
    const largo = contenido.readUInt32LE(12)
    const gltf = JSON.parse(contenido.toString('utf8', 20, 20 + largo)) as {
      accessors?: { count: number }[]
      meshes?: { primitives: { indices?: number; mode?: number; attributes: { POSITION: number } }[] }[]
    }
    let total = 0
    for (const malla of gltf.meshes ?? []) {
      for (const p of malla.primitives) {
        if ((p.mode ?? 4) !== 4) continue
        total += (gltf.accessors?.[p.indices ?? p.attributes.POSITION]?.count ?? 0) / 3
      }
    }
    return total > 0 ? Math.round(total) : null
  } catch {
    return null
  }
}

const NOTAS = 'Modelo de instrumental, generado con scripts/instrumental o subido desde el taller.'
const salida: string[] = ['BEGIN;']

// 1. El catálogo.
INSTRUMENTAL_BASE.forEach((i, orden) => {
  salida.push(
    `INSERT INTO instrumental (nombre, slug, categoria, icono, descripcion, especificaciones, orden) ` +
      `SELECT ${q(i.nombre)}, ${q(i.slug)}, ${q(i.categoria)}::enum_instrumental_categoria, ${q(i.icono)}::enum_instrumental_icono, ` +
      `${q(i.descripcion)}, ${q(i.especificaciones)}, ${orden + 1} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM instrumental WHERE slug = ${q(i.slug)});`,
  )
})

// 2. Los modelos.
const archivos = readdirSync(carpeta).filter((n) => n.toLowerCase().endsWith('.glb')).sort()
let enlazados = 0
for (const archivo of archivos) {
  const slug = basename(archivo, '.glb')
  const base = INSTRUMENTAL_BASE.find((i) => i.slug === slug)
  if (!base) {
    console.error(`(sin instrumento con ese identificador, se omite) ${archivo}`)
    continue
  }
  const ruta = join(carpeta, archivo)
  const bytes = readFileSync(ruta)
  const nombre = `${base.slug} · instrumental`
  const tris = triangulos(bytes)
  salida.push(
    `INSERT INTO modelos_3d (nombre, origen, anonimizado, triangulos, notas, url, filename, mime_type, filesize) ` +
      `SELECT ${q(nombre)}, 'sintetico'::enum_modelos_3d_origen, false, ${tris ?? 'NULL'}, ${q(NOTAS)}, ${q(`${prefijo}/api/modelos-3d/file/${archivo}`)}, ` +
      `${q(archivo)}, 'model/gltf-binary', ${statSync(ruta).size} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM modelos_3d WHERE filename = ${q(archivo)});`,
  )
  // El archivo cambió de tamaño: se anota (el contenido lo copia quien ejecuta).
  salida.push(
    `UPDATE modelos_3d SET filesize = ${statSync(ruta).size}, triangulos = ${tris ?? 'NULL'}, updated_at = now() WHERE filename = ${q(archivo)};`,
  )
  const enlace =
    `UPDATE instrumental SET modelo_id = (SELECT id FROM modelos_3d WHERE filename = ${q(archivo)})` +
    (reemplazar ? ', ajustes = NULL' : '') +
    `, updated_at = now() WHERE slug = ${q(slug)}` +
    (reemplazar ? '' : ' AND modelo_id IS NULL') +
    ';'
  salida.push(enlace)
  enlazados += 1
}
salida.push('COMMIT;')
console.log(salida.join('\n'))
console.error(`${INSTRUMENTAL_BASE.length} instrumentos en el catálogo base, ${enlazados} modelos para enlazar.`)
