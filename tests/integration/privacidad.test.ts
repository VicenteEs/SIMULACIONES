import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionSlug, Payload } from 'payload'

/**
 * Lo que el aviso de privacidad promete sobre los datos de una cuenta, contra
 * una base de verdad (D-290, D-291, D-293).
 *
 * Tres promesas, y cada una se comprueba donde podría romperse sin que nada
 * avise:
 *
 *  - **«Te mandamos un archivo con todo lo que la plataforma guarda de ti»**: se
 *    siembra una cuenta con algo en cada colección que la nombra y se mira que
 *    la exportación lo traiga todo, sin sus llaves y sin nada de otras personas.
 *  - **«Cuando una cuenta se elimina, se borran con ella…; queda, sin nada que
 *    lo una a ti…»**: se elimina y se busca su nombre, su correo y lo que
 *    escribió en **todas las tablas de la base**, columna por columna. Una
 *    prueba que mirara solo las colecciones conocidas no vería la tabla nueva
 *    que alguien agregue el año que viene, que es justo la que se olvidaría.
 *  - **«El registro de acciones se borra a los doce meses; una cotización, a
 *    los doce meses»**: la pasada diaria, sobre filas con fecha de hace trece.
 *
 * Las filas se siembran con la capa de la base (`payload.db.create`) y no con
 * `payload.create`: lo que se prueba es qué pasa con ellas al borrar, no los
 * ganchos de cada colección al crearlas —el de los requisitos avisa a los
 * administradores, el de las difusiones podría empezar a enviar—. La cuenta sí
 * se crea y se borra con las operaciones de Payload, porque el borrado es lo que
 * se prueba: el mismo `payload.delete` que hace `borrarCuentaVigilada` tanto al
 * eliminar como al rechazar una solicitud.
 *
 * Con la misma guardia que las demás de integración: sin base, falla en rojo
 * salvo que se pida omitirlas por escrito (ver `acceso.test.ts`).
 */

type IntentoDeConexion = { payload: Payload; fallo: null } | { payload: null; fallo: string }

const intento: IntentoDeConexion = await (async (): Promise<IntentoDeConexion> => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return { payload: await getPayload({ config }), fallo: null }
  } catch (error) {
    process.on('unhandledRejection', () => {})
    return { payload: null, fallo: error instanceof Error ? error.message : String(error) }
  }
})()

const estaEnIntegracionContinua = !['', 'false', '0'].includes(process.env.CI ?? '')
const seExigen = estaEnIntegracionContinua || process.env.EXIGIR_INTEGRACION === '1'
const permisoParaOmitir = process.env.OMITIR_INTEGRACION === '1' && !seExigen

describe('las pruebas de privacidad no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

type Fila = Record<string, unknown>
type Consulta = { execute: (consulta: unknown) => Promise<{ rows: Fila[] }> }

/** El identificador de una relación, venga como número o como fila poblada. */
const idDe = (valor: unknown): string | null =>
  valor === null || valor === undefined
    ? null
    : typeof valor === 'object'
      ? idDe((valor as { id?: unknown }).id)
      : String(valor)

/** Un identificador de fila de arreglo como los que pone Payload: la capa de la base no los inventa. */
const idDeFila = () => randomBytes(12).toString('hex')

const haceMeses = (meses: number) => {
  const fecha = new Date()
  fecha.setUTCMonth(fecha.getUTCMonth() - meses)
  return fecha.toISOString()
}

describe.skipIf(intento.payload === null)('los datos de una cuenta: exportarla y eliminarla', async () => {
  const payload = intento.payload as Payload
  const { sql } = await import('@payloadcms/db-postgres')
  const { datosDeUnaCuenta } = await import('@/lib/datosDeUnaCuentaServidor')
  const { CORREO_RETIRADO } = await import('@/lib/conservacionServidor')
  const { VERSION_DEL_AVISO_DE_PRIVACIDAD } = await import('@/lib/avisoDePrivacidad')
  const base = (payload.db as unknown as { drizzle: Consulta }).drizzle

  const marca = randomBytes(5).toString('hex')
  const password = randomBytes(18).toString('base64url')
  // Lo de la persona, con la marca dentro para que la búsqueda por toda la
  // base no case con nada que no sea de esta prueba.
  const persona = {
    nombre: `Persona Baja ${marca}`,
    email: `baja-${marca}@prueba.invalid`,
    institucion: `Hospital de la Baja ${marca}`,
    motivo: `Quiero preparar el examen ${marca}`,
    notas: `Nota interna sobre la baja ${marca}`,
  }
  const otra = { nombre: `Otra Persona ${marca}`, email: `otra-${marca}@prueba.invalid` }

  let cuentaId = 0
  let otraId = 0
  const sembradas: { coleccion: CollectionSlug; id: number | string }[] = []
  const filas: Record<string, number | string> = {}

  const sembrar = async (coleccion: CollectionSlug, clave: string, data: Fila) => {
    const fila = (await payload.db.create({ collection: coleccion, data })) as unknown as Fila
    sembradas.push({ coleccion, id: fila.id as number })
    filas[clave] = fila.id as number
    return fila
  }
  const leer = async (coleccion: CollectionSlug, id: number | string) =>
    (await payload.findByID({ collection: coleccion, id, depth: 0, overrideAccess: true, disableErrors: true })) as
      | Fila
      | null

  /** Las tablas en que aparece `aguja`, buscada en la fila entera vuelta texto: todas las columnas a la vez. */
  async function tablasCon(aguja: string): Promise<string[]> {
    const { rows } = await base.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
    )
    const encontradas: string[] = []
    for (const { table_name: tabla } of rows as { table_name: string }[]) {
      // Las cotizaciones no cuelgan de ninguna cuenta: siguen su propio plazo,
      // y una supresión las borra aparte, a mano (BITACORA, «Cuando alguien
      // pide sus datos»). Que esta siga viva se comprueba más abajo.
      if (tabla.startsWith('cotizaciones')) continue
      const { rows: cuenta } = await base.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.identifier(tabla)} AS fila WHERE fila::text ILIKE ${`%${aguja}%`}`,
      )
      if (Number(cuenta[0]?.n) > 0) encontradas.push(tabla)
    }
    return encontradas
  }

  beforeAll(async () => {
    const cuenta = await payload.create({
      collection: 'usuarios',
      data: {
        nombre: persona.nombre,
        email: persona.email,
        password,
        rol: 'editor',
        activo: true,
        institucion: persona.institucion,
        profesion: 'medico',
        motivoDeSolicitud: persona.motivo,
        notas: persona.notas,
      } as never,
      overrideAccess: true,
    })
    cuentaId = cuenta.id as number
    const otraCuenta = await payload.create({
      collection: 'usuarios',
      data: { nombre: otra.nombre, email: otra.email, password, rol: 'admin', activo: true } as never,
      overrideAccess: true,
    })
    otraId = otraCuenta.id as number

    // Una sesión abierta y su «Inició sesión» en el registro, por el camino de verdad.
    await payload.login({ collection: 'usuarios', data: { email: persona.email, password } })

    const ahora = new Date().toISOString()
    await sembrar('actividad', 'actividad', {
      usuario: cuentaId,
      coleccion: 'patologias',
      documentoId: `ficha-${marca}`,
      completado: true,
      ultimaVisita: ahora,
    })
    await sembrar('comentarios', 'comentario', {
      usuario: cuentaId,
      coleccion: 'patologias',
      documentoId: `ficha-${marca}`,
      texto: `Falta la vía de abordaje (${marca}-comentario)`,
      estado: 'pendiente',
    })
    await sembrar('tiempo-activo', 'tiempo', {
      usuario: cuentaId,
      dia: '2026-11-01',
      segundos: 120,
      latidos: 4,
      ultimaRuta: '/patologias',
    })
    await sembrar('sesiones-de-revision', 'sesion', {
      usuario: cuentaId,
      coleccion: 'patologias',
      documentoId: `ficha-${marca}`,
      sesion: `sesion-${marca}`,
      inicio: ahora,
      segundosAbiertos: 60,
      segundosActivos: 30,
    })
    await sembrar('revisiones', 'revision', {
      coleccion: 'patologias',
      documentoId: `ficha-${marca}`,
      titulo: `Ficha en revisión ${marca}`,
      origen: 'manual',
      estado: 'lista',
      asignadaA: cuentaId,
      ultimoEditor: cuentaId,
      ultimaEdicion: ahora,
      listaPor: cuentaId,
      listaEn: ahora,
      segundosActivosAlValidar: 300,
      validacionRapida: false,
      firmaMedicoPor: cuentaId,
      firmaMedicoEn: ahora,
      firmaKinesiologoPor: otraId,
      firmaKinesiologoEn: ahora,
      historial: [
        { id: idDeFila(), accion: 'firmada', usuario: cuentaId, fecha: ahora, detalle: 'Como médico.' },
        { id: idDeFila(), accion: 'lista', usuario: otraId, fecha: ahora, detalle: 'Como kinesiólogo.' },
      ],
    })
    await sembrar('requisitos', 'propuesta', {
      titulo: `Propuesta ${marca}`,
      descripcion: 'Planificar sobre las imágenes del paciente.',
      modulo: 'planificacion',
      estado: 'propuesto',
      autor: cuentaId,
      votos: [otraId],
    })
    await sembrar('requisitos', 'votada', {
      titulo: `Propuesta ajena ${marca}`,
      descripcion: 'Medir ángulos sobre la radiografía.',
      modulo: 'planificacion',
      estado: 'propuesto',
      autor: otraId,
      votos: [cuentaId, otraId],
    })
    await sembrar('difusiones', 'difusion', {
      asunto: `Novedades ${marca}`,
      mensaje: 'Hay fichas nuevas en la biblioteca.',
      audiencia: 'todas',
      estado: 'con-fallos',
      autor: cuentaId,
      total: 2,
      enviados: 0,
      fallidos: 2,
      pendientes: [],
      fallos: [
        // En mayúsculas en el motivo, como lo devuelven algunos servidores.
        { correo: persona.email, motivo: `550 5.1.1 <${persona.email.toUpperCase()}>: Recipient address rejected` },
        { correo: otra.email, motivo: '452 buzón lleno' },
      ],
    })
    await sembrar('cotizaciones', 'cotizacion', {
      nombre: persona.nombre,
      correo: persona.email.toUpperCase(),
      institucion: `Servicio que cotiza ${marca}`,
      cargo: 'Jefe de residentes',
      residentes: '1 a 5',
      modulos: ['patologias'],
      mensaje: 'Queremos probarla con los residentes.',
      estado: 'nueva',
    })
    // Lo que una cuenta lee y lo que un administrador le hace: las dos caras del registro.
    await sembrar('registro-de-acciones', 'lectura', {
      fecha: ahora,
      usuario: cuentaId,
      usuarioNombre: persona.nombre,
      usuarioCorreo: persona.email,
      rol: 'editor',
      accion: 'lectura',
      coleccion: 'patologias',
      documentoId: `ficha-${marca}`,
      detalle: 'la abrió',
    })
    await sembrar('registro-de-acciones', 'permisos', {
      fecha: ahora,
      usuario: otraId,
      usuarioNombre: otra.nombre,
      usuarioCorreo: otra.email,
      rol: 'admin',
      permisos: { rol: 'admin' },
      accion: 'cambio-de-permisos',
      coleccion: 'usuarios',
      documentoId: String(cuentaId),
      titulo: persona.nombre,
      detalle: 'rol: lector → editor',
    })
    await sembrar('payload-preferences', 'preferencia', {
      key: `prueba-${marca}`,
      value: { columnas: ['email'] },
      user: { relationTo: 'usuarios', value: cuentaId },
    })
  })

  afterAll(async () => {
    for (const { coleccion, id } of sembradas) {
      await payload.db.deleteMany({ collection: coleccion, where: { id: { equals: id } } }).catch(() => {})
    }
    for (const id of [cuentaId, otraId]) {
      if (id) await payload.delete({ collection: 'usuarios', id, overrideAccess: true }).catch(() => {})
    }
  })

  it('la exportación trae todo lo de la cuenta, sin sus llaves ni nada de otras personas', async () => {
    const datos = await datosDeUnaCuenta(payload, cuentaId)
    expect(datos).not.toBeNull()
    const d = datos!
    const enTexto = JSON.stringify(d)

    // La cuenta, entera menos las llaves.
    expect(d.cuenta.email).toBe(persona.email)
    expect(d.cuenta.notas).toBe(persona.notas)
    for (const llave of ['hash', 'salt', 'resetPasswordToken']) expect(d.cuenta).not.toHaveProperty(llave)
    expect(enTexto).not.toMatch(/"(hash|salt)"/)
    const sesiones = d.cuenta.sessions as Fila[]
    expect(sesiones.length).toBeGreaterThan(0)
    for (const sesion of sesiones) expect(Object.keys(sesion).sort()).toEqual(['createdAt', 'expiresAt'])

    const ids = (lista: Fila[]) => lista.map((f) => String(f.id))
    expect(ids(d.avance)).toContain(String(filas.actividad))
    expect(ids(d.comentarios)).toContain(String(filas.comentario))
    expect(ids(d.tiempoActivo)).toContain(String(filas.tiempo))
    expect(ids(d.revision.sesiones)).toContain(String(filas.sesion))
    expect(ids(d.cotizaciones)).toEqual([String(filas.cotizacion)])
    expect(d.preferencias.map((p) => p.key)).toEqual([`prueba-${marca}`])

    // El registro: lo suyo con su nombre, y lo que le hicieron sin el de quien lo hizo.
    const propias = d.registroDeAcciones.propias
    expect(ids(propias)).toContain(String(filas.lectura))
    expect(propias.map((e) => e.accion)).toContain('sesion-iniciada')
    const sobreElla = d.registroDeAcciones.sobreLaCuenta
    const cambio = sobreElla.find((e) => String(e.id) === String(filas.permisos))
    expect(cambio).toMatchObject({ accion: 'cambio-de-permisos', rol: 'admin' })
    for (const campo of ['usuario', 'usuarioNombre', 'usuarioCorreo', 'permisos']) expect(cambio).not.toHaveProperty(campo)
    // Su alta, que la escribió el sistema, también es «sobre la cuenta».
    expect(sobreElla.map((e) => e.accion)).toContain('creo')

    // La ficha en revisión: lo que hizo ella, no lo que hizo la otra.
    const [ficha] = d.revision.fichas
    expect(d.revision.fichas).toHaveLength(1)
    const papeles = (ficha.papeles as Fila[]).map((p) => p.papel)
    expect(papeles).toEqual(
      expect.arrayContaining(['tenía la revisión asignada', 'la editó por última vez', 'la validó', 'la firmó como médico']),
    )
    expect(papeles).not.toContain('la firmó como kinesiólogo')
    expect(ficha.historial).toEqual([expect.objectContaining({ accion: 'firmada', detalle: 'Como médico.' })])
    expect(ficha.alValidar).toMatchObject({ segundosActivosAlValidar: 300 })

    // El buzón: cuántos votos tuvo lo suyo, y lo que votó, sin quién más.
    expect(d.buzonDeRequisitos.propuestas).toEqual([
      expect.objectContaining({ id: filas.propuesta, votosRecibidos: 1 }),
    ])
    expect(d.buzonDeRequisitos.propuestas[0]).not.toHaveProperty('votos')
    expect(d.buzonDeRequisitos.votos).toEqual([{ id: filas.votada, titulo: `Propuesta ajena ${marca}`, estado: 'propuesto' }])

    // Las difusiones: la que escribió, sin su cola, y el envío que no le llegó.
    expect(d.difusiones.escritas).toHaveLength(1)
    expect(d.difusiones.escritas[0]).not.toHaveProperty('fallos')
    expect(d.difusiones.escritas[0]).not.toHaveProperty('pendientes')
    expect(d.difusiones.enviosFallidos).toEqual([expect.objectContaining({ difusion: filas.difusion })])

    // Y nada que permita saber quién es la otra persona.
    expect(enTexto).not.toContain(otra.email)
    expect(enTexto).not.toContain(otra.nombre)
  })

  it('una cuenta que no existe no se exporta', async () => {
    expect(await datosDeUnaCuenta(payload, 2_000_000_000)).toBeNull()
  })

  it('eliminarla borra lo que el aviso dice que se borra y deja sin nombre lo que dice que queda', async () => {
    const delRegistro = await payload.find({
      collection: 'registro-de-acciones',
      where: { usuario: { equals: cuentaId } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    expect(delRegistro.docs.length).toBeGreaterThanOrEqual(2)

    await payload.delete({ collection: 'usuarios', id: cuentaId, overrideAccess: true })

    // «se borran con ella los datos de la cuenta y el avance»
    expect(await leer('usuarios', cuentaId)).toBeNull()
    expect(await leer('actividad', filas.actividad)).toBeNull()
    const preferencias = await payload.find({
      collection: 'payload-preferences',
      where: { key: { equals: `prueba-${marca}` } },
      overrideAccess: true,
    })
    expect(preferencias.totalDocs).toBe(0)

    // «queda, sin nada que lo una a ti: lo que comentaste…; tu tiempo activo, como cifra»
    expect(await leer('comentarios', filas.comentario)).toMatchObject({ usuario: null })
    expect(await leer('tiempo-activo', filas.tiempo)).toMatchObject({ usuario: null, segundos: 120 })
    expect(await leer('sesiones-de-revision', filas.sesion)).toMatchObject({ usuario: null, segundosActivos: 30 })

    // «el registro de acciones, sin tu nombre ni tu correo: queda lo que se hizo y el rol que tenías»
    for (const entrada of delRegistro.docs as unknown as Fila[]) {
      const ahora = await leer('registro-de-acciones', entrada.id as number)
      expect(ahora).toMatchObject({ usuario: null, usuarioNombre: null, usuarioCorreo: null, accion: entrada.accion })
      expect(ahora?.rol).toBe(entrada.rol)
    }
    // Lo que la nombraba pierde el título; quien lo hizo, que sigue, conserva el suyo.
    expect(await leer('registro-de-acciones', filas.permisos)).toMatchObject({
      titulo: null,
      usuarioNombre: otra.nombre,
      detalle: 'rol: lector → editor',
    })
    const baja = await payload.find({
      collection: 'registro-de-acciones',
      where: {
        and: [
          { accion: { equals: 'elimino' } },
          { coleccion: { equals: 'usuarios' } },
          { documentoId: { equals: String(cuentaId) } },
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    expect(baja.docs).toEqual([expect.objectContaining({ titulo: null, detalle: 'una cuenta de rol editor' })])

    // «si eras editor, lo que hiciste en las fichas … y tus propuestas, sin tu nombre. Tus votos se borran.»
    const revision = (await leer('revisiones', filas.revision))!
    for (const campo of ['asignadaA', 'ultimoEditor', 'listaPor', 'firmaMedicoPor']) expect(revision[campo]).toBeNull()
    expect(idDe(revision.firmaKinesiologoPor)).toBe(String(otraId))
    expect((revision.historial as Fila[]).map((e) => idDe(e.usuario))).toEqual([null, String(otraId)])
    expect(await leer('requisitos', filas.propuesta)).toMatchObject({ autor: null })
    expect(((await leer('requisitos', filas.votada))!.votos as unknown[]).map(idDe)).toEqual([String(otraId)])

    // La difusión que escribió queda sin autor, y el envío que no le llegó deja de decir a quién.
    const difusion = (await leer('difusiones', filas.difusion))!
    expect(difusion.autor).toBeNull()
    const [suyo, ajeno] = difusion.fallos as Fila[]
    expect(suyo.correo).toBeNull()
    expect(suyo.motivo).toBe(`550 5.1.1 <${CORREO_RETIRADO}>: Recipient address rejected`)
    expect(ajeno).toEqual({ correo: otra.email, motivo: '452 buzón lleno' })

    // La cotización no cuelga de la cuenta: sigue su propio plazo.
    expect(await leer('cotizaciones', filas.cotizacion)).not.toBeNull()

    // Y en ninguna tabla de la base queda nada de lo que la persona era o escribió de sí.
    // Primero, que la búsqueda encuentra lo que sí está: sin esto, una consulta
    // mal escrita que no casara nunca daría la prueba por buena.
    expect(await tablasCon(otra.email)).toEqual(expect.arrayContaining(['usuarios', 'difusiones']))
    for (const aguja of Object.values(persona)) {
      expect(await tablasCon(aguja), `«${aguja}» sigue en la base`).toEqual([])
    }
  })

  it('rechazar una solicitud no deja rastro de quien la pidió', async () => {
    // Rechazar acaba en el mismo `payload.delete` que eliminar
    // (`borrarCuentaVigilada`); lo que cambia es la cuenta: nunca entró, y lo
    // que deja es lo que escribió al pedirla y su aceptación del aviso.
    const solicitante = {
      nombre: `Solicitante ${marca}`,
      email: `solicitud-${marca}@prueba.invalid`,
      motivo: `Soy residente de primer año ${marca}`,
    }
    const ahora = new Date().toISOString()
    const solicitud = await payload.create({
      collection: 'usuarios',
      data: {
        nombre: solicitante.nombre,
        email: solicitante.email,
        password,
        rol: 'lector',
        activo: false,
        pendiente: true,
        origen: 'solicitud',
        motivoDeSolicitud: solicitante.motivo,
        solicitadaEn: ahora,
        privacidadAceptadaEn: ahora,
        versionDelAvisoDePrivacidad: VERSION_DEL_AVISO_DE_PRIVACIDAD,
      } as never,
      overrideAccess: true,
    })

    await payload.delete({ collection: 'usuarios', id: solicitud.id, overrideAccess: true })

    for (const aguja of Object.values(solicitante)) {
      expect(await tablasCon(aguja), `«${aguja}» sigue en la base`).toEqual([])
    }
  })
})

describe.skipIf(intento.payload === null)('la pasada diaria de los plazos', async () => {
  const payload = intento.payload as Payload
  const { aplicarLaConservacion, CORREO_RETIRADO } = await import('@/lib/conservacionServidor')

  const marca = randomBytes(5).toString('hex')
  const sembradas: { coleccion: CollectionSlug; id: number | string }[] = []
  const filas: Record<string, number | string> = {}

  const sembrar = async (coleccion: CollectionSlug, clave: string, data: Fila) => {
    const fila = (await payload.db.create({ collection: coleccion, data })) as unknown as Fila
    sembradas.push({ coleccion, id: fila.id as number })
    filas[clave] = fila.id as number
    return fila
  }
  const leer = async (coleccion: CollectionSlug, id: number | string) =>
    (await payload.findByID({ collection: coleccion, id, depth: 0, overrideAccess: true, disableErrors: true })) as
      | Fila
      | null

  const cotizacion = (nombre: string, createdAt: string) => ({
    nombre,
    correo: `${nombre.toLowerCase().replace(/\s+/g, '-')}@prueba.invalid`,
    institucion: `Institución de ${nombre}`,
    residentes: '1 a 5',
    modulos: ['patologias'],
    estado: 'nueva',
    createdAt,
    updatedAt: createdAt,
  })

  beforeAll(async () => {
    const ahora = new Date().toISOString()
    await sembrar('registro-de-acciones', 'vieja', {
      fecha: haceMeses(13),
      accion: 'lectura',
      origen: 'sistema',
      detalle: `vieja ${marca}`,
    })
    await sembrar('registro-de-acciones', 'reciente', {
      fecha: haceMeses(11),
      accion: 'lectura',
      origen: 'sistema',
      detalle: `reciente ${marca}`,
    })
    // Una entrada de una cuenta borrada antes de D-291: la base le dejó la
    // cuenta a nulo, y el nombre y el correo siguieron ahí.
    await sembrar('registro-de-acciones', 'huerfana', {
      fecha: ahora,
      usuario: null,
      origen: null,
      usuarioNombre: `Huérfana ${marca}`,
      usuarioCorreo: `huerfana-${marca}@prueba.invalid`,
      rol: 'lector',
      accion: 'lectura',
    })
    await sembrar('cotizaciones', 'cotizacionVieja', cotizacion(`Vieja ${marca}`, haceMeses(13)))
    await sembrar('cotizaciones', 'cotizacionReciente', cotizacion(`Reciente ${marca}`, haceMeses(1)))
    // Cómo se anotaba una cotización antes de D-291: con el nombre de quien la pidió.
    await sembrar('registro-de-acciones', 'sobreLaReciente', {
      fecha: ahora,
      accion: 'creo',
      origen: 'sistema',
      coleccion: 'cotizaciones',
      documentoId: String(filas.cotizacionReciente),
      titulo: `Reciente ${marca}`,
    })
    await sembrar('registro-de-acciones', 'sobreLaVieja', {
      fecha: ahora,
      accion: 'creo',
      origen: 'sistema',
      coleccion: 'cotizaciones',
      documentoId: String(filas.cotizacionVieja),
      titulo: `Vieja ${marca}`,
    })
    await sembrar('difusiones', 'difusion', {
      asunto: `Aviso ${marca}`,
      mensaje: 'Mensaje de prueba.',
      audiencia: 'todas',
      estado: 'con-fallos',
      total: 1,
      enviados: 0,
      fallidos: 1,
      fallos: [{ correo: `sin-cuenta-${marca}@prueba.invalid`, motivo: `rechazado sin-cuenta-${marca}@prueba.invalid` }],
    })
    // Como las dejaba Payload al borrar una cuenta: sin el vínculo con ella, que
    // su tabla de relaciones se llevó en cascada (ver `borrarPreferenciasDe`).
    await sembrar('payload-preferences', 'preferenciaHuerfana', { key: `huerfana-${marca}`, value: { columnas: [] } })
  })

  afterAll(async () => {
    for (const { coleccion, id } of sembradas) {
      await payload.db.deleteMany({ collection: coleccion, where: { id: { equals: id } } }).catch(() => {})
    }
  })

  it('borra lo de más de doce meses, deja lo de menos y quita los nombres que quedaron', async () => {
    const antes = new Date().toISOString()
    const resultado = await aplicarLaConservacion(payload)
    expect(resultado.accionesVencidas).toBeGreaterThanOrEqual(1)
    expect(resultado.cotizacionesVencidas).toBeGreaterThanOrEqual(1)

    expect(await leer('registro-de-acciones', filas.vieja)).toBeNull()
    expect(await leer('registro-de-acciones', filas.reciente)).not.toBeNull()
    expect(await leer('cotizaciones', filas.cotizacionVieja)).toBeNull()
    expect(await leer('cotizaciones', filas.cotizacionReciente)).not.toBeNull()

    expect(await leer('registro-de-acciones', filas.huerfana)).toMatchObject({
      usuarioNombre: null,
      usuarioCorreo: null,
      rol: 'lector',
    })
    expect(await leer('registro-de-acciones', filas.sobreLaReciente)).toMatchObject({
      titulo: `Institución de Reciente ${marca}`,
    })
    expect(await leer('registro-de-acciones', filas.sobreLaVieja)).toMatchObject({ titulo: null })
    expect(((await leer('difusiones', filas.difusion))!.fallos as Fila[])[0]).toEqual({
      correo: null,
      motivo: `rechazado ${CORREO_RETIRADO}`,
    })
    expect(await leer('payload-preferences', filas.preferenciaHuerfana)).toBeNull()

    // Deja una línea con lo que hizo, a nombre de la pasada y no de nadie.
    const anotada = await payload.find({
      collection: 'registro-de-acciones',
      where: { and: [{ accion: { equals: 'conservacion' } }, { fecha: { greater_than_equal: antes } }] },
      depth: 0,
      overrideAccess: true,
    })
    expect(anotada.docs.length).toBeGreaterThanOrEqual(1)
    expect(anotada.docs[0]).toMatchObject({ usuario: null, origen: 'conservación' })
  })

  it('una segunda pasada no encuentra nada vencido', async () => {
    const resultado = await aplicarLaConservacion(payload)
    expect(resultado.accionesVencidas).toBe(0)
    expect(resultado.cotizacionesVencidas).toBe(0)
  })
})
