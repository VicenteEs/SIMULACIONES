import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Qué deja pasar y qué corta `guardarDocumento`, el único camino de escritura
 * del editor del panel.
 *
 * Lo que se prueba aquí es la diferencia entre los dos botones (D-011).
 * «Publicar» exige la ficha entera; «Guardar borrador» no exige nada de lo que
 * hay dentro de una fila, de un bloque o de un texto rico, porque una ficha
 * clínica se escribe a lo largo de varios días y lo contrario deja al
 * traumatólogo sin poder guardar lo escrito esa tarde. Payload hace esa misma
 * distinción por su cuenta —salta lo obligatorio cuando escribe con
 * `draft: true`—, así que cuando el servidor la perdía, la perdía solo.
 */

const { estado, crear, actualizar } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null },
  crear: vi.fn(),
  actualizar: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: true,
    rolReal: 'admin',
    rol: 'admin',
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

// Se conserva el resto del módulo y solo se sustituye `getPayload`. Con un
// objeto pelado, `src/collections/Usuarios.ts` se queda sin el `APIError` que
// importa de aquí y el archivo entero deja de cargar —y no siempre: depende de
// qué prueba haya poblado antes la caché de módulos, así que falla en unas
// combinaciones y en otras no, que es la peor forma de fallar—.
vi.mock('payload', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('payload')>()),
  getPayload: async () => ({ create: crear, update: actualizar }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import * as acciones from '@/app/(frontend)/acciones/contenido'

const { guardarDocumento } = acciones

beforeEach(() => {
  crear.mockReset()
  actualizar.mockReset()
  crear.mockResolvedValue({ id: 12 })
  actualizar.mockResolvedValue({ id: 12 })
  estado.usuario = { id: 1, rol: 'admin', activo: true }
  // `accion()` registra en el servidor todo rechazo que no sea de acceso, y
  // aquí los rechazos son lo que se prueba: sin esto, cada caso escupe su
  // excepción en la salida de la suite.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** Una maniobra con lo de la primera pantalla puesto y el cuerpo sin escribir. */
const maniobraAMedias = {
  nombre: 'Lachman',
  segmento: 7,
  evalua: 'Ligamento cruzado anterior',
}

describe('guardar un borrador', () => {
  it('acepta la ficha a medias, que es lo que es un borrador', async () => {
    const respuesta = await guardarDocumento('maniobras', null, maniobraAMedias, false)
    expect(respuesta.exito).toBe(true)
    expect(crear).toHaveBeenCalledTimes(1)
    const datos = crear.mock.calls[0][0].data as Record<string, unknown>
    expect(datos._status).toBe('draft')
  })

  it('sigue avisando de lo que se ve de un vistazo en el primer nivel', async () => {
    const respuesta = await guardarDocumento('maniobras', null, { evalua: 'Algo' }, false)
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('nombre de la maniobra')
    expect(crear).not.toHaveBeenCalled()
  })

  it('acepta también la fila de un caso quirúrgico a medio escribir', async () => {
    const respuesta = await guardarDocumento(
      'cirugias',
      null,
      { nombre: 'Clavo endomedular', piezas: [{ etiqueta: 'Fragmento distal' }] },
      false,
    )
    expect(respuesta.exito).toBe(true)
  })
})

describe('publicar', () => {
  it('la misma maniobra a medias no se publica, y dice qué falta', async () => {
    const respuesta = await guardarDocumento('maniobras', 3, maniobraAMedias, true)
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('técnica')
    expect(actualizar).not.toHaveBeenCalled()
  })

  it('completa, se publica', async () => {
    const conCuerpo = (texto: string) => ({
      root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: texto }] }] },
    })
    const respuesta = await guardarDocumento(
      'maniobras',
      3,
      {
        ...maniobraAMedias,
        tecnica: conCuerpo('Rodilla a 30° de flexión.'),
        positivo: conCuerpo('Desplazamiento anterior sin tope firme.'),
      },
      true,
    )
    expect(respuesta.exito).toBe(true)
    const datos = actualizar.mock.calls[0][0].data as Record<string, unknown>
    expect(datos._status).toBe('published')
  })
})

describe('el contenido que este editor no sabe representar', () => {
  it('no se guarda nada mientras siga ahí, ni siquiera como borrador', async () => {
    // El campo viaja entero aunque nadie lo toque, así que sin esto bastaba
    // corregir una coma en otro campo para borrar la imagen para siempre.
    const respuesta = await guardarDocumento(
      'maniobras',
      3,
      {
        ...maniobraAMedias,
        tecnica: {
          root: { type: 'root', children: [{ type: 'upload', relationTo: 'medios', value: { id: 2 } }] },
        },
      },
      false,
    )
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('imagen')
    expect(actualizar).not.toHaveBeenCalled()
  })
})

describe('las acciones del editor ya no suben archivos', () => {
  it('`subirArchivo` no se exporta: una acción sin pantalla sigue siendo una puerta', () => {
    // Aquí se probaba el techo de peso de `subirArchivo`. Esa acción se retiró
    // cuando la última pantalla que la usaba —el selector de archivo de un
    // bloque— pasó a la ruta de subidas, y sus dos casos se mudaron a
    // `subidaDeVideo.test.ts`, contra la ruta. Lo que queda por vigilar aquí
    // es que no siga exportada: todo lo que exporta un archivo `'use server'`
    // Next lo publica como extremo HTTP, lo llame una pantalla o no, y esta
    // aceptaba un cuerpo del tamaño del límite de las acciones de cualquiera
    // con sesión de editor y escribía en la base.
    expect(Object.keys(acciones)).not.toContain('subirArchivo')
    // Que la importación trae el módulo de verdad, para que lo de arriba no
    // salga verde sobre un objeto vacío.
    expect(typeof acciones.guardarDocumento).toBe('function')
  })
})
