import { describe, it, expect, afterEach } from 'vitest'
import { sinIdentificadoresDeFila } from '@/admin/depurar'
import { correoDeClaveNueva } from '@/collections/Usuarios'

/**
 * Dos cosas que estaban rotas y que nadie habría notado hasta usarlas.
 *
 * Duplicar una ficha con contenido fallaba siempre, y el correo para elegir
 * contraseña nueva mandaba a otra página del servidor compartido con el
 * testigo dentro. Las dos son de las que solo se descubren el día que hacen
 * falta, así que quedan atadas aquí.
 */

describe('copiar un documento no arrastra identificadores de fila', () => {
  it('quita el `id` de bloques, de filas y de listas anidadas', () => {
    // Cada bloque y cada fila lleva el suyo, y en PostgreSQL es clave primaria:
    // viajando dentro de la copia, Payload rechaza el documento entero con
    // «El siguiente campo es inválido: id».
    const original = {
      nombre: 'Fractura de tibia',
      definicion: [
        { id: '6a91d271ed59794914215fb2', blockType: 'texto', texto: 'algo' },
        {
          id: '6a91d271ed59794914215fb7',
          blockType: 'listaClinica',
          puntos: [
            { id: '6a91d271ed59794914215fb4', punto: 'uno' },
            { id: '6a91d271ed59794914215fb5', punto: 'dos' },
          ],
        },
      ],
    }

    const copia = sinIdentificadoresDeFila(original)
    expect(JSON.stringify(copia)).not.toContain('6a91d271')

    // Y no se lleva nada por delante: el contenido sigue entero.
    expect(copia.nombre).toBe('Fractura de tibia')
    const bloques = copia.definicion as Record<string, unknown>[]
    expect(bloques).toHaveLength(2)
    expect(bloques[0].blockType).toBe('texto')
    expect(bloques[0].texto).toBe('algo')
    expect((bloques[1].puntos as Record<string, unknown>[])[1].punto).toBe('dos')
  })

  it('deja en paz un documento sin bloques', () => {
    const plano = { nombre: 'Segmento', orden: 3, activo: true, nada: null }
    expect(sinIdentificadoresDeFila(plano)).toEqual(plano)
  })
})

describe('el correo de contraseña nueva respeta el prefijo del servidor', () => {
  const original = process.env.NEXT_PUBLIC_SERVER_URL
  afterEach(() => {
    process.env.NEXT_PUBLIC_SERVER_URL = original
  })

  it('apunta a la pantalla propia bajo el prefijo, y no a /admin', () => {
    // En el servidor compartido, un enlace sin `/traumahub` es otra página del
    // mismo dominio, y le llega el testigo de restablecimiento.
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.net:10000/traumahub'
    const html = correoDeClaveNueva('abc123')

    expect(html).toContain('https://ved.example.net:10000/traumahub/clave/abc123')
    expect(html).not.toContain('/admin/reset')
  })

  it('funciona igual en desarrollo, sin prefijo', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3000'
    expect(correoDeClaveNueva('abc123')).toContain('http://localhost:3000/clave/abc123')
  })

  it('no deja una barra doble si la dirección trae barra final', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.net:10000/traumahub/'
    expect(correoDeClaveNueva('abc123')).toContain('/traumahub/clave/abc123')
  })
})
