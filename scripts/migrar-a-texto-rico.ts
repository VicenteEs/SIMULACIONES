/**
 * Migración de los campos que pasaron de texto simple a texto con formato.
 *
 * La técnica de una maniobra, el procedimiento de un caso AO y la descripción
 * de cada paso dejaron de ser un área de texto y pasaron a tener formato. En
 * PostgreSQL eso cambia el tipo de la columna, de texto a `jsonb`, y ese cambio
 * **no lo puede hacer el arranque de la aplicación solo**: Postgres se niega a
 * convertir texto a `jsonb` por su cuenta, y con razón —«fractura conminuta» no
 * es un documento JSON—, así que el arranque falla con
 *
 *     ALTER TABLE "casos_ao_pasos" ALTER COLUMN "descripcion" SET DATA TYPE jsonb
 *
 * Este script hace la conversión bien: primero guarda lo escrito, después
 * cambia el tipo de la columna y por último devuelve el contenido ya convertido
 * en párrafos.
 *
 *   npx tsx scripts/migrar-a-texto-rico.ts --revisar   (no toca nada)
 *   npx tsx scripts/migrar-a-texto-rico.ts --migrar
 *
 * Es seguro repetirlo: una columna que ya sea `jsonb` se salta. La copia de lo
 * que había queda en backups/migracion-texto-rico.json por si acaso.
 *
 * Se trabaja con SQL directo y no con la API de Payload a propósito: mientras
 * la columna siga siendo de texto, Payload cree que es un árbol y pedirle que
 * la lea da un error en lugar del contenido que hay que rescatar.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Qué columnas se migran.
 *
 * Cada campo aparece dos o tres veces porque Payload guarda las versiones en
 * tablas paralelas —`_x_v`— y las filas de un arreglo en su propia tabla.
 * Olvidar una dejaría el historial de esa ficha sin poder abrirse.
 */
const CAMPOS: { tabla: string; columnas: string[] }[] = [
  { tabla: 'maniobras', columnas: ['tecnica', 'positivo', 'nota'] },
  { tabla: '_maniobras_v', columnas: ['version_tecnica', 'version_positivo', 'version_nota'] },
  { tabla: 'casos_ao', columnas: ['procedimiento'] },
  { tabla: '_casos_ao_v', columnas: ['version_procedimiento'] },
  { tabla: 'casos_ao_pasos', columnas: ['descripcion', 'nota'] },
  { tabla: '_casos_ao_v_version_pasos', columnas: ['descripcion', 'nota'] },
  { tabla: 'cirugias', columnas: ['resumen'] },
  { tabla: '_cirugias_v', columnas: ['version_resumen'] },
  { tabla: 'cirugias_pasos', columnas: ['descripcion', 'riesgo'] },
  { tabla: '_cirugias_v_version_pasos', columnas: ['descripcion', 'riesgo'] },
]

const RESPALDO = resolve(process.cwd(), 'backups', 'migracion-texto-rico.json')

interface Pool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, string>[]; rowCount: number | null }>
  end: () => Promise<void>
}

async function conectar(): Promise<Pool> {
  const env = resolve(process.cwd(), '.env')
  if (existsSync(env)) process.loadEnvFile(env)
  if (!process.env.DATABASE_URI) throw new Error('Falta DATABASE_URI en .env')

  const { Pool } = await import('pg')
  return new Pool({ connectionString: process.env.DATABASE_URI }) as unknown as Pool
}

/** Tipo actual de la columna, o `null` si la columna no existe. */
async function tipoDeColumna(pool: Pool, tabla: string, columna: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select data_type from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [tabla, columna],
  )
  return rows[0]?.data_type ?? null
}

async function recorrer(pool: Pool, migrar: boolean) {
  const respaldo: { tabla: string; columna: string; id: string; texto: string }[] = []
  let pendientes = 0
  let listas = 0
  let restaurados = 0

  const { textoLlanoALexical } = await import('../src/lib/textoRico')

  for (const { tabla, columnas } of CAMPOS) {
    for (const columna of columnas) {
      const tipo = await tipoDeColumna(pool, tabla, columna)

      if (tipo === null) {
        console.log(`  ·  ${tabla}.${columna} — no existe, se omite`)
        continue
      }
      if (tipo === 'jsonb') {
        listas += 1
        console.log(`  ✓  ${tabla}.${columna} — ya tiene formato`)
        continue
      }

      // 1. Rescatar lo escrito antes de tocar el tipo.
      const { rows } = await pool.query(
        `select id::text as id, ${columna} as texto from ${tabla}
          where ${columna} is not null and ${columna} <> ''`,
      )
      for (const fila of rows) {
        respaldo.push({ tabla, columna, id: fila.id, texto: fila.texto })
      }

      pendientes += 1
      if (!migrar) {
        console.log(`  →  ${tabla}.${columna} — por convertir (${rows.length} con texto)`)
        continue
      }

      // 2. Cambiar el tipo. El `USING NULL` es lo que hace posible el cambio:
      //    lo escrito no es JSON, así que no se puede convertir en el propio
      //    ALTER. Por eso se rescató antes y se devuelve después.
      await pool.query(`ALTER TABLE "${tabla}" ALTER COLUMN "${columna}" DROP DEFAULT`)
      await pool.query(
        `ALTER TABLE "${tabla}" ALTER COLUMN "${columna}" TYPE jsonb USING NULL`,
      )

      // 3. Devolver el contenido, ya convertido en párrafos.
      for (const fila of rows) {
        await pool.query(`update ${tabla} set ${columna} = $1::jsonb where id::text = $2`, [
          JSON.stringify(textoLlanoALexical(fila.texto)),
          fila.id,
        ])
        restaurados += 1
      }

      console.log(`  ✓  ${tabla}.${columna} — convertida, ${rows.length} valor(es) devueltos`)
    }
  }

  if (respaldo.length > 0) {
    mkdirSync(resolve(process.cwd(), 'backups'), { recursive: true })
    writeFileSync(
      RESPALDO,
      JSON.stringify({ fecha: new Date().toISOString(), filas: respaldo }, null, 2),
      'utf8',
    )
    console.log(`\nCopia de lo que había, por si acaso: ${RESPALDO}`)
  }

  console.log()
  if (!migrar) {
    if (pendientes === 0) {
      console.log(`Nada que hacer: las ${listas} columnas ya tienen formato.`)
    } else {
      console.log(`${pendientes} columna(s) por convertir, con ${respaldo.length} valor(es).`)
      console.log('Ejecute:  npx tsx scripts/migrar-a-texto-rico.ts --migrar')
    }
    return
  }

  console.log(
    pendientes === 0
      ? `Nada que migrar: las ${listas} columnas ya tenían formato.`
      : `Listo: ${pendientes} columna(s) convertidas y ${restaurados} valor(es) devueltos.`,
  )
}

async function main() {
  const orden = process.argv[2]
  if (orden !== '--revisar' && orden !== '--migrar') {
    console.log(`Uso:
  npx tsx scripts/migrar-a-texto-rico.ts --revisar    dice qué haría, sin tocar nada
  npx tsx scripts/migrar-a-texto-rico.ts --migrar     lo hace`)
    process.exit(1)
  }

  console.log(orden === '--migrar' ? '\nMigrando:\n' : '\nRevisión (no se toca nada):\n')
  const pool = await conectar()
  try {
    await recorrer(pool, orden === '--migrar')
  } finally {
    await pool.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\nFallo:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
