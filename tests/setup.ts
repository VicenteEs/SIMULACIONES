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

// Ninguna prueba manda correo de verdad (O-062). En el servidor el `.env` es el
// de producción, con las credenciales de cPanel, y las de integración crean
// comentarios: cada uno intentaba avisar a los administradores por el SMTP real
// —60 intentos en una pasada, contra la cuota por hora que comparten todos los
// avisos—. `hayCorreo()` y `payload.config.ts` deciden por esta variable, así
// que vaciarla basta. Va después de cargar el `.env`, que es quien la trae; la
// prueba que necesite un servidor de correo se pone el suyo, falso, como ya
// hacen las de `src/correo`.
process.env.SMTP_HOST = ''
