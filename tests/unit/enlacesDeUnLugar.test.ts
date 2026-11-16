import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { destinoDelLugar, LUGAR_DE_LA_CENTRAL } from '@/lib/anfitrion'
import { direccionDelLugar, direccionPublica, enlaceDeClave } from '@/collections/Usuarios'
import { NOMBRES_RESERVADOS } from '@/lib/instituciones'

/**
 * Los enlaces que llevan a un lugar, en Contabo y en ved (P-016 E5.10, D-405).
 *
 * En Contabo cada institución tiene su subdominio. En ved no hay subdominios, y
 * el enlace pasa por `/lugar/<subdominio>/…`, que fija la cookie del selector y
 * sigue a la ruta. Lo que se cuida: que en Contabo no cambie nada, que en ved
 * también la central tenga su enlace, y que lo que sigue a `/lugar` no pueda
 * sacar a nadie de la plataforma.
 */

const antes = { direccion: process.env.NEXT_PUBLIC_SERVER_URL, pruebas: process.env.SERVIDOR_DE_PRUEBAS }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SERVER_URL = 'https://traumahub.cl/'
  delete process.env.SERVIDOR_DE_PRUEBAS
})

afterEach(() => {
  for (const [nombre, valor] of [
    ['NEXT_PUBLIC_SERVER_URL', antes.direccion],
    ['SERVIDOR_DE_PRUEBAS', antes.pruebas],
  ] as const) {
    if (valor === undefined) delete process.env[nombre]
    else process.env[nombre] = valor
  }
})

describe('la dirección de un lugar', () => {
  it('en Contabo, el subdominio de la institución, y la central a secas', () => {
    expect(direccionDelLugar('uchile')).toBe('https://uchile.traumahub.cl')
    expect(direccionDelLugar('')).toBe('https://traumahub.cl')
    expect(enlaceDeClave('t', 'uchile')).toBe('https://uchile.traumahub.cl/clave/t')
    expect(enlaceDeClave('t')).toBe('https://traumahub.cl/clave/t')
  })

  it('en ved, por /lugar, también la central', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.ts.net/traumahub'
    process.env.SERVIDOR_DE_PRUEBAS = 'https://traumahub.cl'
    expect(direccionDelLugar('uchile')).toBe('https://ved.example.ts.net/traumahub/lugar/uchile')
    expect(direccionDelLugar('')).toBe('https://ved.example.ts.net/traumahub/lugar/traumahub')
    expect(enlaceDeClave('t', 'uchile')).toBe('https://ved.example.ts.net/traumahub/lugar/uchile/clave/t')
    // Lo que no lleva a un lugar sigue siendo la dirección a secas: el
    // logotipo de los correos no tiene por qué fijar nada.
    expect(direccionPublica()).toBe('https://ved.example.ts.net/traumahub')
  })

  it('sin dirección pública, nada, ni en ved', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = ''
    expect(direccionDelLugar('uchile')).toBe('')
    process.env.SERVIDOR_DE_PRUEBAS = 'https://traumahub.cl'
    expect(direccionDelLugar('')).toBe('')
  })

  it('el nombre de la central no lo puede tener ninguna institución', () => {
    expect(NOMBRES_RESERVADOS).toContain(LUGAR_DE_LA_CENTRAL)
  })
})

describe('a dónde sigue un enlace de ved', () => {
  it('la ruta que trae, con su consulta', () => {
    expect(destinoDelLugar(['registro'], '?invitacion=abc')).toBe('/registro?invitacion=abc')
    expect(destinoDelLugar(['clave', 'testigo.largo'], '')).toBe('/clave/testigo.largo')
    expect(destinoDelLugar(['admin-panel', 'usuarios'], '?')).toBe('/admin-panel/usuarios')
    expect(destinoDelLugar(undefined, '')).toBe('/')
  })

  it('no sale de la plataforma', () => {
    // Un tramo vacío al principio daría `//otro.sitio`: otro servidor.
    expect(destinoDelLugar(['', 'otro.sitio', 'x'], '')).toBe('/otro.sitio/x')
    // `..` con el prefijo delante saldría a otra página del mismo dominio.
    expect(destinoDelLugar(['..', '..', 'otra'], '')).toBe('/otra')
    expect(destinoDelLugar(['.', 'entrar'], '')).toBe('/entrar')
    // Lo que venga ya decodificado vuelve a ir codificado.
    expect(destinoDelLugar(['a/b', 'c d'], '')).toBe('/a%2Fb/c%20d')
  })
})
