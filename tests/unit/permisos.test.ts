import { describe, it, expect } from 'vitest'
import {
  filtroDePropiedad,
  puedeEditarModulo,
  puedeVerModulo,
  type UsuarioSesion,
} from '@/access/reglas'
import { accesoDePropiedad } from '@/access/payload'
import { exigirRol, modulosValidos } from '@/lib/validacion'

/**
 * La cadena de permisos, de punta a punta.
 *
 * El administrador marca casillas; `modulosValidos` sanea lo que llega;
 * `puedeVerModulo` y `filtroDePropiedad` deciden qué alcanza cada cuenta. Las
 * tres piezas viven en archivos distintos y ninguna fallaba de forma visible:
 * el saneador devuelve `[]` ante una entrada rara, y `[]` no significa
 * «ninguno» sino «todos», así que la restricción se deshace en silencio. Se
 * prueban juntas porque el error está en la costura, no en las piezas.
 */

const lector: UsuarioSesion = { id: '7', rol: 'lector', activo: true }
const editor: UsuarioSesion = { id: '8', rol: 'editor', activo: true }
const admin: UsuarioSesion = { id: '9', rol: 'admin', activo: true }

describe('el acceso a lo propio', () => {
  /**
   * Es la regla que separa «cada residente ve lo suyo» de «todos ven lo de
   * todos»: gobierna la lectura y la modificación de `comentarios` y de
   * `actividad`. Lo que un residente le escribe a su profesor sobre un caso
   * lleva su nombre al lado, y su progreso de lectura es entero.
   */
  it('al lector lo ata a sus propios registros', () => {
    expect(filtroDePropiedad(lector)).toEqual({ usuario: { equals: '7' } })
  })

  it('el editor y el administrador alcanzan los de todos', () => {
    // Al revés —negarles— el panel de Actividad y el de Comentarios aparecen
    // vacíos y el administrador cree que nadie usa la plataforma.
    expect(filtroDePropiedad(editor)).toBe(true)
    expect(filtroDePropiedad(admin)).toBe(true)
  })

  it('sin sesión y sin activar, nada', () => {
    expect(filtroDePropiedad(null)).toBe(false)
    expect(filtroDePropiedad(undefined)).toBe(false)
    expect(filtroDePropiedad({ id: '7', rol: 'lector', activo: false })).toBe(false)
  })
})

describe('el adaptador que declaran las colecciones', () => {
  /** Imita el objeto que Payload entrega a una función de acceso. */
  const peticion = (usuario: unknown) => ({ req: { user: usuario } }) as never

  it('lleva el identificador de la sesión hasta el filtro', () => {
    // PostgreSQL entrega el id como entero y la consulta lo quiere como texto.
    // Si el identificador se perdiera por el camino, el filtro saldría con un
    // valor que no es de nadie y el residente no vería ni lo suyo.
    expect(accesoDePropiedad(peticion({ id: 7, rol: 'lector', activo: true }))).toEqual({
      usuario: { equals: '7' },
    })
  })

  it('no concede nada a una sesión sin forma reconocible', () => {
    expect(accesoDePropiedad(peticion(null))).toBe(false)
    expect(accesoDePropiedad(peticion({ id: 7, rol: 'lector', activo: false }))).toBe(false)
    expect(accesoDePropiedad(peticion({ id: 7, rol: 'otro', activo: true }))).toBe(false)
  })

  it('deja pasar entero a quien lleva el contenido', () => {
    expect(accesoDePropiedad(peticion({ id: 8, rol: 'editor', activo: true }))).toBe(true)
    expect(accesoDePropiedad(peticion({ id: 9, rol: 'admin', activo: true }))).toBe(true)
  })
})

describe('el saneador de los permisos por módulo', () => {
  it('descarta lo ajeno y no repite lo válido', () => {
    expect(modulosValidos(['patologias', 'usuarios', 'patologias'])).toEqual(['patologias'])
  })

  it('lo que no es un arreglo da lista vacía, y la lista vacía significa TODOS', () => {
    // No es un detalle de forma: guardar `[]` abre los cinco módulos. Si la
    // casilla marcada llegara como la cadena suelta en vez de como el arreglo
    // de un elemento, el residente al que se acaba de restringir a la
    // biblioteca se queda con el simulador incluido, y el cuadro de permisos
    // se vuelve a abrir con las casillas vacías, que es justo lo que el
    // administrador esperaría de «sin restricción».
    expect(modulosValidos('patologias')).toEqual([])
    expect(modulosValidos(null)).toEqual([])
    expect(modulosValidos({ 0: 'patologias' })).toEqual([])
    expect(puedeVerModulo({ ...lector, modulosVisibles: [] }, 'cirugias')).toBe(true)
  })

  it('con la lista saneada, la restricción se sostiene', () => {
    const restringido: UsuarioSesion = {
      ...lector,
      modulosVisibles: modulosValidos(['patologias', 'inventado']),
    }
    expect(puedeVerModulo(restringido, 'patologias')).toBe(true)
    expect(puedeVerModulo(restringido, 'cirugias')).toBe(false)
  })

  it('la capa de módulos solo restringe: un lector con todos sigue sin escribir', () => {
    expect(puedeEditarModulo({ ...lector, modulosEditables: ['cirugias'] }, 'cirugias')).toBe(false)
  })
})

describe('el rol que llega desde el navegador', () => {
  it('devuelve el rol cuando el rol es uno de los tres', () => {
    // Que rechace lo inventado ya se prueba; que devuelva lo bueno, no lo
    // afirmaba nadie, y es la mitad que usan las acciones de servidor.
    expect(exigirRol('admin')).toBe('admin')
    expect(exigirRol('editor')).toBe('editor')
    expect(exigirRol('lector')).toBe('lector')
  })
})
