/**
 * Preparación del entorno de pruebas.
 *
 * Next.js carga `.env` por su cuenta, pero Vitest no. Sin esto,
 * `DATABASE_URI` y `PAYLOAD_SECRET` no existen y las pruebas de integración se
 * omiten en silencio aunque la base esté levantada.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const archivo = resolve(process.cwd(), '.env')
if (existsSync(archivo)) {
  process.loadEnvFile(archivo)
}
