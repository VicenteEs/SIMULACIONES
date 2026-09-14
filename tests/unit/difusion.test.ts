import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { Envio } from '@/correo/enviar'
import {
  condicionDeDestinatarios,
  correosPorHora,
  destinatariosDe,
  enCurso,
  FALLOS_SEGUIDOS_PARA_DETENER,
  lanzarDifusion,
  pausaEntreCorreosMs,
  procesarDifusion,
} from '@/correo/difusion'

/**
 * El trabajador de la difusión (`src/correo/difusion.ts`).
 *
 * Lo que se vigila es lo que se paga caro si falla y nadie lo ve hasta que
 * llegan las quejas: que cada persona reciba un correo y uno solo, con su
 * nombre y sin las direcciones de las demás; que «Detener» detenga; que
 * reanudar siga la cola en vez de empezar de nuevo; y que el ritmo salga de la
 * variable y no de un número escrito a mano.
 *
 * La base es un par de mapas en memoria con los tres métodos que el trabajador
 * usa. Devuelven copias, como la base de verdad: si devolvieran el objeto
 * guardado, el trabajador podría «ver» un cambio que nunca escribió.
 */

type Fila = Record<string, unknown>

function baseDePrueba(cuentas: Fila[], difusion: Fila) {
  const usuarios = new Map(cuentas.map((c) => [String(c.id), c]))
  const difusiones = new Map([[String(difusion.id), difusion]])
  const tabla = (coleccion: string) => (coleccion === 'difusiones' ? difusiones : usuarios)

  const payload = {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string | number }) => {
      const fila = tabla(collection).get(String(id))
      return fila ? structuredClone(fila) : null
    }),
    update: vi.fn(async ({ collection, id, data }: { collection: string; id: string | number; data: Fila }) => {
      const fila = tabla(collection).get(String(id))!
      Object.assign(fila, structuredClone(data))
      return structuredClone(fila)
    }),
    logger: { error: vi.fn() },
  }
  return { payload: payload as unknown as Payload, espia: payload, difusiones, usuarios }
}

const cuenta = (id: number, nombre: string, extra: Fila = {}): Fila => ({
  id,
  nombre,
  email: `${nombre.toLowerCase()}@hospital.cl`,
  activo: true,
  pendiente: false,
  rol: 'lector',
  ...extra,
})

const difusionNueva = (id: number, pendientes: number[], extra: Fila = {}): Fila => ({
  id,
  asunto: 'Sesión del lunes',
  mensaje: 'Revisaremos fracturas de meseta.\n\n- Traer casos\n- Leer la ficha',
  botonTexto: 'Abrir la ficha',
  botonEnlace: 'https://traumahub.example/ficha',
  audiencia: 'todas',
  estado: 'enviando',
  total: pendientes.length,
  enviados: 0,
  fallidos: 0,
  pendientes,
  fallos: [],
  ...extra,
})

const TRES = () => [cuenta(1, 'Ana'), cuenta(2, 'Beto'), cuenta(3, 'Carla')]

/** Un `enviar` que apunta cada envío y no manda nada. */
function buzon() {
  const recibidos: Envio[] = []
  const enviar = vi.fn(async (_payload: Payload, envio: Envio) => {
    recibidos.push(envio)
  })
  return { recibidos, enviar }
}

const sinEsperar = () => vi.fn(async (_ms: number) => {})

describe('el ritmo', () => {
  const original = process.env.DIFUSION_CORREOS_POR_HORA
  afterEach(() => {
    if (original === undefined) delete process.env.DIFUSION_CORREOS_POR_HORA
    else process.env.DIFUSION_CORREOS_POR_HORA = original
  })

  it('sale de DIFUSION_CORREOS_POR_HORA', () => {
    process.env.DIFUSION_CORREOS_POR_HORA = '60'
    expect(correosPorHora()).toBe(60)
    expect(pausaEntreCorreosMs()).toBe(60_000)
    process.env.DIFUSION_CORREOS_POR_HORA = '7'
    expect(pausaEntreCorreosMs()).toBe(Math.ceil(3_600_000 / 7))
  })

  it('sin variable, o con un valor que no sirve, usa 200 por hora', () => {
    // Una pausa de cero —lo que daría `Number('')`— vaciaría la cuota del
    // hosting en un minuto, y con ella la recuperación de contraseña.
    for (const valor of [undefined, '', 'muchos', '0', '-5']) {
      if (valor === undefined) delete process.env.DIFUSION_CORREOS_POR_HORA
      else process.env.DIFUSION_CORREOS_POR_HORA = valor
      expect(pausaEntreCorreosMs(), String(valor)).toBe(18_000)
    }
  })
})

describe('los destinatarios', () => {
  it('son las cuentas activas sin solicitud por revisar, y el rol solo si no es «todas»', () => {
    const todas = JSON.stringify(condicionDeDestinatarios('todas'))
    expect(todas).toContain('"activo":{"equals":true}')
    // «Falso o vacío», no «distinto de verdadero»: en SQL lo segundo deja
    // fuera las filas con NULL.
    expect(todas).toContain('"pendiente":{"equals":false}')
    expect(todas).toContain('"pendiente":{"exists":false}')
    expect(todas).not.toContain('rol')
    expect(JSON.stringify(condicionDeDestinatarios('editor'))).toContain('"rol":{"equals":"editor"}')
  })

  it('se leen todas de una vez, en orden, y sin tope de página', async () => {
    const find = vi.fn(async () => ({ docs: [{ id: 4, email: 'a@b.cl', nombre: 'Ana', rol: 'lector' }] }))
    const lista = await destinatariosDe({ find } as unknown as Payload, 'lector')
    expect(lista).toEqual([{ id: 4, email: 'a@b.cl', nombre: 'Ana' }])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'usuarios',
        pagination: false,
        sort: 'id',
        depth: 0,
        overrideAccess: true,
        where: condicionDeDestinatarios('lector'),
      }),
    )
  })
})

describe('el envío', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('manda un correo por persona, con su nombre y solo su dirección', async () => {
    const { payload, difusiones } = baseDePrueba(TRES(), difusionNueva(10, [1, 2, 3]))
    const { recibidos, enviar } = buzon()
    const dormir = sinEsperar()

    await procesarDifusion(payload, 10, { enviar, dormir, pausaMs: 18_000 })

    expect(recibidos.map((e) => e.para)).toEqual(['ana@hospital.cl', 'beto@hospital.cl', 'carla@hospital.cl'])
    expect(recibidos.map((e) => e.correo.bloques[0])).toEqual([
      // Sin enlaces: el nombre lo escribió otra persona (ver `saludo`).
      { tipo: 'parrafo', texto: 'Hola, Ana.', sinEnlaces: true },
      { tipo: 'parrafo', texto: 'Hola, Beto.', sinEnlaces: true },
      { tipo: 'parrafo', texto: 'Hola, Carla.', sinEnlaces: true },
    ])
    expect(recibidos[0].correo.boton).toEqual({ texto: 'Abrir la ficha', enlace: 'https://traumahub.example/ficha' })

    const final = difusiones.get('10')!
    expect(final).toMatchObject({ estado: 'enviada', total: 3, enviados: 3, fallidos: 0, pendientes: [] })
    expect(typeof final.terminadaEn).toBe('string')
    // Pausa entre correos, no después del último.
    expect(dormir).toHaveBeenCalledTimes(2)
    expect(dormir).toHaveBeenCalledWith(18_000)
  })

  it('anota el fallo con su motivo recortado y sigue con los demás', async () => {
    const { payload, difusiones } = baseDePrueba(TRES(), difusionNueva(11, [1, 2, 3]))
    const enviar = vi.fn(async (_p: Payload, envio: Envio) => {
      if (envio.para === 'beto@hospital.cl') throw new Error(`550 buzón inexistente ${'x'.repeat(1000)}`)
    })

    await procesarDifusion(payload, 11, { enviar, dormir: sinEsperar() })

    const final = difusiones.get('11')!
    expect(enviar).toHaveBeenCalledTimes(3)
    expect(final).toMatchObject({ estado: 'con-fallos', total: 3, enviados: 2, fallidos: 1, pendientes: [] })
    const fallos = final.fallos as Array<{ correo: string; motivo: string }>
    expect(fallos).toHaveLength(1)
    expect(fallos[0].correo).toBe('beto@hospital.cl')
    expect(fallos[0].motivo.startsWith('550 buzón inexistente')).toBe(true)
    expect(fallos[0].motivo).toHaveLength(300)
  })

  it('el motivo guardado es la explicación, y nunca lleva la clave del correo', async () => {
    // `fallos` se guarda en la base, viaja en los respaldos y se pinta en el
    // historial: si el servidor repitiera la clave en su respuesta, con el
    // mensaje crudo quedaría escrita en los tres sitios.
    const claveOriginal = process.env.SMTP_CLAVE
    process.env.SMTP_CLAVE = 'clave-secreta-del-hosting'
    try {
      const { payload, difusiones, espia } = baseDePrueba(TRES(), difusionNueva(17, [1, 2]))
      const enviar = vi.fn(async (_p: Payload, envio: Envio) => {
        if (envio.para === 'ana@hospital.cl') {
          throw Object.assign(new Error(`Invalid login: 535 rechazada clave-secreta-del-hosting`), { code: 'EAUTH' })
        }
        throw new Error(`451 no se pudo con clave-secreta-del-hosting`)
      })

      await procesarDifusion(payload, 17, { enviar, dormir: sinEsperar() })

      const fallos = difusiones.get('17')!.fallos as Array<{ correo: string; motivo: string }>
      expect(fallos).toHaveLength(2)
      expect(JSON.stringify(fallos)).not.toContain('clave-secreta-del-hosting')
      // Dice qué tocar, no solo lo que contestó el servidor.
      expect(fallos[0].motivo).toMatch(/SMTP_USUARIO/)
      // Sin tachar la clave dentro del texto: tachada, se deduce del contexto
      // (una clave que sea parte del nombre del servidor queda a la vista). Se
      // omite el detalle entero. Ver `explicarFalloDeCorreo`.
      expect(fallos[1].motivo).toBe('El envío falló, y se omitió el detalle que dio el servidor.')
      expect(fallos[1].motivo).not.toContain('*')
      // El error entero sí queda en el registro, para depurar.
      expect(espia.logger.error).toHaveBeenCalledTimes(2)
    } finally {
      if (claveOriginal === undefined) delete process.env.SMTP_CLAVE
      else process.env.SMTP_CLAVE = claveOriginal
    }
  })

  it('quita de la cola a quien se dio de baja o se borró, sin contarlo como fallo', async () => {
    const cuentas = [cuenta(1, 'Ana'), cuenta(2, 'Beto', { activo: false }), cuenta(4, 'Dora', { pendiente: true })]
    // La cuenta 3 ya no existe.
    const { payload, difusiones } = baseDePrueba(cuentas, difusionNueva(12, [1, 2, 3, 4]))
    const { recibidos, enviar } = buzon()
    const dormir = sinEsperar()

    await procesarDifusion(payload, 12, { enviar, dormir })

    expect(recibidos.map((e) => e.para)).toEqual(['ana@hospital.cl'])
    expect(difusiones.get('12')).toMatchObject({ estado: 'enviada', total: 1, enviados: 1, fallidos: 0, pendientes: [] })
    // Saltarse una cuenta no gasta cuota, así que no espera por ella.
    expect(dormir).toHaveBeenCalledTimes(1)
  })

  it('se detiene antes del siguiente correo si alguien la detuvo, sin pisar el estado', async () => {
    const { payload, difusiones } = baseDePrueba(TRES(), difusionNueva(13, [1, 2, 3]))
    // «Detener» pulsado mientras sale el primer correo: la acción escribe el
    // estado y el trabajador escribe después sus contadores.
    const enviar = vi.fn(async () => {
      difusiones.get('13')!.estado = 'detenida'
    })

    await procesarDifusion(payload, 13, { enviar, dormir: sinEsperar() })

    expect(enviar).toHaveBeenCalledTimes(1)
    expect(difusiones.get('13')).toMatchObject({ estado: 'detenida', enviados: 1, pendientes: [2, 3] })
  })

  it('al reanudar sigue la cola desde donde quedó y no repite a nadie', async () => {
    const { payload, difusiones } = baseDePrueba(TRES(), difusionNueva(14, [1, 2, 3]))
    const { recibidos, enviar } = buzon()
    let primera = true
    const dormir = vi.fn(async () => {
      if (primera) difusiones.get('14')!.estado = 'detenida'
      primera = false
    })

    await procesarDifusion(payload, 14, { enviar, dormir })
    expect(recibidos.map((e) => e.para)).toEqual(['ana@hospital.cl'])

    difusiones.get('14')!.estado = 'enviando'
    await procesarDifusion(payload, 14, { enviar, dormir: sinEsperar() })

    expect(recibidos.map((e) => e.para)).toEqual(['ana@hospital.cl', 'beto@hospital.cl', 'carla@hospital.cl'])
    expect(difusiones.get('14')).toMatchObject({ estado: 'enviada', enviados: 3, pendientes: [] })
  })

  it(`se detiene sola tras ${FALLOS_SEGUIDOS_PARA_DETENER} fallos seguidos, sin quemar el resto de la lista`, async () => {
    const cuentas = Array.from({ length: 8 }, (_, i) => cuenta(i + 1, `Persona${i + 1}`))
    const { payload, difusiones } = baseDePrueba(cuentas, difusionNueva(15, cuentas.map((c) => c.id as number)))
    const enviar = vi.fn(async () => {
      throw new Error('451 cuota de envío por hora superada')
    })

    await procesarDifusion(payload, 15, { enviar, dormir: sinEsperar() })

    expect(enviar).toHaveBeenCalledTimes(FALLOS_SEGUIDOS_PARA_DETENER)
    const final = difusiones.get('15')!
    expect(final).toMatchObject({ estado: 'detenida', fallidos: FALLOS_SEGUIDOS_PARA_DETENER, enviados: 0 })
    expect(final.pendientes).toHaveLength(8 - FALLOS_SEGUIDOS_PARA_DETENER)
    expect((final.fallos as unknown[]).length).toBe(FALLOS_SEGUIDOS_PARA_DETENER)
  })

  it('una difusión que ya no está enviándose no manda nada', async () => {
    const { payload } = baseDePrueba(TRES(), difusionNueva(16, [1, 2, 3], { estado: 'detenida' }))
    const { enviar } = buzon()
    await procesarDifusion(payload, 16, { enviar, dormir: sinEsperar() })
    expect(enviar).not.toHaveBeenCalled()
  })
})

describe('lanzar en segundo plano', () => {
  it('vuelve enseguida, y lanzar dos veces la misma no pone dos trabajadores', async () => {
    const { payload, difusiones } = baseDePrueba(TRES(), difusionNueva(20, [1, 2, 3]))
    const { recibidos, enviar } = buzon()
    let soltar!: () => void
    const cerrojo = new Promise<void>((listo) => {
      soltar = listo
    })
    const dormir = vi.fn(() => cerrojo)

    expect(lanzarDifusion(payload, 20, { enviar, dormir })).toBe(true)
    expect(enCurso(20)).toBe(true)
    expect(lanzarDifusion(payload, '20', { enviar, dormir })).toBe(false)

    soltar()
    await vi.waitFor(() => expect(enCurso(20)).toBe(false))

    expect(recibidos.map((e) => e.para)).toEqual(['ana@hospital.cl', 'beto@hospital.cl', 'carla@hospital.cl'])
    expect(difusiones.get('20')).toMatchObject({ estado: 'enviada', enviados: 3 })
  })

  it('un error inesperado queda en el registro y libera la difusión', async () => {
    const { payload, espia } = baseDePrueba(TRES(), difusionNueva(21, [1]))
    espia.findByID.mockRejectedValueOnce(new Error('la base no responde'))

    expect(lanzarDifusion(payload, 21, { enviar: buzon().enviar, dormir: sinEsperar() })).toBe(true)
    await vi.waitFor(() => expect(enCurso(21)).toBe(false))

    expect(espia.logger.error).toHaveBeenCalledTimes(1)
  })
})
