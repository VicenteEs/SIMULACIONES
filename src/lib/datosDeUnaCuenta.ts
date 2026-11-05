/**
 * Lo que se entrega cuando una persona pide sus datos: el derecho de acceso y
 * el de portabilidad del aviso de privacidad (D-293).
 *
 * Aquí está solo lo que se decide sin base —dónde puede aparecer una cuenta,
 * qué se quita antes de entregar cada fila—, para probarlo sin PostgreSQL. Las
 * consultas están en `datosDeUnaCuentaServidor.ts`, y la descarga, en
 * `/api/cuentas/[id]/datos`.
 *
 * Dos reglas atraviesan todo el archivo:
 *
 *  - **Todo lo de la persona.** El aviso promete «un archivo con todo lo que la
 *    plataforma guarda de ti», y la promesa se rompe en silencio el día que se
 *    agrega una colección con un campo que apunta a `usuarios` y nadie la suma
 *    aquí. Por eso la lista de abajo no se escribe a ciegas: la prueba
 *    `datosDeUnaCuenta.test.ts` recorre las colecciones declaradas y falla si
 *    aparece un campo así que no esté en ella.
 *  - **Nada de los demás.** La fila de una ficha en revisión o de una difusión
 *    lleva datos de otras personas —quién más la firmó, a quién más no le llegó
 *    el correo—, y entregar la fila entera sería responder a una solicitud de
 *    acceso con una filtración. De esas se entrega solo la parte de la persona.
 *    Las contraseñas cifradas y los testigos de sesión tampoco salen: no son
 *    información sobre nadie, son llaves.
 */

/** Una fila tal como la devuelve Payload con `depth: 0`. */
export type Fila = Record<string, unknown>

/**
 * Los campos que apuntan a una cuenta, colección por colección.
 *
 * La ruta con punto (`historial.usuario`) es el campo de dentro de un arreglo,
 * como la escribe una consulta de Payload. `usuarios` no está porque es la
 * cuenta misma, y `cotizaciones` tampoco porque no apunta a ninguna: una
 * cotización se reconoce por el correo, y eso lo resuelve el servidor aparte.
 */
export const CAMPOS_QUE_APUNTAN_A_UNA_CUENTA = {
  actividad: ['usuario'],
  comentarios: ['usuario'],
  difusiones: ['autor'],
  'registro-de-acciones': ['usuario'],
  requisitos: ['autor', 'votos'],
  revisiones: [
    'asignadaA',
    'ultimoEditor',
    'listaPor',
    'firmaMedicoPor',
    'firmaKinesiologoPor',
    'publicadaPor',
    'historial.usuario',
  ],
  'sesiones-de-revision': ['usuario'],
  'tiempo-activo': ['usuario'],
} as const satisfies Record<string, readonly string[]>

export type ColeccionConCuenta = keyof typeof CAMPOS_QUE_APUNTAN_A_UNA_CUENTA

/**
 * Los campos de la cuenta que no se entregan. `hash` y `salt` son la
 * contraseña cifrada: entregarla no informa de nada y abre la puerta a
 * romperla sin conexión. Los testigos —el del enlace para elegir contraseña,
 * el de verificación, una llave de la API— dejarían entrar a quien tenga el
 * archivo. Lo demás, intentos fallidos y bloqueo incluidos, sí es información
 * sobre la persona y el aviso dice que se guarda.
 */
const LLAVES_DE_LA_CUENTA = new Set(['hash', 'salt', 'resetPasswordToken', '_verificationToken', 'apiKey', 'apiKeyIndex'])

/** El identificador de lo que apunta a una cuenta, venga como número, texto o fila poblada. */
function idDe(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor === 'object') return idDe((valor as { id?: unknown }).id)
  return String(valor)
}

const esLaCuenta = (valor: unknown, id: string | number): boolean => idDe(valor) === String(id)

/**
 * La cuenta, sin sus llaves. De las sesiones abiertas quedan cuándo se abrió
 * cada una y cuándo caduca: el identificador de cada sesión es lo que Payload
 * compara con el testigo, y es una llave más.
 */
export function cuentaSinLlaves(cuenta: Fila): Fila {
  const limpia: Fila = {}
  for (const [campo, valor] of Object.entries(cuenta)) {
    if (!LLAVES_DE_LA_CUENTA.has(campo)) limpia[campo] = valor
  }
  if (Array.isArray(cuenta.sessions)) {
    limpia.sessions = cuenta.sessions.map((sesion) => {
      const { createdAt, expiresAt } = (sesion ?? {}) as { createdAt?: unknown; expiresAt?: unknown }
      return { createdAt: createdAt ?? null, expiresAt: expiresAt ?? null }
    })
  }
  return limpia
}

/**
 * Una entrada del registro que otra cuenta dejó sobre esta —su alta, un cambio
 * de rol o de permisos—, sin quién la dejó. Queda el rol de quien la hizo: dice
 * qué tipo de persona tocó la cuenta, que es lo que la persona puede querer
 * saber, sin entregar el nombre ni el correo de un tercero.
 */
export function entradaSobreLaCuenta(entrada: Fila): Fila {
  const { usuario: _usuario, usuarioNombre: _nombre, usuarioCorreo: _correo, permisos: _permisos, ...resto } = entrada
  return resto
}

/** Qué hizo una cuenta en una ficha en revisión, según el campo en que aparece. */
const PAPELES_EN_UNA_REVISION = [
  { campo: 'asignadaA', papel: 'tenía la revisión asignada', fecha: null },
  { campo: 'ultimoEditor', papel: 'la editó por última vez', fecha: 'ultimaEdicion' },
  { campo: 'listaPor', papel: 'la validó', fecha: 'listaEn' },
  { campo: 'firmaMedicoPor', papel: 'la firmó como médico', fecha: 'firmaMedicoEn' },
  { campo: 'firmaKinesiologoPor', papel: 'la firmó como kinesiólogo', fecha: 'firmaKinesiologoEn' },
  { campo: 'publicadaPor', papel: 'la publicó', fecha: 'publicadaEn' },
] as const

/**
 * Lo que mide la plataforma de quien valida una ficha: cuánto tiempo la tuvo
 * abierta, a qué ritmo y si se la señaló por ir demasiado rápido. Es un juicio
 * sobre el trabajo de la persona, y por eso se entrega; pero solo a quien
 * validó, que es de quien habla.
 */
const MEDIDAS_AL_VALIDAR = [
  'segundosActivosAlValidar',
  'segundosAbiertosAlValidar',
  'porcentajeAlValidar',
  'ritmoAlValidar',
  'seccionesVistasAlValidar',
  'seccionesConContenido',
  'validacionRapida',
  'motivosDeAlerta',
] as const

/**
 * Una ficha en revisión reducida a la parte de la persona: qué ficha es, qué
 * hizo en ella y sus entradas del historial. Ni el texto de la ficha, que es
 * contenido y no un dato suyo, ni lo que hicieron los demás.
 */
export function revisionDeLaCuenta(revision: Fila, id: string | number): Fila {
  const papeles = PAPELES_EN_UNA_REVISION.filter((p) => esLaCuenta(revision[p.campo], id)).map((p) => ({
    papel: p.papel,
    fecha: p.fecha ? (revision[p.fecha] ?? null) : null,
  }))
  const historial = (Array.isArray(revision.historial) ? (revision.historial as Fila[]) : [])
    .filter((entrada) => esLaCuenta(entrada?.usuario, id))
    .map(({ id: _id, usuario: _usuario, ...resto }) => resto)

  const fila: Fila = {
    id: revision.id,
    coleccion: revision.coleccion ?? null,
    documentoId: revision.documentoId ?? null,
    titulo: revision.titulo ?? null,
    estado: revision.estado ?? null,
    papeles,
    historial,
  }
  if (esLaCuenta(revision.listaPor, id)) {
    fila.alValidar = Object.fromEntries(MEDIDAS_AL_VALIDAR.map((campo) => [campo, revision[campo] ?? null]))
  }
  return fila
}

/**
 * Una propuesta del buzón de requisitos que la persona escribió. Los votos son
 * cuentas de otros: se entrega cuántos tuvo, no quiénes.
 */
export function propuestaDeLaCuenta(requisito: Fila): Fila {
  const { votos, ...resto } = requisito
  return { ...resto, votosRecibidos: Array.isArray(votos) ? votos.length : 0 }
}

/** Una propuesta que la persona votó: cuál es, y nada de quién la escribió ni quién más la votó. */
export const votoDeLaCuenta = (requisito: Fila): Fila => ({
  id: requisito.id,
  titulo: requisito.titulo ?? null,
  estado: requisito.estado ?? null,
})

/**
 * Una difusión que la persona escribió, sin su cola ni sus envíos fallidos:
 * `pendientes` son las cuentas a las que faltaba escribir y `fallos`, las
 * direcciones de otras personas.
 */
export function difusionDeLaCuenta(difusion: Fila): Fila {
  const { pendientes: _pendientes, fallos: _fallos, ...resto } = difusion
  return resto
}

/**
 * Los envíos de una difusión que no le llegaron a la persona, con el motivo que
 * dio el servidor de correo. Es el único rastro de las difusiones recibidas:
 * de las que sí llegaron solo se guarda la cifra.
 */
export function enviosFallidosA(difusion: Fila, correo: string): Fila[] {
  const buscado = correo.trim().toLowerCase()
  if (!buscado || !Array.isArray(difusion.fallos)) return []
  return (difusion.fallos as Fila[])
    .filter((fallo) => typeof fallo?.correo === 'string' && fallo.correo.trim().toLowerCase() === buscado)
    .map((fallo) => ({
      difusion: difusion.id,
      asunto: difusion.asunto ?? null,
      fecha: difusion.createdAt ?? null,
      motivo: fallo.motivo ?? null,
    }))
}

/** Si una cotización la pidió esta persona: por el correo, sin distinguir mayúsculas. */
export const esCotizacionDe = (cotizacion: Fila, correo: string): boolean =>
  typeof cotizacion.correo === 'string' &&
  correo.trim() !== '' &&
  cotizacion.correo.trim().toLowerCase() === correo.trim().toLowerCase()

/** El nombre del archivo que se descarga: el número de la cuenta y la hora, sin nada que el navegador tenga que escapar. */
export const nombreDelArchivoDeDatos = (id: string | number, marca: string): string =>
  `datos-de-la-cuenta-${id}-${marca}.json`.replace(/[^a-zA-Z0-9._-]/g, '-')

/**
 * Lo que dice el propio archivo de sí mismo. Lo abre la persona, no un
 * programa: sin estas líneas, «tiempoActivo» o «sobreLaCuenta» no le dicen nada
 * a quien no conoce la plataforma.
 */
export const QUE_CONTIENE = {
  cuenta:
    'Los datos de tu cuenta: nombre, correo, institución, rol, permisos, fechas de solicitud, de aceptación del aviso y de último acceso, intentos fallidos de entrada y sesiones abiertas. No incluye tu contraseña: se guarda cifrada y nadie puede leerla.',
  avance: 'Las fichas que abriste o marcaste como leídas y tu avance en el simulador, una fila por ficha o caso.',
  comentarios: 'Los comentarios que dejaste en las fichas.',
  tiempoActivo: 'Tu tiempo activo: segundos por día y por hora, y la última página en que estuviste ese día.',
  registroDeAcciones:
    '«propias» son tus acciones en la plataforma; «sobreLaCuenta», lo que un administrador hizo con tu cuenta (sin decir quién, solo su rol).',
  revision:
    'Si eres o fuiste editor: las fichas que revisaste, firmaste o publicaste, con tus entradas de su historial, y el tiempo que pasaste con cada una.',
  buzonDeRequisitos: 'Si eres o fuiste editor: las propuestas que escribiste en el buzón y las que votaste.',
  difusiones:
    'Los correos masivos que escribiste, si eres administrador, y los que se te enviaron sin llegar, con el motivo que dio el servidor de correo.',
  cotizaciones: 'Las cotizaciones pedidas desde la portada con tu mismo correo.',
  preferencias: 'Preferencias de pantalla guardadas en el servidor.',
  fueraDeLaBase:
    'Tu navegador guarda además una cookie de sesión y algunas preferencias de pantalla en tu propio equipo: no están en el servidor y por eso no aparecen aquí.',
} as const
