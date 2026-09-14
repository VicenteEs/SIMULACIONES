import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Quién entra a cada pantalla del panel, comprobado llamando a las pantallas.
 *
 * El panel tiene dos niveles (D-051): el editor entra a «Trabajo» —resumen,
 * contenido, taller del atlas y comentarios— y el administrador además a
 * cuentas, respaldos, sistema, estadísticas y actividad. Un lector no entra a
 * ninguna.
 *
 * La barra lateral ya esconde los enlaces según el rol, y eso no protege nada:
 * una ruta escondida se escribe a mano. Lo que protege es la primera línea de
 * cada `page.tsx`, y lo que se prueba aquí es esa línea **ejecutándose**: se
 * importa cada página, se la llama con cada sesión y se mira si redirige y si
 * llegó a consultar algo antes de hacerlo. Leer el texto buscando
 * `exigirPanel('admin')` aprobaría una página que la llama después de leer las
 * cuentas, o que la llama sin el nivel.
 *
 * Las páginas se descubren del disco. Una pantalla nueva sin nivel declarado en
 * `NIVEL_DE_PAGINA` hace fallar la prueba.
 */

class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirige a ${destino}`)
  }
}

const { estado, llamadas } = vi.hoisted(() => ({
  estado: { sesion: null as unknown },
  llamadas: [] as string[],
}))

vi.mock('@/lib/sesion', () => ({ obtenerSesion: async () => estado.sesion }))

vi.mock('next/navigation', async (original) => ({
  ...((await original()) as object),
  // Lanzan, como las de Next: nada de lo que va detrás en la página corre.
  redirect: (destino: string) => {
    throw new Redireccion(destino)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('payload', async (original) => {
  const instancia = new Proxy(
    {},
    {
      get: (_objetivo, propiedad) => {
        if (propiedad === 'then') return undefined
        if (propiedad === 'logger') return { error() {}, warn() {}, info() {} }
        if (propiedad === 'config') return { collections: [] }
        return async () => {
          if (propiedad === 'auth') return { user: (estado.sesion as { usuario?: unknown })?.usuario ?? null }
          llamadas.push(String(propiedad))
          return { docs: [], totalDocs: 0, page: 1, totalPages: 1 }
        }
      },
    },
  )
  return { ...((await original()) as object), getPayload: async () => instancia }
})

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ set() {}, delete() {}, get: () => undefined }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/respaldosServidor', () => ({
  directorioDeRespaldos: () => {
    llamadas.push('directorioDeRespaldos')
    return '/respaldos'
  },
  hayPgDump: async () => {
    llamadas.push('hayPgDump')
    return false
  },
  listarRespaldos: async () => {
    llamadas.push('listarRespaldos')
    return []
  },
  rutaDeRespaldo: (nombre: string) => {
    llamadas.push('rutaDeRespaldo')
    return `/respaldos/${nombre}`
  },
}))

import { exigirPanel, exigirPanelPara } from '@/app/(frontend)/admin-panel/acceso'

// ----------------------------------------------------------------- sesiones

const cuenta = (id: number, rol: string, activo: boolean, extra: Record<string, unknown> = {}) => ({
  id,
  rol,
  activo,
  ...extra,
})

const sesionDe = (usuario: Record<string, unknown> | null, rolEfectivo?: string) => ({
  usuario,
  activo: usuario?.activo === true,
  rolReal: (usuario?.rol as string) ?? null,
  rol: rolEfectivo ?? (usuario?.rol as string) ?? null,
  simulando: Boolean(rolEfectivo && rolEfectivo !== usuario?.rol),
  usuarioEfectivo: usuario ? { ...usuario, rol: rolEfectivo ?? usuario.rol } : null,
})

const SESIONES = {
  anonimo: sesionDe(null),
  desactivado: sesionDe(cuenta(2, 'admin', false)),
  lector: sesionDe(cuenta(3, 'lector', true)),
  // Una vista previa no concede el rol que simula: la guardia mira el real.
  lectorComoAdmin: { ...sesionDe(cuenta(3, 'lector', true)), rol: 'admin' },
  editor: sesionDe(cuenta(4, 'editor', true)),
  admin: sesionDe(cuenta(1, 'admin', true)),
  // Y tampoco lo quita: el administrador que mira «como residente» sigue
  // entrando a su panel.
  adminComoResidente: sesionDe(cuenta(1, 'admin', true), 'lector'),
} as const
type NombreDeSesion = keyof typeof SESIONES

type Nivel = 'editor' | 'admin' | 'modulo'

const ENTRA: Record<Nivel, Record<NombreDeSesion, boolean>> = {
  admin: { anonimo: false, desactivado: false, lector: false, lectorComoAdmin: false, editor: false, admin: true, adminComoResidente: true },
  editor: { anonimo: false, desactivado: false, lector: false, lectorComoAdmin: false, editor: true, admin: true, adminComoResidente: true },
  modulo: { anonimo: false, desactivado: false, lector: false, lectorComoAdmin: false, editor: true, admin: true, adminComoResidente: true },
}

/**
 * El nivel de cada pantalla, por su ruta dentro de `admin-panel`.
 *
 * `modulo` es `exigirPanelPara(coleccion)`: editor, y además con permiso sobre
 * la colección que viene en la dirección.
 */
const NIVEL_DE_PAGINA: Record<string, Nivel> = {
  'page.tsx': 'editor',
  'contenido/page.tsx': 'editor',
  'contenido/[coleccion]/page.tsx': 'modulo',
  'contenido/[coleccion]/nuevo/page.tsx': 'modulo',
  'contenido/[coleccion]/[id]/page.tsx': 'modulo',
  'atlas/page.tsx': 'editor',
  'comentarios/page.tsx': 'editor',
  'usuarios/page.tsx': 'admin',
  'difusion/page.tsx': 'admin',
  'respaldos/page.tsx': 'admin',
  'sistema/page.tsx': 'admin',
  'estadisticas/page.tsx': 'admin',
  'actividad/page.tsx': 'admin',
}

// ------------------------------------------------------------ descubrimiento

const RAIZ = resolve(process.cwd(), 'src/app/(frontend)/admin-panel')

function paginasBajo(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre)
    if (statSync(ruta).isDirectory()) return paginasBajo(ruta)
    return nombre === 'page.tsx' ? [relative(RAIZ, ruta).split('\\').join('/')] : []
  })
}

const PAGINAS = paginasBajo(RAIZ).sort()

type Pagina = (props: unknown) => Promise<unknown>
const COMPONENTE: Record<string, Pagina> = {}
for (const pagina of PAGINAS) {
  COMPONENTE[pagina] = ((await import(resolve(RAIZ, pagina))) as { default: Pagina }).default
}

/** Los parámetros de ruta con los que se llama a una página de colección. */
const propiedades = (coleccion: string) => ({
  params: Promise.resolve({ coleccion, id: '5' }),
  searchParams: Promise.resolve({}),
})

/** Llama a la página y resume qué pasó: a dónde redirigió y qué consultó. */
async function visitar(pagina: string, sesion: unknown, coleccion = 'cirugias') {
  estado.sesion = sesion
  llamadas.length = 0
  let destino: string | null = null
  try {
    await COMPONENTE[pagina](propiedades(coleccion))
  } catch (error) {
    if (error instanceof Redireccion) destino = error.destino
    // Cualquier otro fallo es de los dobles —una página que pasó la guardia y
    // se encontró una base vacía—, no de la guardia.
  }
  return { destino, consultado: [...llamadas] }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// -------------------------------------------------------------------- pruebas

describe('las pantallas del panel', () => {
  it('toda página tiene nivel declarado', () => {
    expect(
      PAGINAS.filter((p) => !NIVEL_DE_PAGINA[p]),
      'pantallas del panel sin nivel en tests/unit/panelPorRol.test.ts',
    ).toEqual([])
    expect(Object.keys(NIVEL_DE_PAGINA).filter((p) => !PAGINAS.includes(p))).toEqual([])
  })

  it('las pantallas de cuentas, respaldos y sistema son de administrador, no de editor', () => {
    // Fijado aparte de la tabla: bajar una de estas a `editor` en la tabla
    // pondría la matriz de abajo en verde con la pantalla abierta.
    for (const pagina of ['usuarios/page.tsx', 'respaldos/page.tsx', 'sistema/page.tsx', 'estadisticas/page.tsx', 'actividad/page.tsx']) {
      expect(NIVEL_DE_PAGINA[pagina], pagina).toBe('admin')
    }
  })
})

describe.each(PAGINAS.filter((p) => NIVEL_DE_PAGINA[p]))('%s', (pagina) => {
  const nivel = NIVEL_DE_PAGINA[pagina]

  it.each(Object.keys(SESIONES) as NombreDeSesion[])('con la sesión «%s»', async (nombre) => {
    const { destino, consultado } = await visitar(pagina, SESIONES[nombre])
    if (ENTRA[nivel][nombre]) {
      expect(destino, `${pagina} echó a «${nombre}», que sí entra`).not.toBe('/')
    } else {
      expect(destino, `${pagina} dejó entrar a «${nombre}»`).toBe('/')
      expect(consultado, `${pagina} consultó ${consultado.join(', ')} antes de echar a «${nombre}»`).toEqual([])
    }
  })

  if (nivel === 'modulo') {
    it('un editor restringido a otro módulo vuelve a Contenido sin consultar nada', async () => {
      const restringido = sesionDe(cuenta(6, 'editor', true, { modulosEditables: ['patologias'] }))
      const ajeno = await visitar(pagina, restringido, 'cirugias')
      expect(ajeno.destino).toBe('/admin-panel/contenido')
      expect(ajeno.consultado).toEqual([])
      const propio = await visitar(pagina, restringido, 'patologias')
      expect(propio.destino, 'el editor restringido no entra a su propio módulo').toBeNull()
    })

    it('un editor que no ve el módulo vuelve a Contenido aunque sus editables estén vacíos', async () => {
      const sinVer = sesionDe(cuenta(8, 'editor', true, { modulosVisibles: ['patologias'], modulosEditables: [] }))
      const ajeno = await visitar(pagina, sinVer, 'cirugias')
      expect(ajeno.destino, 'abrió en el panel un módulo que no puede ver').toBe('/admin-panel/contenido')
      expect(ajeno.consultado).toEqual([])
      const propio = await visitar(pagina, sinVer, 'patologias')
      expect(propio.destino, 'no entra al módulo que sí ve').toBeNull()
    })
  }
})

describe('la guardia del panel', () => {
  const llamar = async (sesion: unknown, nivel?: 'editor' | 'admin') => {
    estado.sesion = sesion
    return exigirPanel(nivel).then(
      () => null,
      (e: unknown) => (e instanceof Redireccion ? e.destino : e),
    )
  }

  it('no deja pasar a un lector, ni pidiendo nivel de editor ni de administrador', async () => {
    expect(await llamar(SESIONES.lector)).toBe('/')
    expect(await llamar(SESIONES.lector, 'admin')).toBe('/')
  })

  it('el editor pasa el nivel de editor y no el de administrador', async () => {
    expect(await llamar(SESIONES.editor, 'editor')).toBeNull()
    expect(await llamar(SESIONES.editor, 'admin')).toBe('/')
  })

  it('una cuenta desactivada no pasa aunque sea administradora', async () => {
    expect(await llamar(SESIONES.desactivado, 'editor')).toBe('/')
  })

  it('un rol desconocido no cuenta como editor', async () => {
    expect(await llamar(sesionDe(cuenta(9, 'invitado', true)))).toBe('/')
  })

  it('exigirPanelPara aplica el módulo solo a los módulos, y al administrador no lo restringe', async () => {
    estado.sesion = sesionDe(cuenta(6, 'editor', true, { modulosEditables: ['patologias'] }))
    await expect(exigirPanelPara('cirugias')).rejects.toThrow(/admin-panel\/contenido/)
    // El material de apoyo no se reparte por módulos (ver `puedeEditar`).
    await expect(exigirPanelPara('medios')).resolves.toBeTruthy()
    estado.sesion = sesionDe(cuenta(1, 'admin', true, { modulosEditables: ['patologias'] }))
    await expect(exigirPanelPara('cirugias')).resolves.toBeTruthy()
  })

  it('exigirPanelPara también cierra el módulo que la cuenta no ve, y su vocabulario', async () => {
    // Editables vacíos («todos») y la lectura restringida: la restricción
    // tiene que salir de `modulosVisibles`. Los catálogos del simulador cuelgan
    // de cirugías, así que se cierran con ella; el material de apoyo no.
    estado.sesion = sesionDe(cuenta(8, 'editor', true, { modulosVisibles: ['patologias'], modulosEditables: [] }))
    await expect(exigirPanelPara('cirugias')).rejects.toThrow(/admin-panel\/contenido/)
    await expect(exigirPanelPara('instrumental')).rejects.toThrow(/admin-panel\/contenido/)
    await expect(exigirPanelPara('patologias')).resolves.toBeTruthy()
    await expect(exigirPanelPara('medios')).resolves.toBeTruthy()
  })
})

describe('la descarga de un respaldo', () => {
  /**
   * No es una pantalla, pero es la mitad de la de respaldos que más importa: el
   * archivo es la base entera, con los correos y las contraseñas cifradas. Se
   * baja por `api/respaldos/[archivo]`, que no pasa por `exigirPanel`.
   */
  const descargar = async (sesion: unknown) => {
    estado.sesion = sesion
    llamadas.length = 0
    const { GET } = await import('@/app/(frontend)/api/respaldos/[archivo]/route')
    const respuesta = await GET(new Request('http://localhost/api/respaldos/x'), {
      params: Promise.resolve({ archivo: 'base-20260101-000000.sql.gz' }),
    })
    return { estado: respuesta.status, consultado: [...llamadas] }
  }

  it.each(['anonimo', 'desactivado', 'lector', 'editor'] as NombreDeSesion[])(
    'la sesión «%s» no llega a buscar el archivo',
    async (nombre) => {
      const { estado: codigo, consultado } = await descargar(SESIONES[nombre])
      expect(codigo).toBe(401)
      expect(consultado).toEqual([])
    },
  )

  it('el administrador sí llega a buscarlo', async () => {
    const { consultado } = await descargar(SESIONES.admin)
    expect(consultado).toContain('rutaDeRespaldo')
  })
})
