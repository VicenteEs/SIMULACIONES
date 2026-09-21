/**
 * Carga en «Modelos 3D» todos los `.glb` de una carpeta.
 *
 *   npx tsx scripts/cargar-modelos.ts <carpeta> [--aplicar]
 *
 * Sin `--aplicar` solo dice lo que haría. Es la forma de entrar de una tanda de
 * modelos de referencia —las extremidades separadas del atlas, por ejemplo— sin
 * subirlos uno a uno desde el panel.
 *
 * Pasa por `payload.create`, no escribe en la base por su cuenta: cada archivo
 * cruza el mismo `validarModelo3D` que una subida desde el panel —firma glTF,
 * versión 2, techo de 5 MB— y Payload decide el nombre en disco como siempre.
 * Un archivo que el panel rechazaría, aquí también se rechaza, y el motivo sale
 * en español.
 *
 * Es idempotente: reconoce un modelo ya cargado por su nombre y no lo duplica.
 * Por eso el nombre lleva la marca de la tanda entre paréntesis: en la
 * plataforma ya hay una «pierna derecha» que salió del taller del atlas, y son
 * archivos distintos.
 *
 * Un archivo que falla no detiene a los demás. Al final dice cuáles no
 * entraron y por qué, y sale con código 1 si hubo alguno.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

// Igual que en `caso-de-prueba.ts`: tsx no carga el .env, y todo lo que
// necesita sus variables se importa dentro de `principal()`.
const archivoEnv = resolve(process.cwd(), '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

const MARCA_DE_LA_TANDA = 'referencia'

const NOTAS =
  'Modelo de referencia de varón adulto, separado por segmentos a partir de BodyParts3D ' +
  '(© The Database Center for Life Science, CC BY 4.0). Cada estructura es un objeto con su ' +
  'nombre anatómico. No procede de ningún paciente.'

/** «pierna-inferior-y-pie-derecha.glb» → «Pierna inferior y pie derecha (referencia)». */
function nombreDe(archivo: string): string {
  const texto = basename(archivo, '.glb').replace(/-/g, ' ')
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} (${MARCA_DE_LA_TANDA})`
}

/** Triángulos de un GLB, leídos de su trozo JSON. Devuelve `undefined` si no se puede. */
function contarTriangulos(contenido: Buffer): number | undefined {
  try {
    const largo = contenido.readUInt32LE(12)
    const gltf = JSON.parse(contenido.toString('utf8', 20, 20 + largo)) as {
      accessors?: { count: number }[]
      meshes?: { primitives: { indices?: number; mode?: number; attributes: { POSITION: number } }[] }[]
    }
    let total = 0
    for (const malla of gltf.meshes ?? []) {
      for (const primitiva of malla.primitives) {
        // Solo triángulos sueltos (modo 4, el de omisión): es lo que exporta Blender.
        if ((primitiva.mode ?? 4) !== 4) continue
        const indice = primitiva.indices ?? primitiva.attributes.POSITION
        total += (gltf.accessors?.[indice]?.count ?? 0) / 3
      }
    }
    return total > 0 ? Math.round(total) : undefined
  } catch {
    // El número es informativo. Si el archivo está mal, quien lo dice con
    // propiedad es `validarModelo3D`, unas líneas más abajo.
    return undefined
  }
}

async function principal() {
  const argumentos = process.argv.slice(2)
  const aplicar = argumentos.includes('--aplicar')
  const carpeta = argumentos.find((a) => !a.startsWith('--'))
  if (!carpeta || !existsSync(carpeta) || !statSync(carpeta).isDirectory()) {
    console.error('Uso: npx tsx scripts/cargar-modelos.ts <carpeta> [--aplicar]')
    process.exit(2)
  }

  const archivos = readdirSync(carpeta)
    .filter((n) => n.toLowerCase().endsWith('.glb'))
    .sort()
  if (archivos.length === 0) {
    console.error(`No hay ningún .glb en ${carpeta}.`)
    process.exit(2)
  }

  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })

  const creados: string[] = []
  const yaEstaban: string[] = []
  const fallidos: { archivo: string; motivo: string }[] = []

  for (const archivo of archivos) {
    const nombre = nombreDe(archivo)
    const ruta = join(carpeta, archivo)
    const contenido = readFileSync(ruta)
    const megas = (contenido.byteLength / 1048576).toFixed(2)

    const previo = await payload.find({
      collection: 'modelos-3d',
      where: { nombre: { equals: nombre } },
      limit: 1,
      depth: 0,
    })
    if (previo.docs.length > 0) {
      yaEstaban.push(nombre)
      console.log(`  ya estaba   ${nombre}`)
      continue
    }

    if (!aplicar) {
      console.log(`  se cargaría ${nombre}  (${megas} MB)`)
      continue
    }

    try {
      const doc = await payload.create({
        collection: 'modelos-3d',
        data: {
          nombre,
          origen: 'sintetico',
          // Verdadero sin reservas: es un atlas de referencia, no un estudio.
          anonimizado: true,
          triangulos: contarTriangulos(contenido),
          notas: NOTAS,
        },
        file: {
          data: contenido,
          mimetype: 'model/gltf-binary',
          name: archivo,
          size: contenido.byteLength,
        },
      })
      creados.push(nombre)
      console.log(`  cargado     ${nombre}  →  ${doc.filename}  (${megas} MB)`)
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error)
      fallidos.push({ archivo, motivo })
      console.log(`  RECHAZADO   ${archivo}  (${megas} MB): ${motivo}`)
    }
  }

  console.log()
  console.log(
    aplicar
      ? `Cargados ${creados.length}, ya estaban ${yaEstaban.length}, rechazados ${fallidos.length}.`
      : `Simulación: ${archivos.length - yaEstaban.length} por cargar, ${yaEstaban.length} ya estaban. Repita con --aplicar.`,
  )
  process.exit(fallidos.length > 0 ? 1 : 0)
}

principal().catch((error) => {
  console.error(error)
  process.exit(1)
})
