import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Los modelos del pabellón del simulador, solo con sesión (D-419).
 *
 * Antes estaban en `public/pabellon/` y se bajaban sin cuenta. Aquí se prueba la
 * ruta que ahora los entrega —quién los recibe, qué nombres acepta y qué dice a
 * las cachés— y, sobre todo, que no vuelvan a `public/`: Next sirve un archivo
 * de ahí antes de mirar las rutas, así que uno que reaparezca tapa esta sin
 * ningún error y queda abierto otra vez.
 */

const estado = vi.hoisted(() => ({ usuario: null as Record<string, unknown> | null }))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.usuario?.activo === true,
    rolReal: (estado.usuario?.rol as string) ?? null,
    rol: (estado.usuario?.rol as string) ?? null,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

import { GET } from '@/app/(frontend)/pabellon/[archivo]/route'
import { archivoDelPabellon, CARPETA_DEL_PABELLON, tipoDelArchivoDelPabellon, yaLaTiene } from '@/lib/archivosDelPabellon'

const PUBLICO = resolve(process.cwd(), 'public')

const como = (rol: string | null, activo = true) => {
  estado.usuario = rol ? { id: 1, rol, activo, email: `${rol}@prueba.invalid`, nombre: 'Prueba', institucion: null } : null
}

const pedir = (archivo: string, cabeceras: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/pabellon/${archivo}`, { headers: cabeceras }), { params: Promise.resolve({ archivo }) })

const enLaCarpeta = readdirSync(CARPETA_DEL_PABELLON)

beforeEach(() => {
  estado.usuario = null
})

describe('quién recibe los modelos del pabellón', () => {
  it('nadie sin sesión, y la negativa no se guarda en ninguna caché', async () => {
    for (const archivo of ['colchon.glb', 'sala.glb', 'arsenalera-persona.glb', 'manifiesto.json', 'no-existe.glb']) {
      const respuesta = await pedir(archivo)
      expect(respuesta.status, archivo).toBe(403)
      expect(respuesta.headers.get('Cache-Control')).toBe('no-store')
      expect(respuesta.headers.get('Content-Type')).toMatch(/^text\/plain/)
    }
  })

  it('tampoco una cuenta desactivada', async () => {
    como('lector', false)
    expect((await pedir('colchon.glb')).status).toBe(403)
  })

  it('una cuenta activa recibe el archivo tal cual está en el disco', async () => {
    como('lector')
    for (const archivo of ['manifiesto.json', 'colchon.glb', 'arsenalera-persona.glb']) {
      const respuesta = await pedir(archivo)
      expect(respuesta.status, archivo).toBe(200)
      const cuerpo = Buffer.from(await respuesta.arrayBuffer())
      expect(cuerpo.equals(readFileSync(join(CARPETA_DEL_PABELLON, archivo))), archivo).toBe(true)
      expect(respuesta.headers.get('Content-Length')).toBe(String(cuerpo.length))
    }
  })

  it('con el tipo de cada extensión que pide el simulador', async () => {
    como('editor')
    const tipos: Record<string, string> = {
      'sala.glb': 'model/gltf-binary',
      'relieve-supino.bin': 'application/octet-stream',
      'manifiesto.json': 'application/json; charset=utf-8',
      'tela-relieve.webp': 'image/webp',
    }
    for (const [archivo, tipo] of Object.entries(tipos)) {
      const respuesta = await pedir(archivo)
      expect(respuesta.headers.get('Content-Type'), archivo).toBe(tipo)
      await respuesta.body?.cancel()
    }
  })

  it('solo para el navegador de esa persona, y preguntando cada vez', async () => {
    como('lector')
    const respuesta = await pedir('mesa-quirurgica.glb')
    await respuesta.body?.cancel()
    // `private`: Cloudflare no la guarda para darla a otro. `no-cache`: el
    // navegador sí la guarda, pero pregunta antes de usarla, y esa pregunta
    // vuelve a pasar por la sesión.
    expect(respuesta.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(respuesta.headers.get('Vary')).toBe('Cookie')
    expect(respuesta.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(respuesta.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(respuesta.headers.get('ETag')).toMatch(/^"[A-Za-z0-9_-]{27}"$/)
  })
})

describe('la copia que el navegador ya tiene', () => {
  it('con la misma huella responde 304 sin cuerpo, también si Cloudflare la marcó como débil', async () => {
    como('lector')
    const primera = await pedir('colchon.glb')
    await primera.body?.cancel()
    const huella = primera.headers.get('ETag') as string

    for (const cabecera of [huella, `W/${huella}`, `"otra", ${huella}`, '*']) {
      const respuesta = await pedir('colchon.glb', { 'If-None-Match': cabecera })
      expect(respuesta.status, cabecera).toBe(304)
      expect(respuesta.body, cabecera).toBeNull()
      expect(respuesta.headers.get('ETag')).toBe(huella)
      expect(respuesta.headers.get('Cache-Control')).toBe('private, no-cache')
    }
  })

  it('con otra huella manda el archivo entero', async () => {
    como('lector')
    const respuesta = await pedir('colchon.glb', { 'If-None-Match': '"vieja"' })
    expect(respuesta.status).toBe(200)
    await respuesta.body?.cancel()
  })

  it('sin sesión no responde 304 aunque traiga la huella buena', async () => {
    como('lector')
    const primera = await pedir('colchon.glb')
    await primera.body?.cancel()
    como(null)
    expect((await pedir('colchon.glb', { 'If-None-Match': primera.headers.get('ETag') as string })).status).toBe(403)
  })

  it('la huella es del contenido: dos archivos distintos no la comparten', async () => {
    const a = await archivoDelPabellon('campo-supino.glb')
    const b = await archivoDelPabellon('campo-prono.glb')
    expect(a?.huella).toBeTruthy()
    expect(a?.huella).not.toBe(b?.huella)
    expect((await archivoDelPabellon('campo-supino.glb'))?.huella).toBe(a?.huella)
  })

  it('lee la cabecera como llega', () => {
    expect(yaLaTiene(null, '"a"')).toBe(false)
    expect(yaLaTiene('', '"a"')).toBe(false)
    expect(yaLaTiene('"b"', '"a"')).toBe(false)
    expect(yaLaTiene(' W/"a" ', '"a"')).toBe(true)
    expect(yaLaTiene('"b","a"', '"a"')).toBe(true)
  })
})

describe('qué nombres acepta', () => {
  it('nada fuera de la carpeta ni de otro tipo, aunque exista', async () => {
    como('admin')
    for (const archivo of [
      '../package.json',
      '..%2Fpackage.json',
      '..\\package.json',
      '.env',
      'Colchon.glb',
      'colchon.GLB',
      'colchon.glb.blend',
      'colchon.blend',
      'colchon',
      'no-existe.glb',
      '',
    ]) {
      expect((await pedir(archivo)).status, JSON.stringify(archivo)).toBe(404)
    }
  })

  it('todo lo que hay en la carpeta se puede servir: nada queda ahí sin que el simulador lo alcance', () => {
    expect(enLaCarpeta.length).toBeGreaterThan(0)
    for (const archivo of enLaCarpeta) {
      expect(tipoDelArchivoDelPabellon(archivo), archivo).not.toBeNull()
      expect(statSync(join(CARPETA_DEL_PABELLON, archivo)).isFile(), archivo).toBe(true)
    }
  })

  it('los archivos que el manifiesto nombra están en la carpeta', () => {
    const manifiesto = readFileSync(join(CARPETA_DEL_PABELLON, 'manifiesto.json'), 'utf8')
    const nombrados = [...manifiesto.matchAll(/"([a-z0-9-]+\.(?:glb|bin|webp))"/g)].map((m) => m[1])
    expect(nombrados.length).toBeGreaterThan(0)
    for (const archivo of nombrados) expect(enLaCarpeta, archivo).toContain(archivo)
  })
})

describe('que no vuelvan a public/', () => {
  // Next entrega `public/` a cualquiera y antes que las rutas: un archivo ahí
  // con el mismo nombre taparía la ruta de arriba sin dar ningún error.
  it('no existe public/pabellon', () => {
    expect(existsSync(join(PUBLICO, 'pabellon'))).toBe(false)
  })

  it('no hay un solo modelo .glb en public/', () => {
    const glb: string[] = []
    const recorrer = (carpeta: string) => {
      for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
        const camino = join(carpeta, entrada.name)
        if (entrada.isDirectory()) recorrer(camino)
        else if (/\.(glb|gltf)$/i.test(entrada.name)) glb.push(camino)
      }
    }
    recorrer(PUBLICO)
    expect(glb).toEqual([])
  })
})
