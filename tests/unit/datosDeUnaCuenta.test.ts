import { describe, expect, it } from 'vitest'
import type { Field } from 'payload'
import { COLECCIONES } from '@/collections'
import {
  CAMPOS_QUE_APUNTAN_A_UNA_CUENTA,
  cuentaSinLlaves,
  difusionDeLaCuenta,
  entradaSobreLaCuenta,
  enviosFallidosA,
  esCotizacionDe,
  nombreDelArchivoDeDatos,
  propuestaDeLaCuenta,
  revisionDeLaCuenta,
  votoDeLaCuenta,
} from '@/lib/datosDeUnaCuenta'

/**
 * Lo que se entrega cuando una persona pide sus datos (D-293): todo lo suyo y
 * nada de los demás.
 *
 * Que la descarga contenga de verdad cada fila, y que borrar la cuenta borre lo
 * que dice el aviso, se prueba contra PostgreSQL en
 * `tests/integration/privacidad.test.ts`. Aquí, lo que se decide sin base.
 */

const apuntaAUsuarios = (relationTo: unknown): boolean =>
  relationTo === 'usuarios' || (Array.isArray(relationTo) && relationTo.includes('usuarios'))

/**
 * Las rutas de los campos que guardan una cuenta, escritas como las escribe una
 * consulta de Payload: el arreglo y el grupo suman su nombre (`historial.usuario`),
 * la fila y el plegable no tienen. Un `join` no guarda nada —es la vista del otro
 * lado de una relación— y no cuenta.
 */
function camposQueApuntanAUsuarios(campos: Field[], prefijo = ''): string[] {
  const rutas: string[] = []
  for (const campo of campos) {
    const nombre = 'name' in campo && typeof campo.name === 'string' ? campo.name : null
    if ((campo.type === 'relationship' || campo.type === 'upload') && apuntaAUsuarios(campo.relationTo)) {
      rutas.push(`${prefijo}${nombre}`)
    }
    if ('fields' in campo && Array.isArray(campo.fields)) {
      rutas.push(...camposQueApuntanAUsuarios(campo.fields, nombre ? `${prefijo}${nombre}.` : prefijo))
    }
    if (campo.type === 'tabs') {
      for (const pestana of campo.tabs) {
        const dentro = 'name' in pestana && pestana.name ? `${prefijo}${pestana.name}.` : prefijo
        rutas.push(...camposQueApuntanAUsuarios(pestana.fields, dentro))
      }
    }
    if (campo.type === 'blocks') {
      for (const bloque of campo.blocks) {
        rutas.push(...camposQueApuntanAUsuarios(bloque.fields, `${prefijo}${nombre}.`))
      }
    }
  }
  return rutas
}

describe('dónde puede aparecer una cuenta', () => {
  it('la lista de la descarga es la de las colecciones: ni un campo más ni uno menos', () => {
    // El día que una colección nueva guarde una cuenta y nadie la sume a la
    // lista, la descarga dejaría de ser «todo lo que la plataforma guarda de
    // ti» sin que nada lo dijera. Esta prueba es lo que lo dice.
    const encontrados: Record<string, string[]> = {}
    for (const coleccion of COLECCIONES) {
      const rutas = camposQueApuntanAUsuarios(coleccion.fields)
      if (rutas.length > 0) encontrados[coleccion.slug] = rutas.sort()
    }
    const declarados = Object.fromEntries(
      Object.entries(CAMPOS_QUE_APUNTAN_A_UNA_CUENTA).map(([slug, rutas]) => [slug, [...rutas].sort()]),
    )
    expect(encontrados).toEqual(declarados)
  })

  it('el recorrido encuentra lo que está dentro de un arreglo', () => {
    // Si no lo encontrara, la prueba de arriba pasaría con la lista vacía.
    expect(camposQueApuntanAUsuarios([
      { name: 'autor', type: 'relationship', relationTo: 'usuarios' },
      { name: 'historial', type: 'array', fields: [{ name: 'usuario', type: 'relationship', relationTo: 'usuarios' }] },
      { type: 'row', fields: [{ name: 'votos', type: 'relationship', relationTo: ['usuarios'], hasMany: true }] },
      { name: 'otra', type: 'relationship', relationTo: 'medios' },
    ] as Field[])).toEqual(['autor', 'historial.usuario', 'votos'])
  })
})

describe('la cuenta, sin sus llaves', () => {
  it('ni la contraseña cifrada ni ningún testigo que deje entrar', () => {
    const cuenta = {
      id: 5,
      nombre: 'Fulana',
      email: 'fulana@hospital.cl',
      hash: 'hash-de-la-clave',
      salt: 'sal',
      resetPasswordToken: 'testigo-de-la-clave',
      _verificationToken: 'testigo-de-verificacion',
      apiKey: 'llave',
      apiKeyIndex: 'indice',
      loginAttempts: 2,
    }
    expect(cuentaSinLlaves(cuenta)).toEqual({ id: 5, nombre: 'Fulana', email: 'fulana@hospital.cl', loginAttempts: 2 })
  })

  it('de cada sesión, cuándo se abrió y cuándo caduca, sin el identificador con que se compara el testigo', () => {
    const limpia = cuentaSinLlaves({
      id: 5,
      sessions: [{ id: 'sesion-secreta', createdAt: '2026-11-01T10:00:00Z', expiresAt: '2026-11-08T10:00:00Z' }],
    })
    expect(limpia.sessions).toEqual([{ createdAt: '2026-11-01T10:00:00Z', expiresAt: '2026-11-08T10:00:00Z' }])
    expect(JSON.stringify(limpia)).not.toContain('sesion-secreta')
  })
})

describe('lo que otro hizo con la cuenta', () => {
  it('se entrega con el rol de quien lo hizo, no con su nombre, su correo ni sus módulos', () => {
    const entrada = entradaSobreLaCuenta({
      id: 40,
      accion: 'cambio-de-permisos',
      usuario: 1,
      usuarioNombre: 'Administradora',
      usuarioCorreo: 'admin@hospital.cl',
      rol: 'admin',
      permisos: { rol: 'admin', modulosVisibles: ['patologias'] },
      coleccion: 'usuarios',
      documentoId: '5',
      detalle: 'rol: lector → editor',
    })
    expect(entrada).toEqual({
      id: 40,
      accion: 'cambio-de-permisos',
      rol: 'admin',
      coleccion: 'usuarios',
      documentoId: '5',
      detalle: 'rol: lector → editor',
    })
  })
})

describe('una ficha en revisión, reducida a la parte de la persona', () => {
  const revision = {
    id: 3,
    coleccion: 'patologias',
    documentoId: '12',
    titulo: 'Fractura de clavícula',
    estado: 'lista',
    contenido: { texto: 'el texto de la ficha no es un dato de nadie' },
    asignadaA: 5,
    ultimoEditor: { id: 5, nombre: 'Fulana' },
    ultimaEdicion: '2026-11-01T10:00:00Z',
    listaPor: '5',
    listaEn: '2026-11-02T10:00:00Z',
    firmaMedicoPor: 8,
    firmaMedicoEn: '2026-11-03T10:00:00Z',
    publicadaPor: null,
    segundosActivosAlValidar: 600,
    validacionRapida: true,
    motivosDeAlerta: ['ritmo'],
    historial: [
      { id: 'h1', usuario: 5, accion: 'editó', fecha: '2026-11-01T10:00:00Z' },
      { id: 'h2', usuario: 8, accion: 'firmó', fecha: '2026-11-03T10:00:00Z' },
    ],
  }

  it('qué hizo en ella, con su fecha, venga la cuenta como número, como texto o poblada', () => {
    const fila = revisionDeLaCuenta(revision, 5)
    expect(fila.papeles).toEqual([
      { papel: 'tenía la revisión asignada', fecha: null },
      { papel: 'la editó por última vez', fecha: '2026-11-01T10:00:00Z' },
      { papel: 'la validó', fecha: '2026-11-02T10:00:00Z' },
    ])
  })

  it('su historial, sin las entradas de los demás', () => {
    expect(revisionDeLaCuenta(revision, 5).historial).toEqual([{ accion: 'editó', fecha: '2026-11-01T10:00:00Z' }])
  })

  it('las medidas de la validación solo a quien validó', () => {
    expect(revisionDeLaCuenta(revision, 5).alValidar).toMatchObject({
      segundosActivosAlValidar: 600,
      validacionRapida: true,
      motivosDeAlerta: ['ritmo'],
    })
    // Quien firmó como médico no recibe el juicio sobre el trabajo de otro.
    const delMedico = revisionDeLaCuenta(revision, 8)
    expect(delMedico.alValidar).toBeUndefined()
    expect(delMedico.papeles).toEqual([{ papel: 'la firmó como médico', fecha: '2026-11-03T10:00:00Z' }])
  })

  it('ni el texto de la ficha ni a los demás', () => {
    const texto = JSON.stringify(revisionDeLaCuenta(revision, 5))
    expect(texto).not.toContain('el texto de la ficha')
    expect(texto).not.toContain('firmó')
  })
})

describe('el buzón de requisitos y las difusiones', () => {
  it('de una propuesta suya, cuántos votos tuvo y no quiénes', () => {
    expect(propuestaDeLaCuenta({ id: 1, titulo: 'Exportar a PDF', autor: 5, votos: [7, 8, 9] })).toEqual({
      id: 1,
      titulo: 'Exportar a PDF',
      autor: 5,
      votosRecibidos: 3,
    })
    expect(propuestaDeLaCuenta({ id: 2, titulo: 'Sin votos' }).votosRecibidos).toBe(0)
  })

  it('de una que votó, cuál es y nada de quién la escribió', () => {
    expect(votoDeLaCuenta({ id: 1, titulo: 'Exportar a PDF', estado: 'abierto', autor: 7, votos: [5, 8] })).toEqual({
      id: 1,
      titulo: 'Exportar a PDF',
      estado: 'abierto',
    })
  })

  it('de una difusión que escribió, sin la cola ni los envíos fallidos, que son de otros', () => {
    expect(
      difusionDeLaCuenta({ id: 4, asunto: 'Aviso', autor: 5, pendientes: [9, 10], fallos: [{ correo: 'otra@x.cl' }] }),
    ).toEqual({ id: 4, asunto: 'Aviso', autor: 5 })
  })

  it('de las que recibió, solo los envíos que no le llegaron, por su correo y sin distinguir mayúsculas', () => {
    const difusion = {
      id: 4,
      asunto: 'Aviso',
      createdAt: '2026-11-01T10:00:00Z',
      fallos: [
        { correo: 'Fulana@Hospital.cl', motivo: 'buzón lleno' },
        { correo: 'otra@hospital.cl', motivo: 'no existe' },
      ],
    }
    expect(enviosFallidosA(difusion, 'fulana@hospital.cl')).toEqual([
      { difusion: 4, asunto: 'Aviso', fecha: '2026-11-01T10:00:00Z', motivo: 'buzón lleno' },
    ])
    expect(enviosFallidosA(difusion, '')).toEqual([])
    expect(enviosFallidosA({ id: 5 }, 'fulana@hospital.cl')).toEqual([])
  })
})

describe('las cotizaciones y el archivo', () => {
  it('una cotización es de la persona si trae su mismo correo', () => {
    expect(esCotizacionDe({ correo: ' Fulana@Hospital.cl ' }, 'fulana@hospital.cl')).toBe(true)
    expect(esCotizacionDe({ correo: 'otra@hospital.cl' }, 'fulana@hospital.cl')).toBe(false)
    // Una cuenta sin correo no se lleva las cotizaciones sin correo.
    expect(esCotizacionDe({ correo: '' }, '')).toBe(false)
    expect(esCotizacionDe({}, 'fulana@hospital.cl')).toBe(false)
  })

  it('el nombre del archivo no lleva nada que el navegador tenga que escapar', () => {
    expect(nombreDelArchivoDeDatos(5, '20261105-101500')).toBe('datos-de-la-cuenta-5-20261105-101500.json')
    expect(nombreDelArchivoDeDatos('5"; rm', '20261105')).toBe('datos-de-la-cuenta-5---rm-20261105.json')
  })
})
