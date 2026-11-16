/**
 * Una sesión abierta por cuenta, y las entradas que no parecen de una sola
 * persona (D-374, D-388).
 *
 * Hasta aquí una cuenta podía estar abierta en tantos equipos como quisiera, y
 * prestarla costaba lo que cuesta dictar una contraseña: la plataforma no lo
 * notaba, y el aviso de privacidad y el contrato con cada institución hablan de
 * personas, no de cuentas. Ahora, al entrar, se cierran las demás sesiones de la
 * cuenta, y el equipo que la tenía abierta lo dice. Compartirla obliga a echarse
 * el uno al otro, y eso, que una persona sola no hace, es lo que se avisa.
 *
 * De cada entrada se guarda el equipo, la IP y el país, en la colección
 * `entradas`. Son datos personales nuevos, y por eso el aviso cambió de versión
 * con este cambio y su plazo vive en `conservacion.ts`.
 *
 * Lo de aquí es puro —recibe las cabeceras y la hora, no las lee— para probarlo
 * sin servidor (`tests/unit/entradas.test.ts`). Lo lee también el navegador,
 * por el mensaje que enseña el equipo que se quedó sin sesión.
 */

/**
 * Lo que ve el equipo que tenía la sesión abierta, sea donde sea que se entere:
 * la franja de la plantilla, el aviso en vivo o una acción que ya no pasa.
 *
 * Dice qué pasó y por qué, sin sugerir un ataque: casi siempre es la misma
 * persona en su teléfono. Si no lo fue, lo que tiene que hacer es lo de
 * siempre, y por eso no hace falta decirlo aquí.
 */
export const MENSAJE_DE_OTRA_ENTRADA =
  'Se inició sesión con su cuenta en otro equipo, y en este se cerró. Una cuenta solo puede estar abierta en un equipo a la vez.'

/** Por qué se cerró una sesión, cuando no fue porque caducó. */
export type MotivoDelCierre = 'salio' | 'otra-entrada'

/** Lo que se sabe del equipo desde el que se entra. Cualquiera de los tres puede faltar. */
export interface DatosDelEquipo {
  /** Navegador y sistema, como «Chrome en Windows». Nunca el agente entero (ver `describirEquipo`). */
  equipo: string | null
  ip: string | null
  /** Código ISO de dos letras, el que pone Cloudflare. */
  pais: string | null
}

export const SIN_DATOS_DEL_EQUIPO: DatosDelEquipo = { equipo: null, ip: null, pais: null }

const NAVEGADORES: readonly [RegExp, string][] = [
  // Antes que Chrome: Edge, Opera y Samsung también dicen «Chrome/» en su agente.
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  // Al final: casi todos dicen «Safari/», y solo Safari dice además «Version/».
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
]

const SISTEMAS: readonly [RegExp, string][] = [
  // Antes que macOS y Linux: el iPhone dice «like Mac OS X», y Android, «Linux».
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

/**
 * El equipo en palabras: «Chrome en Windows», «Safari en iPhone».
 *
 * Se guarda esto y no el agente entero a propósito. El agente trae la versión
 * exacta del navegador y del sistema, a veces el modelo del teléfono, y junto
 * con la IP se parece demasiado a una huella del equipo, que es más de lo que
 * hace falta para que un administrador reconozca «el computador del pabellón» y
 * «su teléfono». Y lo que hace falta es justo lo que el aviso promete.
 *
 * Un iPad con iPadOS 13 o posterior se presenta como un Mac de escritorio y sale
 * «Safari en macOS»: no hay forma honrada de distinguirlo sin leer la pantalla
 * desde el navegador.
 */
export function describirEquipo(agente: string | null | undefined): string | null {
  if (!agente) return null
  const navegador = NAVEGADORES.find(([patron]) => patron.test(agente))?.[1] ?? null
  const sistema = SISTEMAS.find(([patron]) => patron.test(agente))?.[1] ?? null
  if (!navegador && !sistema) return null
  return `${navegador ?? 'Navegador desconocido'} en ${sistema ?? 'un sistema desconocido'}`
}

/**
 * El país desde el que llega la petición, si se sabe.
 *
 * Lo dice Cloudflare en `CF-IPCountry`, y solo donde hay túnel. En Contabo todo
 * llega por él y Cloudflare pisa esa cabecera aunque el visitante la mande, así
 * que vale. En un servidor sin túnel, como ved, la puede escribir quien llama:
 * ahí lo peor que se consigue es una alerta de más o una de menos, no entrar.
 * `XX` es como Cloudflare dice «no sé»; `T1`, la red Tor, que sí dice algo.
 */
export function paisDeLaPeticion(cabeceras: Headers): string | null {
  const pais = cabeceras.get('cf-ipcountry')?.trim().toUpperCase()
  if (!pais || !/^[A-Z][A-Z0-9]$/.test(pais) || pais === 'XX') return null
  return pais
}

/**
 * Los tres datos de una petición. La IP sale de `direccionDeQuienLlama`
 * (`ritmo.ts`), la misma que frena los intentos, y se recibe ya leída para que
 * esto siga siendo puro y no importe el módulo del freno en el navegador.
 */
export function datosDeLaPeticion(cabeceras: Headers, ip: string | null): DatosDelEquipo {
  return {
    equipo: describirEquipo(cabeceras.get('user-agent')),
    ip: ip && ip !== 'desconocida' ? ip.slice(0, 64) : null,
    pais: paisDeLaPeticion(cabeceras),
  }
}

/** Lo que `entrar()` deja en el `context` de `payload.login` para el gancho (`sesionUnica.ts`). */
export function datosDelContexto(contexto: unknown): DatosDelEquipo {
  const datos = (contexto as { entrada?: Partial<DatosDelEquipo> } | null | undefined)?.entrada
  if (!datos || typeof datos !== 'object') return SIN_DATOS_DEL_EQUIPO
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return { equipo: texto(datos.equipo), ip: texto(datos.ip), pais: texto(datos.pais) }
}

/**
 * El identificador de sesión (`sid`) que Payload firma dentro del testigo, sin
 * comprobar la firma.
 *
 * Solo para el testigo que se acaba de firmar al entrar, que no viene de nadie.
 * Para leer el de una cookie, que sí, está `testigoVerificado`
 * (`entradasServidor.ts`).
 */
export function sidDelTestigo(testigo: unknown): string | null {
  if (typeof testigo !== 'string') return null
  const cuerpo = testigo.split('.')[1]
  if (!cuerpo) return null
  try {
    const datos = JSON.parse(new TextDecoder().decode(base64UrlABytes(cuerpo))) as { sid?: unknown }
    return typeof datos.sid === 'string' && datos.sid ? datos.sid : null
  } catch {
    return null
  }
}

function base64UrlABytes(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export interface SesionDeLaCuenta {
  id: string
  createdAt?: string | Date | null
  expiresAt: string | Date
}

/**
 * Qué sesiones de la cuenta quedan después de entrar: la nueva, y ninguna más.
 *
 * `cerradas` son las que todavía valían, que son las que hay que anotar como
 * cerradas por otra entrada. Las vencidas se van también, sin anotarse: ya no
 * abrían nada, y Payload las habría quitado él mismo en la siguiente entrada.
 *
 * Si la nueva no está —no debería pasar: Payload la añade antes de este paso—,
 * no se cierra nada. Dejar la cuenta sin ninguna sesión sería echar también a
 * quien acaba de entrar.
 */
export function sesionesQueSeCierran(
  sesiones: readonly SesionDeLaCuenta[],
  sid: string,
  ahora: Date,
): { quedan: SesionDeLaCuenta[]; cerradas: string[] } {
  const nueva = sesiones.filter((s) => s.id === sid)
  if (nueva.length === 0) return { quedan: [...sesiones], cerradas: [] }
  const cerradas = sesiones
    .filter((s) => s.id !== sid && new Date(s.expiresAt).getTime() > ahora.getTime())
    .map((s) => s.id)
  return { quedan: nueva, cerradas }
}

/**
 * Si dos entradas son de equipos distintos. Solo cuando se sabe: un dato que
 * falta no hace distinto a nadie, porque las sesiones de antes de este cambio
 * no tienen ninguno y no deben contar como un equipo más.
 */
export function sonEquiposDistintos(a: Pick<DatosDelEquipo, 'equipo' | 'ip'>, b: Pick<DatosDelEquipo, 'equipo' | 'ip'>): boolean {
  return Boolean((a.equipo && b.equipo && a.equipo !== b.equipo) || (a.ip && b.ip && a.ip !== b.ip))
}

// ------------------------------------------------- las entradas imposibles

/**
 * Dos países en menos de esto no los recorre una persona.
 *
 * Dos horas porque es el vuelo más corto que sale de Santiago a otro país,
 * Mendoza o Buenos Aires, contando el aeropuerto. Una VPN o un viaje que lo
 * logre darán una alerta de más, que el administrador mira y descarta: es un
 * aviso, no un bloqueo.
 */
export const MINUTOS_ENTRE_PAISES = 120

/**
 * Cuántas veces seguidas, y en cuánto tiempo, una entrada puede echar a otro
 * equipo antes de que se avise.
 *
 * Una persona que pasa del computador al teléfono y vuelve echa a su otra
 * sesión una o dos veces, y escribe la contraseña cada vez, que es lo que la
 * hace parar. Dos personas con la misma cuenta se echan la una a la otra cada
 * pocos minutos mientras las dos trabajan.
 */
export const VECES_QUE_ECHAN_A_OTRO_EQUIPO = 3
export const MINUTOS_PARA_CONTAR_LAS_VECES = 60

/** Lo que las reglas miran de cada entrada. */
export interface EntradaParaRevisar {
  fecha: Date
  pais: string | null
  /** Si al entrar cerró una sesión que estaba abierta en otro equipo (`sonEquiposDistintos`). */
  cerroOtroEquipo: boolean
}

/** «40 minutos», «1 hora y 5 minutos»: lo que pasó entre dos entradas. */
export function minutosEnPalabras(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  if (m < 1) return 'menos de un minuto'
  const horas = Math.floor(m / 60)
  const resto = m % 60
  const deMinutos = (n: number) => (n === 1 ? '1 minuto' : `${n} minutos`)
  if (horas === 0) return deMinutos(resto)
  const deHoras = horas === 1 ? '1 hora' : `${horas} horas`
  return resto === 0 ? deHoras : `${deHoras} y ${deMinutos(resto)}`
}

/** «Chile», «Perú»; el código tal cual si el navegador o el servidor no lo conocen. */
export function nombreDelPais(codigo: string): string {
  if (codigo === 'T1') return 'la red Tor'
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

/**
 * Por qué una entrada no parece de una sola persona, en frases para el
 * administrador. Vacío si parece.
 *
 * `anteriores` son las entradas previas de la misma cuenta, en cualquier orden;
 * basta con las de las últimas horas.
 *
 *  - **Otro país, demasiado pronto**: la entrada anterior que sabe de dónde
 *    llegó es de otro país, y de hace menos de `MINUTOS_ENTRE_PAISES`. Se mira
 *    la anterior y no todas, para que cada cambio de país avise una vez y no
 *    otra vez en cada entrada siguiente.
 *  - **Turnarse entre equipos**: esta entrada cerró la sesión de otro equipo,
 *    y en la última hora, contando esta, ya van `VECES_QUE_ECHAN_A_OTRO_EQUIPO`
 *    o más. Si esta no echó a nadie no se vuelve a decir: el turno es el que
 *    echa, y una entrada desde el mismo equipo no lo es.
 */
export function motivosDeAlerta(nueva: EntradaParaRevisar, anteriores: readonly EntradaParaRevisar[]): string[] {
  const motivos: string[] = []
  const antes = anteriores
    .filter((e) => e.fecha.getTime() <= nueva.fecha.getTime())
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  const conPais = antes.find((e) => e.pais)
  if (nueva.pais && conPais?.pais && conPais.pais !== nueva.pais) {
    const minutos = (nueva.fecha.getTime() - conPais.fecha.getTime()) / 60_000
    if (minutos < MINUTOS_ENTRE_PAISES) {
      motivos.push(
        `Entró desde ${nombreDelPais(nueva.pais)} ${minutosEnPalabras(minutos)} después de haber entrado desde ${nombreDelPais(conPais.pais)}.`,
      )
    }
  }

  const desde = nueva.fecha.getTime() - MINUTOS_PARA_CONTAR_LAS_VECES * 60_000
  const veces = [nueva, ...antes].filter((e) => e.cerroOtroEquipo && e.fecha.getTime() >= desde).length
  if (nueva.cerroOtroEquipo && veces >= VECES_QUE_ECHAN_A_OTRO_EQUIPO) {
    motivos.push(
      `En la última hora se entró ${veces} veces con esta cuenta, y cada vez se cerró la sesión que estaba abierta en otro equipo.`,
    )
  }
  return motivos
}

/** Cuánto hay que mirar hacia atrás para aplicar las dos reglas. */
export const MINUTOS_QUE_MIRAN_LAS_REGLAS = Math.max(MINUTOS_ENTRE_PAISES, MINUTOS_PARA_CONTAR_LAS_VECES)

/**
 * Cada cuánto, como mucho, llega por correo una alerta de la misma cuenta. Las
 * que se repiten antes quedan en el registro, pero no llenan el buzón: dos
 * personas que se turnan una tarde entera darían un correo por entrada.
 */
export const HORAS_ENTRE_CORREOS_DE_ALERTA = 24

// ------------------------------------------- en «Usuarios y permisos»

/**
 * Cuánto vale una sesión sin cerrarse. Es el `tokenExpiration` de `Usuarios`, que
 * lo lee de aquí: escrito en los dos sitios, cambiar uno haría que el panel dijera
 * «caducó» de una sesión que se cerró antes, o al revés.
 */
export const HORAS_DE_SESION = 8

/** Cómo terminó una entrada, para la tabla del panel. */
export type FinDeLaEntrada = 'abierta' | MotivoDelCierre | 'caduco' | 'cerrada'

/**
 * Cómo terminó una entrada, o si sigue abierta.
 *
 * Lo anotado manda: «salió» y «se entró en otro equipo» los escriben `salir()` y
 * la entrada siguiente. Sin anotación, la pregunta de si sigue abierta se le
 * hace a la cuenta —`abierta` dice si su sesión está todavía en `sessions`— y no
 * a la fecha: una sesión que se borró antes de tiempo ya no abre nada, aunque
 * no hayan pasado las ocho horas.
 *
 * Lo que queda sin anotación ni sesión es `caduco` si pasaron las ocho horas, y
 * `cerrada` si no. Esa última es casi siempre una contraseña nueva, que vacía
 * las sesiones de la cuenta sin pasar por aquí (`resetPassword` de Payload); se
 * dice con esas palabras y no con un motivo inventado.
 */
export function finDeLaEntrada(
  entrada: { fecha: Date; motivoDelCierre: MotivoDelCierre | null; abierta: boolean },
  ahora: Date,
): FinDeLaEntrada {
  if (entrada.motivoDelCierre) return entrada.motivoDelCierre
  if (entrada.abierta) return 'abierta'
  const vence = entrada.fecha.getTime() + HORAS_DE_SESION * 60 * 60_000
  return vence <= ahora.getTime() ? 'caduco' : 'cerrada'
}

export const ETIQUETAS_DEL_FIN: Record<FinDeLaEntrada, string> = {
  abierta: 'Abierta',
  salio: 'Salió',
  'otra-entrada': 'Se entró en otro equipo',
  caduco: 'Caducó',
  cerrada: 'Se cerró antes de caducar, casi siempre por una contraseña nueva',
}

/** Una entrada como la enseña el panel, ya sin la huella de la sesión. */
export interface EntradaDelPanel {
  id: string
  /** En ISO, para que cruce del servidor al navegador sin perder la zona. */
  fecha: string
  equipo: string | null
  ip: string | null
  pais: string | null
  cerroOtroEquipo: boolean
  fin: FinDeLaEntrada
}

/** Una alerta de la cuenta, del registro de acciones. */
export interface AlertaDelPanel {
  fecha: string
  detalle: string
}
