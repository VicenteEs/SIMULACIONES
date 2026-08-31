/**
 * Genera un enlace para que el titular de una cuenta elija una contraseña nueva.
 *
 * No fija ninguna contraseña ni la muestra: solo emite el testigo de
 * restablecimiento que Payload enviaría por correo si hubiera un servidor SMTP
 * configurado. Quien recibe el enlace es quien elige la clave.
 *
 *   npx tsx scripts/restablecer-clave.ts correo@ejemplo.cl
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const archivoEnv = resolve(process.cwd(), '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

async function main() {
  const correo = process.argv[2]
  if (!correo) {
    console.error('Uso: npx tsx scripts/restablecer-clave.ts <correo>')
    process.exit(1)
  }

  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  const payload = await getPayload({ config })

  const testigo = await payload.forgotPassword({
    collection: 'usuarios',
    data: { email: correo },
    // El correo no se envía: interesa el testigo para construir el enlace a mano.
    disableEmail: true,
  })

  const base = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
  console.log('')
  console.log('Abra este enlace y elija una contraseña nueva:')
  console.log('')
  console.log(`  ${base}/admin/reset/${testigo}`)
  console.log('')
  console.log('Caduca en una hora y sirve una sola vez.')
  process.exit(0)
}

main().catch((e: unknown) => {
  console.error('Fallo:', e instanceof Error ? e.message : e)
  process.exit(1)
})
