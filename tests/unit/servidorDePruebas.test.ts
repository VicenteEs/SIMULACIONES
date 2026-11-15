import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { servidorDePruebas } from '@/lib/servidorDePruebas'
import { AvisoDeServidorDePruebas } from '@/components/AvisoDeServidorDePruebas'

/**
 * La franja del servidor de pruebas (D-385).
 *
 * ved y `traumahub.cl` tienen las mismas cuentas y el mismo contenido (D-384),
 * y lo que se escribe en ved no llega a producción. Lo que se prueba es que la
 * franja salga donde la variable está puesta, en todas las pantallas y antes
 * de entrar, y que no salga donde no está: en producción diría lo contrario de
 * la verdad.
 *
 * Los dobles de la plantilla son los de `autoria.test.ts`, por lo mismo: la
 * barra, el aviso de actualización y la pantalla del aviso de privacidad piden
 * la base, el navegador o el enrutador de Next.
 */

const { sesionActual } = vi.hoisted(() => ({ sesionActual: { activo: false } }))
vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: sesionActual.activo ? { nombre: 'Residente', versionDelAvisoDePrivacidad: null } : null,
    activo: sesionActual.activo,
    rolReal: sesionActual.activo ? 'lector' : null,
    rol: sesionActual.activo ? 'lector' : null,
    simulando: false,
    usuarioEfectivo: null,
  }),
}))
vi.mock('@/components/Navegacion', () => ({ Navegacion: () => null }))
vi.mock('@/components/AvisoActualizacion', () => ({ AvisoActualizacion: () => null }))
vi.mock('@/components/privacidad/PantallaDelAviso', () => ({ PantallaDelAviso: () => 'pantalla-del-aviso' }))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('servidorDePruebas', () => {
  it('sin la variable, o apagada, no es de pruebas', () => {
    for (const valor of [undefined, '', '   ', '0', 'no', 'NO', 'false', 'False']) {
      expect(servidorDePruebas(valor), JSON.stringify(valor)).toBeNull()
    }
  })

  it('con una dirección https, lleva a su origen', () => {
    expect(servidorDePruebas('https://traumahub.cl')).toEqual({ produccion: 'https://traumahub.cl' })
    expect(servidorDePruebas('  https://traumahub.cl/  ')).toEqual({ produccion: 'https://traumahub.cl' })
    // Una ruta llevaría a una página que mañana puede no existir.
    expect(servidorDePruebas('https://traumahub.cl/entrar?x=1')).toEqual({ produccion: 'https://traumahub.cl' })
  })

  it('con cualquier otro valor, es de pruebas pero sin enlace', () => {
    // Alguien quiso marcar el servidor: un valor raro no debe callar la franja.
    for (const valor of ['1', 'si', 'pruebas', 'traumahub.cl', 'http://traumahub.cl', 'javascript:alert(1)']) {
      expect(servidorDePruebas(valor), valor).toEqual({ produccion: null })
    }
  })
})

describe('la franja', () => {
  it('dice dónde se está y lleva a producción', () => {
    const html = renderToStaticMarkup(AvisoDeServidorDePruebas({ produccion: 'https://traumahub.cl' }))
    expect(html).toContain('class="aviso-de-pruebas"')
    expect(html).toContain('Servidor de pruebas.')
    expect(html).toContain('no llega a la plataforma')
    expect(html).toContain('<a href="https://traumahub.cl">traumahub.cl</a>')
  })

  it('sin dirección, avisa igual y no inventa un enlace', () => {
    const html = renderToStaticMarkup(AvisoDeServidorDePruebas({ produccion: null }))
    expect(html).toContain('Servidor de pruebas.')
    expect(html).not.toContain('<a ')
  })
})

describe('la plantilla de la plataforma', () => {
  // Se importa una vez y con margen: la primera importación arrastra todo el
  // árbol de componentes, y con la suite entera en marcha pasó de los 5 s de
  // una prueba (la misma razón por la que `autoria` vencía bajo carga). Dentro
  // de cada prueba, el tiempo era el de la importación y no el de la plantilla.
  let plantilla: typeof import('@/app/(frontend)/layout')
  beforeAll(async () => {
    plantilla = await import('@/app/(frontend)/layout')
  }, 60_000)

  const pintar = async () => renderToStaticMarkup((await plantilla.default({ children: 'contenido' })) as ReactElement)

  for (const activo of [false, true]) {
    const como = activo ? 'con sesión y el aviso de privacidad por aceptar' : 'sin sesión, en /entrar'
    it(`pinta la franja lo primero, ${como}`, async () => {
      sesionActual.activo = activo
      vi.stubEnv('SERVIDOR_DE_PRUEBAS', 'https://traumahub.cl')
      const html = await pintar()
      // Lo primero dentro de <body>: antes de la barra, del aviso y de la página.
      expect(html).toMatch(/<body[^>]*><div class="aviso-de-pruebas"/)
    })
  }

  it('no la pinta en producción', async () => {
    sesionActual.activo = false
    vi.stubEnv('SERVIDOR_DE_PRUEBAS', '')
    const html = await pintar()
    expect(html).not.toContain('aviso-de-pruebas')
    expect(html).toContain('contenido')
  })

  it('antepone «[Pruebas]» al título de cada pestaña solo en el servidor de pruebas', async () => {
    const { generateMetadata } = plantilla

    vi.stubEnv('SERVIDOR_DE_PRUEBAS', 'https://traumahub.cl')
    expect((await generateMetadata()).title).toEqual({
      default: '[Pruebas] Plataforma docente de traumatología',
      template: '[Pruebas] %s',
    })

    vi.stubEnv('SERVIDOR_DE_PRUEBAS', '')
    const enProduccion = await generateMetadata()
    expect(enProduccion.title).toBe('Plataforma docente de traumatología')
    // Lo demás no cambia con la variable: sigue sin indexarse (D-020).
    expect(enProduccion.robots).toEqual({ index: false, follow: false })
  })
})

describe('el contenedor recibe la variable', () => {
  /**
   * El contenedor solo ve las variables que nombra el override: ponerla en el
   * `.env` sin esta línea no haría nada, y la franja no saldría en ved sin que
   * nada fallara. Ya pasó con `SMTP_NOMBRE` y `DIFUSION_CORREOS_POR_HORA`.
   */
  it('la plantilla del override la pasa a la app', () => {
    const plantilla = readFileSync(join(process.cwd(), 'despliegue', 'paginas', 'docker-compose.override.yml'), 'utf8')
    expect(plantilla).toMatch(/^\s+SERVIDOR_DE_PRUEBAS: \$\{SERVIDOR_DE_PRUEBAS:-\}\s*$/m)
  })

  it('la hoja la esconde al imprimir, para que no salga en los PDF de ved', () => {
    // La hoja tiene varios `@media print`. El que importa es el que esconde la
    // barra y el pie en papel, y se reconoce por el principio de su lista.
    const hoja = readFileSync(join(process.cwd(), 'src', 'app', '(frontend)', 'estilos.css'), 'utf8')
    const inicio = hoja.indexOf('nav, .barra, .miga')
    expect(inicio).toBeGreaterThan(hoja.indexOf('@media print'))
    const llave = hoja.indexOf('{', inicio)
    expect(hoja.slice(inicio, llave)).toContain('.aviso-de-pruebas')
    expect(hoja.slice(llave, hoja.indexOf('}', llave))).toContain('display: none')
  })
})
