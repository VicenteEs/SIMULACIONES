import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * El portero de las acciones de servidor.
 *
 * `src/lib/guardias.ts` salía al 0 % en el informe de cobertura y no tenía una
 * sola prueba, siendo la pieza por la que pasan las siete acciones del panel.
 * `puedeEditar` es además la única que decide el permiso por módulo en las
 * lecturas del editor genérico —consultan con `overrideAccess: true`, así que
 * Payload no vuelve a preguntarlo— y es pura: se prueba sin base y sin sesión.
 *
 * Lo que sí necesita base —`exigirAdmin`, `exigirEditor`, `exigirEdicionDe`—
 * vive en `tests/unit/accionesDeContenido.test.ts` y en las de integración,
 * ejercitado desde las acciones que lo usan.
 */

// `guardias.ts` arrastra al importarse la configuración entera de Payload y el
// lector de sesión, que lee cookies. Nada de eso interviene en lo que se prueba
// aquí, y sin estos dobles el archivo no se puede ni importar fuera de Next.
vi.mock('payload', () => ({ getPayload: async () => ({}) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({ usuario: null, activo: false, rolReal: null }),
}))

import { ErrorDeAcceso, accion, puedeEditar } from '@/lib/guardias'
import { SLUGS_DE_MODULOS } from '@/collections'
import { CATALOGOS_DEL_SIMULADOR } from '@/collections/catalogos'

const admin = { id: 1, rol: 'admin' }
const editorLibre = { id: 2, rol: 'editor' }
const editorRestringido = { id: 3, rol: 'editor', modulosEditables: ['patologias'] }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('puedeEditar', () => {
  it('el administrador escribe en cualquier módulo, tenga lo que tenga en modulosEditables', () => {
    expect(puedeEditar(admin, 'cirugias')).toBe(true)
    expect(puedeEditar({ ...admin, modulosEditables: ['patologias'] }, 'cirugias')).toBe(true)
  })

  it('una lista vacía o ausente no restringe nada: significa todos', () => {
    expect(puedeEditar(editorLibre, 'cirugias')).toBe(true)
    expect(puedeEditar({ ...editorLibre, modulosEditables: [] }, 'cirugias')).toBe(true)
  })

  it('el editor restringido escribe en el módulo que tiene asignado', () => {
    expect(puedeEditar(editorRestringido, 'patologias')).toBe(true)
  })

  it('y no en el que no tiene', () => {
    expect(puedeEditar(editorRestringido, 'cirugias')).toBe(false)
    expect(puedeEditar(editorRestringido, 'estudios-ia')).toBe(false)
  })

  it('el material de apoyo nunca se restringe: sin él las fichas quedan sin imágenes', () => {
    for (const apoyo of ['medios', 'modelos-3d', 'segmentos']) {
      expect(puedeEditar(editorRestringido, apoyo)).toBe(true)
    }
  })

  it('los catálogos del simulador siguen el permiso del módulo 04', () => {
    // El panel escribe con la API local (`overrideAccess: true` por omisión),
    // de modo que el `escrituraDeModulo('cirugias')` de `catalogos.ts` solo
    // cierra la API REST. La puerta del panel es esta, y sin la tabla de
    // vocabulario un editor apartado del simulador entraba por ella y borraba
    // un instrumento: cada paso que lo pedía se queda con `instrumento` a nulo
    // y sin forma de superarse.
    const editorDeManiobras = { id: 6, rol: 'editor', modulosEditables: ['maniobras'] }
    for (const catalogo of CATALOGOS_DEL_SIMULADOR) {
      expect(puedeEditar(editorDeManiobras, catalogo.slug as string)).toBe(false)
      expect(
        puedeEditar({ id: 7, rol: 'editor', modulosEditables: ['cirugias'] }, catalogo.slug as string),
      ).toBe(true)
      // Y el administrador, y el editor sin restricciones, como siempre.
      expect(puedeEditar(admin, catalogo.slug as string)).toBe(true)
      expect(puedeEditar(editorLibre, catalogo.slug as string)).toBe(true)
    }
  })

  it('un catálogo no se convierte en módulo para el resto de la plataforma', () => {
    // Se restringe con el permiso de `cirugias`, pero no entra en
    // `SLUGS_DE_MODULOS`: si entrara, la barra, la portada y las casillas de
    // permisos de una cuenta nueva enseñarían cinco entradas que no llevan a
    // ninguna parte.
    for (const catalogo of CATALOGOS_DEL_SIMULADOR) {
      expect((SLUGS_DE_MODULOS as readonly string[]).includes(catalogo.slug as string)).toBe(false)
    }
  })

  it('todos los módulos declarados admiten restricción', () => {
    // La lista se toma de `SLUGS_DE_MODULOS` y no se copia en `guardias.ts`.
    // Copiada, un módulo nuevo quedaba fuera del `includes`, ningún permiso se
    // le aplicaba y cualquier editor podía escribirlo: un permiso que falla
    // abriendo no se nota. Esta prueba recorre la lista de verdad para que un
    // módulo nuevo no entre por la puerta de atrás.
    for (const modulo of SLUGS_DE_MODULOS) {
      expect(puedeEditar({ id: 4, rol: 'editor', modulosEditables: [modulo] }, modulo)).toBe(true)
      const otro = SLUGS_DE_MODULOS.find((slug) => slug !== modulo) as string
      expect(puedeEditar({ id: 4, rol: 'editor', modulosEditables: [otro] }, modulo)).toBe(false)
    }
  })

  it('no confunde el rol simulado con el real', () => {
    // `rol` es el campo del documento; la vista previa «ver como residente» no
    // lo toca. Aquí solo se comprueba que la decisión se toma con el rol que
    // trae el usuario y no con ningún otro campo.
    expect(puedeEditar({ id: 5, rol: 'lector', modulosEditables: [] }, 'patologias')).toBe(true)
  })
})

describe('accion', () => {
  it('devuelve los datos de la tarea cuando sale bien', async () => {
    await expect(accion(async () => ({ id: '7' }))).resolves.toEqual({
      exito: true,
      datos: { id: '7' },
    })
  })

  it('convierte un fallo de acceso en mensaje, sin ensuciar el registro', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const respuesta = await accion(async () => {
      throw new ErrorDeAcceso('Acceso denegado: se requiere rol de editor.')
    })
    expect(respuesta).toEqual({ exito: false, mensaje: 'Acceso denegado: se requiere rol de editor.' })
    // Un rechazo esperado no es una avería: registrarlo entierra los de verdad.
    expect(consola).not.toHaveBeenCalled()
  })

  it('un error inesperado sí queda registrado en el servidor', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const respuesta = await accion(async () => {
      throw new Error('la base no responde')
    })
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe('la base no responde')
    expect(consola).toHaveBeenCalled()
  })

  it('lo que no es un Error también llega al panel como mensaje', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const respuesta = await accion(async () => {
      throw 'cadena suelta'
    })
    expect(respuesta).toEqual({ exito: false, mensaje: 'Error inesperado.' })
  })
})
