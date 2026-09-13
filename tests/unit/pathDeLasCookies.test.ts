import { afterAll, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * El path de las cookies sale de un solo sitio, y nadie lo vuelve a derivar.
 *
 * `cookieDeVistaPrevia.test.ts` ya comprueba el comportamiento: que la ruta y
 * `salir()` escriben y borran en el mismo path. Esa prueba seguiría pasando con
 * dos copias que hoy coinciden, y el defecto que se vigila aquí es justo ese:
 * que alguien vuelva a escribir `PREFIJO || '/'` en un archivo nuevo —es más
 * corto que buscar el módulo— y el día que una de las copias cambie, el borrado
 * apunte a un path donde no hay nada y la simulación de rol sobreviva a cerrar
 * la sesión.
 */

const RAIZ = process.cwd()
const MODULO = join('src', 'lib', 'pathDeLasCookies.ts')

/** Todos los `.ts` y `.tsx` de `src`, con su ruta relativa a la raíz. */
function archivosDe(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre)
    if (statSync(ruta).isDirectory()) return archivosDe(ruta)
    return /\.tsx?$/.test(nombre) ? [relative(RAIZ, ruta)] : []
  })
}

/**
 * El código sin comentarios. Los de esta casa citan lo que explican —el del
 * módulo nombra la copia que sustituyó—, y sin quitarlos la búsqueda se
 * cumpliría al revés.
 */
const sinComentarios = (ruta: string): string =>
  readFileSync(join(RAIZ, ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

const RUTA_VISTA_PREVIA = join('src', 'app', '(frontend)', 'api', 'vista-previa', 'route.ts')
const ACCION_DE_SESION = join('src', 'app', '(frontend)', 'acciones', 'sesion.ts')

describe('el path de las cookies se declara una vez', () => {
  it('solo el módulo lo deriva del prefijo', () => {
    const derivadores = archivosDe(join(RAIZ, 'src')).filter((ruta) =>
      /PREFIJO \|\| '\/'/.test(sinComentarios(ruta)),
    )
    expect(derivadores.map((r) => r.split(sep).join('/'))).toEqual([
      MODULO.split(sep).join('/'),
    ])
  })

  it('la ruta de vista previa y las acciones de sesión lo importan de ahí', () => {
    for (const archivo of [RUTA_VISTA_PREVIA, ACCION_DE_SESION]) {
      const codigo = sinComentarios(archivo)
      expect(codigo).toContain("import { PATH_DE_LAS_COOKIES } from '@/lib/pathDeLasCookies'")
      // Ni una constante propia con otro nombre, que es como volvería la copia.
      expect(codigo).not.toMatch(/const PATH_[A-Z_]+ =/)
    }
  })

  it('cada escritura y cada borrado de la vista previa lleva ese path', () => {
    // La ruta escribe y borra; `entrar()` y `salir()` borran. Cuatro sitios, y
    // un `delete` sin path usa el de la petición, no el de la escritura.
    const ruta = sinComentarios(RUTA_VISTA_PREVIA)
    const sesion = sinComentarios(ACCION_DE_SESION)
    expect(ruta).toContain(
      'cookies.delete({ name: COOKIE_VISTA_PREVIA, path: PATH_DE_LAS_COOKIES })',
    )
    expect(ruta).toMatch(/cookies\.set\(COOKIE_VISTA_PREVIA,[^)]*path: PATH_DE_LAS_COOKIES/)
    expect(
      sesion.match(/delete\(\{ name: COOKIE_VISTA_PREVIA, path: PATH_DE_LAS_COOKIES \}\)/g) ?? [],
    ).toHaveLength(2)
    expect(sesion).not.toMatch(/COOKIE_VISTA_PREVIA, path: (?!PATH_DE_LAS_COOKIES)/)
  })
})

describe('el valor', () => {
  const prefijoOriginal = process.env.NEXT_PUBLIC_BASE_PATH

  afterAll(() => {
    if (prefijoOriginal === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
    else process.env.NEXT_PUBLIC_BASE_PATH = prefijoOriginal
  })

  // `PREFIJO` se lee una sola vez al cargar `rutas.ts`: cada caso vacía el
  // registro de módulos para que el valor se vuelva a calcular.
  const cargar = async (prefijo: string) => {
    process.env.NEXT_PUBLIC_BASE_PATH = prefijo
    vi.resetModules()
    return (await import('@/lib/pathDeLasCookies')).PATH_DE_LAS_COOKIES
  }

  it('bajo un prefijo, es el prefijo', async () => {
    expect(await cargar('/traumahub')).toBe('/traumahub')
  })

  it('con barra final en la variable, sin ella', async () => {
    // `/traumahub/` casaría igual en el navegador, pero el borrado exige el
    // mismo texto exacto con el que se escribió.
    expect(await cargar('/traumahub/')).toBe('/traumahub')
  })

  it('sin prefijo, la raíz y nunca la cadena vacía', async () => {
    // Un `path: ''` no es la raíz: el navegador lo sustituye por el directorio
    // de la petición, y la cookie de `/api/vista-previa` acabaría en `/api`.
    expect(await cargar('')).toBe('/')
  })
})
