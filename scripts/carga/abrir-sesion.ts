// Abre la sesión de la cuenta de la prueba de carga (P-016 E4, D-392) con la
// API local de Payload, porque los `POST` de la API por HTTP contestan 403 a
// propósito (`(payload)/api/[...slug]/route.ts`), entrar incluido.
//
// Lee el correo y la clave de /carga/cuenta, que escribe el dueño, y deja la
// sesión en /carga/sesion con permisos 600. No imprime ni la clave ni la sesión.
// Lo lanza `abrir-sesion.sh`; ver `LEEME.md`.
import { chownSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const archivoEnv = resolve(process.cwd(), '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

/**
 * A quién se le dejan los archivos. El contenedor corre como root, y la prueba
 * la corre el usuario dueño de `~/carga`, que sin esto no podría leer la sesión
 * con sus permisos 600. `abrir-sesion.sh` pasa el suyo en `DUENO`.
 */
function dueno(): { uid: number; gid: number } {
  const [uid, gid] = (process.env.DUENO ?? '1001:1001').split(':').map(Number)
  if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error(`DUENO no es «uid:gid»: ${process.env.DUENO}`)
  return { uid, gid }
}

async function principal() {
  const [correo, clave] = readFileSync('/carga/cuenta', 'utf8')
    .split('\n')
    .map((x) => x.replace(/\r$/, ''))
  const { getPayload } = await import('payload')
  const config = (await import('../../src/payload.config')).default
  const payload = await getPayload({ config })
  const { uid, gid } = dueno()
  try {
    const { token, user } = await payload.login({
      collection: 'usuarios',
      data: { email: correo.trim(), password: clave },
    })
    if (!token) throw new Error('sin sesión')
    writeFileSync('/carga/sesion', token, { mode: 0o600 })
    chownSync('/carga/sesion', uid, gid)
    console.log(`Sesión abierta: rol ${(user as { rol?: string }).rol ?? '¿?'}.`)

    // Lo que la prueba va a pedir, buscado con los permisos de la propia cuenta
    // (`overrideAccess: false`): la API por HTTP solo deja bajar archivos.
    const publicado = { _status: { equals: 'published' } } as const
    const lectura = { overrideAccess: false, user, limit: 50 } as const
    const fichas = await payload.find({ collection: 'patologias', where: publicado, depth: 0, ...lectura })
    const casos = await payload.find({ collection: 'cirugias', where: publicado, depth: 1, ...lectura })
    const objetivos = {
      fichas: fichas.docs.map((d) => d.id),
      casos: casos.docs.map((d) => d.id),
      modelos: [
        ...new Set(
          casos.docs
            .map((d) => (typeof d.modelo === 'object' && d.modelo ? (d.modelo as { url?: string | null }).url : null))
            .filter(Boolean),
        ),
      ],
    }
    writeFileSync('/carga/objetivos.json', JSON.stringify(objetivos))
    chownSync('/carga/objetivos.json', uid, gid)
    console.log(
      `Para pedir: ${objetivos.fichas.length} fichas, ${objetivos.casos.length} casos, ${objetivos.modelos.length} modelos.`,
    )
    process.exit(0)
  } catch (fallo) {
    console.log('No se pudo entrar:', fallo instanceof Error ? fallo.message : String(fallo))
    process.exit(2)
  }
}

void principal()
