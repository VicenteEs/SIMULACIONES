import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Las notas internas de una cuenta, de punta a punta.
 *
 * El campo `notas` de `usuarios` existía en la base y en la colección desde la
 * migración inicial, y estaba muerto por los dos extremos: `actualizarUsuario`
 * trabaja con una lista cerrada de campos que no lo incluía, y la pantalla de
 * cuentas no lo pintaba. Un campo así no se nota: compila, se ve en el esquema,
 * y lo que se guarde en él no vuelve nunca.
 *
 * Por eso esta prueba mira los tres eslabones y no dos: la acción que escribe,
 * el marcado que pinta y manda, y `page.tsx`, que es quien arma la lista que
 * recibe la tabla. Cualquiera de los tres que falte deja el campo muerto sin
 * que nada falle, y el que faltaba era el tercero: la acción aceptaba la nota y
 * la pantalla la pintaba, pero el `map` de la página no la copiaba, así que la
 * nota escrita al dar de alta la cuenta no volvía a verse en ninguna pantalla.
 * Dos pruebas verdes sobre los extremos no lo habrían notado nunca.
 *
 * Las tres mitades de pantalla se comprueban leyendo el archivo del disco, como
 * en `tablaUsuarios.test.ts`: el entorno de estas pruebas es `node` y el
 * proyecto no tiene jsdom, así que ni el componente ni la página se pueden
 * montar.
 */

const { estado, crear, actualizar, contar } = vi.hoisted(() => ({
  estado: { rolReal: 'admin' as string },
  crear: vi.fn(),
  actualizar: vi.fn(),
  contar: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: { id: 1, rol: estado.rolReal, activo: true },
    activo: true,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: { id: 1, rol: estado.rolReal, activo: true },
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ create: crear, update: actualizar, count: contar }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { actualizarUsuario, crearUsuario } from '@/app/(frontend)/acciones/admin'

/** Lo que se mandó a escribir en la única llamada a `payload.update`. */
const loEscrito = (): Record<string, unknown> =>
  (actualizar.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data

/** Lo que se mandó a escribir en la única llamada a `payload.create`. */
const loCreado = (): Record<string, unknown> =>
  (crear.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data

/**
 * Campos que ninguna interfaz ofrece, para probar la lista cerrada.
 *
 * El tipo de `datos` no los admite, y esa es justamente la razón del rodeo: el
 * tipo desaparece al compilar y una acción de servidor es un extremo HTTP al
 * que se le puede mandar cualquier cosa.
 */
type DatosDeActualizar = Parameters<typeof actualizarUsuario>[1]

beforeEach(() => {
  estado.rolReal = 'admin'
  crear.mockReset()
  crear.mockResolvedValue({ id: 12 })
  actualizar.mockReset()
  actualizar.mockResolvedValue({ id: 7 })
  contar.mockReset()
  contar.mockResolvedValue({ totalDocs: 2 })
  // `accion()` anota en consola todo fallo que no sea de acceso. Aquí los
  // rechazos son el caso que se prueba, y su registro solo ensucia la salida.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('la nota de una cuenta llega hasta la escritura', () => {
  it('se guarda sin los espacios de los bordes', async () => {
    const respuesta = await actualizarUsuario('7', {
      notas: '  La pidió el jefe de servicio para el internado de julio.  ',
    })

    expect(respuesta.exito).toBe(true)
    expect(loEscrito()).toEqual({
      notas: 'La pidió el jefe de servicio para el internado de julio.',
    })
  })

  it('se borra de verdad al vaciar el cuadro, y no se queda la anterior', async () => {
    // `undefined` no viaja en el cuerpo de la escritura: sin el `?? null` de la
    // acción, Payload dejaría la nota anterior donde estaba y el panel diría
    // «Cuenta actualizada» igualmente.
    const respuesta = await actualizarUsuario('7', { notas: '' })

    expect(respuesta.exito).toBe(true)
    expect(loEscrito()).toEqual({ notas: null })
  })

  it('un cuadro con solo un salto de línea también la borra', async () => {
    // Un textarea que se «vacía» casi nunca queda vacío. Sin recortar antes de
    // validar, esto contestaba «no puede quedar vacío» y la nota seguía ahí.
    const respuesta = await actualizarUsuario('7', { notas: ' \n  ' })

    expect(respuesta.exito).toBe(true)
    expect(loEscrito()).toEqual({ notas: null })
  })

  it('no acepta un texto sin fin', async () => {
    const respuesta = await actualizarUsuario('7', { notas: 'x'.repeat(2001) })

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/2000/)
    expect(actualizar).not.toHaveBeenCalled()
  })

  it('no la toca cuando la llamada no la menciona', async () => {
    // Editar el nombre no puede arrastrar la nota: quien no manda el campo no
    // está pidiendo nada sobre él.
    const respuesta = await actualizarUsuario('7', { nombre: 'Camila Rojas' })

    expect(respuesta.exito).toBe(true)
    expect(Object.keys(loEscrito())).toEqual(['nombre'])
  })
})

describe('la lista de campos que el panel puede modificar sigue cerrada', () => {
  it('ignora lo que no está en ella aunque llegue junto a algo válido', async () => {
    const respuesta = await actualizarUsuario('7', {
      notas: 'Se desactivó al terminar la rotación.',
      // Ninguno de estos tres se toca por aquí: `activo` tiene su propia acción
      // porque hay que contar administradores antes, `ultimoAcceso` es lo que
      // dice si una cuenta sigue en uso, y la contraseña no la fija nadie más
      // que su dueño, con el enlace de un solo uso.
      activo: true,
      ultimoAcceso: '2020-01-01T00:00:00.000Z',
      password: 'la-que-yo-quiera',
    } as DatosDeActualizar)

    expect(respuesta.exito).toBe(true)
    expect(loEscrito()).toEqual({ notas: 'Se desactivó al terminar la rotación.' })
  })

  it('no escribe nada si lo único que llega es un campo ajeno', async () => {
    const respuesta = await actualizarUsuario('7', {
      ultimoAcceso: '2020-01-01T00:00:00.000Z',
    } as DatosDeActualizar)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe('No hay nada que cambiar.')
    expect(actualizar).not.toHaveBeenCalled()
  })
})

describe('quién puede escribir una nota', () => {
  it('el editor no, porque son notas del administrador sobre la cuenta', async () => {
    // No es una restricción nueva: la acción entera exige administrador. Se fija
    // aquí porque el campo guarda por qué se desactivó una cuenta, y eso no lo
    // escribe ni lo lee quien solo redacta contenido.
    estado.rolReal = 'editor'

    const respuesta = await actualizarUsuario('7', { notas: 'Cualquier cosa.' })

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/administrador/)
    expect(actualizar).not.toHaveBeenCalled()
  })
})

describe('la nota al crear la cuenta', () => {
  it('se guarda con la cuenta, que es cuando se sabe quién la pidió', async () => {
    const respuesta = await crearUsuario(
      'Residente@Hospital.cl',
      'Camila Rojas',
      'contrasena-larguisima',
      'lector',
      'Hospital del Trabajador',
      true,
      '  La pidió el Dr. Salas.  ',
    )

    expect(respuesta.exito).toBe(true)
    expect(loCreado().notas).toBe('La pidió el Dr. Salas.')
  })

  it('sin nota no guarda una cadena vacía', async () => {
    await crearUsuario('otro@hospital.cl', 'Ana Vidal', 'contrasena-larguisima', 'lector')

    expect(loCreado().notas).toBeUndefined()
  })
})

// ------------------------------------------- la otra mitad: la pantalla

const TABLA = join(
  process.cwd(),
  'src',
  'app',
  '(frontend)',
  'admin-panel',
  'usuarios',
  'TablaUsuarios.tsx',
)
const ACCION = join(process.cwd(), 'src', 'app', '(frontend)', 'acciones', 'admin.ts')
const PAGINA = join(
  process.cwd(),
  'src',
  'app',
  '(frontend)',
  'admin-panel',
  'usuarios',
  'page.tsx',
)

/**
 * El archivo sin comentarios y en una sola línea.
 *
 * Sin quitar los comentarios, media prueba se cumpliría sola: los comentarios
 * de esta casa citan el código que explican, así que buscar `notas` encontraría
 * el párrafo que dice por qué está puesto y no el campo.
 */
const sinComentarios = (ruta: string): string =>
  readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

const tabla = sinComentarios(TABLA)
const accion = sinComentarios(ACCION)
const pagina = sinComentarios(PAGINA)

const techoDeclaradoEn = (codigo: string): string =>
  codigo.match(/LARGO_MAXIMO_NOTA = (\d+)/)?.[1] ?? 'no declarado'

describe('la pantalla de cuentas escribe y lee la nota', () => {
  it('el modal de editar tiene el cuadro de texto', () => {
    expect(tabla).toContain('id="editar-notas"')
    expect(tabla).toContain('value={notas}')
  })

  it('lo que el modal manda acaba en `actualizarUsuario`', () => {
    // El eslabón que más se ha olvidado en esta casa: el campo se pinta, se
    // guarda en su estado y nadie lo pone en el objeto que viaja.
    expect(tabla).toMatch(/\.\.\.\(notas === notaOriginal \? \{\} : \{ notas \}\)/)
    expect(tabla).toContain('actualizarUsuario(editando.id, datos)')
  })

  it('no manda la nota cuando no se tocó', () => {
    // No es desconfianza del dato: es que dos administradores pueden tener este
    // modal abierto a la vez sobre la misma cuenta. El modal se llena con la
    // nota tal como estaba al abrirlo, así que mandarla siempre haría que quien
    // solo venía a corregir un correo reescribiera además la nota con su copia
    // vieja, borrando en silencio lo que el otro acababa de escribir.
    expect(tabla).toContain('const notaOriginal = usuario.notas')
    expect(tabla).toMatch(/\.\.\.\(notas === notaOriginal \? \{\} : \{ notas \}\)/)
  })

  it('la fila enseña que la cuenta tiene nota, sin tener que abrir nada', () => {
    expect(tabla).toMatch(/\{u\.notas \? \(/)
    expect(tabla).toContain('resumirNota(u.notas)')
  })

  it('la búsqueda de la tabla mira también la nota', () => {
    // El caso que el campo resuelve —«quién pidió esta cuenta»— solo sirve si
    // buscando al jefe de servicio aparecen las cuatro cuentas que pidió. Se
    // fija aquí porque es la línea más fácil de perder en cualquier retoque de
    // los filtros, y su pérdida no rompe nada: la búsqueda sigue funcionando y
    // deja de encontrar exactamente lo que se buscaba.
    expect(tabla).toMatch(/normalizar\(\[u\.nombre, u\.email, u\.institucion, u\.notas\]/)
  })

  it('`page.tsx` copia la nota en la lista que recibe la tabla', () => {
    // El eslabón que faltaba, y el único que no avisa al romperse. `page.tsx`
    // es el ÚNICO sitio que arma `UsuarioDelPanel[]`: sin esta línea en su
    // `map`, `u.notas` llega `undefined` en todas las filas y se apaga la
    // pantalla entera de una vez —la fila no pinta la nota, la búsqueda
    // concatena cadena vacía y el cuadro del modal abre en blanco sobre una
    // nota que sí existe, invitando a pisarla—, mientras el servidor sigue
    // aceptando el campo y todo lo demás sigue verde. El documento la trae:
    // `payload.find` sin `select` devuelve el documento entero.
    // El mensaje lleva la línea literal porque este fallo se lee desde fuera
    // del archivo que hay que tocar: sin él, la salida es una expresión regular
    // contra la página entera y quien la ve tiene que deducir qué falta.
    expect(
      pagina,
      'Falta una línea en el map de src/app/(frontend)/admin-panel/usuarios/page.tsx, ' +
        "junto a la de institucion: notas: (u.notas as string) ?? '',",
    ).toMatch(/notas:\s*[^,}]*u\.notas[^,}]*''/)
  })

  it('el formulario de alta la manda a `crearUsuario`', () => {
    expect(tabla).toMatch(/crearUsuario\([^)]*datos\.notas/)
  })

  it('el techo del navegador es el mismo que el del servidor', () => {
    // Son dos constantes gemelas y no una importada: `acciones/admin.ts` es un
    // módulo `'use server'` y solo puede exportar funciones asíncronas. Si se
    // separan, el navegador deja escribir más de lo que el servidor acepta y el
    // rechazo llega con el texto ya escrito y sin dónde recuperarlo.
    expect(techoDeclaradoEn(tabla)).toBe(techoDeclaradoEn(accion))
    expect(techoDeclaradoEn(accion)).toBe('2000')
    // Los dos cuadros, el de alta y el de edición, frenan antes de enviar.
    expect(tabla.match(/maxLength=\{LARGO_MAXIMO_NOTA\}/g)?.length).toBe(2)
  })
})
