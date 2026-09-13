import { describe, it, expect } from 'vitest'
import { CATALOGOS_DEL_SIMULADOR } from '@/collections/catalogos'

/**
 * Los cinco catálogos son vocabulario del módulo 04 y de nadie más.
 *
 * Se escribían con `escrituraDeContenido`, que solo mira el rol, mientras D-057
 * prometía «los mismos permisos por módulo» que el resto del contenido. Un
 * editor apartado del simulador borraba un instrumento, y borrar uno deja a
 * nulo el campo `instrumento` de cada paso que lo pedía: ese paso no se puede
 * superar y el caso se queda sin salida.
 *
 * La lectura no se toca y esto también hay que atarlo: el residente necesita
 * ver el nombre del instrumento que elige de la bandeja.
 */

const peticion = (usuario: unknown) => ({ req: { user: usuario } }) as never

const admin = { id: 1, rol: 'admin', activo: true }
const editorDelSimulador = { id: 2, rol: 'editor', activo: true, modulosEditables: ['cirugias'] }
const editorDeOtroModulo = { id: 3, rol: 'editor', activo: true, modulosEditables: ['maniobras'] }
const editorSinRestringir = { id: 4, rol: 'editor', activo: true }
const lector = { id: 5, rol: 'lector', activo: true }

const ESCRITURAS = ['create', 'update', 'delete'] as const

describe('los catálogos del simulador se escriben con los permisos del módulo 04', () => {
  it('un editor apartado del simulador no los toca', async () => {
    for (const coleccion of CATALOGOS_DEL_SIMULADOR) {
      for (const operacion of ESCRITURAS) {
        const permitido = await coleccion.access![operacion]!(peticion(editorDeOtroModulo))
        expect(permitido, `${coleccion.slug}: ${operacion} desde otro módulo`).toBe(false)
      }
    }
  })

  it('quien edita el simulador sí los mantiene', async () => {
    for (const coleccion of CATALOGOS_DEL_SIMULADOR) {
      for (const operacion of ESCRITURAS) {
        expect(
          await coleccion.access![operacion]!(peticion(editorDelSimulador)),
          `${coleccion.slug}: ${operacion}`,
        ).toBe(true)
      }
    }
  })

  it('el caso normal no cambia: sin módulos marcados, el editor escribe todo', async () => {
    // Una lista vacía o ausente significa «sin restricción». Restringir es un
    // acto deliberado, y esto evita el fallo más probable: dar de alta a un
    // editor, olvidar marcarle módulos y que no pueda con nada.
    for (const coleccion of CATALOGOS_DEL_SIMULADOR) {
      expect(await coleccion.access!.create!(peticion(editorSinRestringir)), coleccion.slug).toBe(true)
      expect(await coleccion.access!.create!(peticion(admin)), coleccion.slug).toBe(true)
    }
  })

  it('un lector no escribe y nadie escribe sin sesión', async () => {
    for (const coleccion of CATALOGOS_DEL_SIMULADOR) {
      for (const operacion of ESCRITURAS) {
        expect(await coleccion.access![operacion]!(peticion(lector)), coleccion.slug).toBe(false)
        expect(await coleccion.access![operacion]!(peticion(null)), coleccion.slug).toBe(false)
      }
    }
  })

  it('la lectura sigue abierta a cualquier cuenta activa: la bandeja se ve desde la consola', async () => {
    for (const coleccion of CATALOGOS_DEL_SIMULADOR) {
      expect(await coleccion.access!.read!(peticion(lector)), coleccion.slug).toBe(true)
      expect(await coleccion.access!.read!(peticion(null)), coleccion.slug).toBe(false)
    }
  })
})
