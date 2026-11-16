import { cache } from 'react'
import { headers as siguientesCabeceras, cookies as siguientesCookies } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { COOKIE_VISTA_PREVIA, rolEfectivo } from '@/lib/vistaPrevia'
import type { Rol } from '@/access/reglas'
import { comoValeEnElLugar } from '@/access/reglas'
import { comoSoporte, idDeInstitucion } from '@/access/payload'
import { testigoDeLaPeticion } from '@/lib/cookieDeSesion'
import { motivoDelCierre } from '@/lib/entradasServidor'
import { lugarDeLaPeticion, type LugarDeLaPeticion } from '@/lib/institucionesServidor'
import { estaBloqueada } from '@/lib/instituciones'

export interface Sesion {
  usuario: Record<string, unknown> | null
  activo: boolean
  rolReal: Rol | null
  rol: Rol | null
  simulando: boolean
  /**
   * Sin sesión, si es porque se entró con la cuenta en otro equipo (D-388): la
   * cookie sigue aquí, pero su sesión ya no. Lo pinta la plantilla
   * (`AvisoDeSesionCerrada`) y lo dicen las guardias de las acciones.
   */
  cierre?: 'otra-entrada' | null
  /**
   * Dónde está la petición (D-396): el subdominio y su institución. Opcional
   * para las pruebas que imitan una sesión; la de verdad lo trae siempre.
   */
  lugar?: LugarDeLaPeticion
}

/**
 * La cuenta de la petición, si vale en el lugar al que llega (D-396), con lo
 * que se leyó para decidirlo.
 *
 * Una cuenta de otra institución, o una central en el subdominio de una, es
 * aquí como no tener sesión. No se le dice por qué: la cookie de sesión es de
 * cada anfitrión, y si llega una de otro lado alguien la trajo. En un
 * subdominio sin institución no vale ninguna, la central tampoco, aunque sus
 * dos lados digan «ninguna institución».
 *
 * En una institución bloqueada (D-403) tampoco vale ninguna: la sesión abierta
 * antes de vencer deja de servir en la petición siguiente, sin esperar a que
 * caduque su testigo.
 *
 * La excepción es el administrador de TraumaHub en una institución abierta: el
 * fantasma (D-371, D-404). Sale como `comoSoporte` lo deja, con la institución
 * del lugar en la suya, así que todo lo que pregunta por la institución de la
 * cuenta —las guardias, el filtro de las reglas, la marca de lo que crea— lo
 * trata como al administrador de esa institución. Su cuenta, en la base, sigue
 * siendo de TraumaHub, y por eso no aparece en las listas de la institución.
 *
 * Es lo que tiene que preguntar toda ruta que mire la sesión, en vez de
 * `payload.auth` a secas: `payload.auth` cree cualquier testigo firmado, venga
 * de donde venga. Solo `salir` lo llama directo, porque matar la sesión vale
 * en cualquier parte.
 */
export async function cuentaEnSuLugar(
  payload: Payload,
  cabeceras: Headers,
): Promise<{ user: Record<string, unknown> | null; delTestigo: Record<string, unknown> | null; lugar: LugarDeLaPeticion }> {
  const lugar = await lugarDeLaPeticion(payload, cabeceras)
  const delTestigo = ((await payload.auth({ headers: cabeceras })).user ?? null) as Record<string, unknown> | null
  const enUnSubdominioQueNoExiste = lugar.subdominio !== '' && lugar.institucion === null
  const como =
    delTestigo !== null && !enUnSubdominioQueNoExiste && !(lugar.institucion && estaBloqueada(lugar.institucion.vence))
      ? comoValeEnElLugar(delTestigo.rol, idDeInstitucion(delTestigo.institucion), lugar.institucion?.id ?? null)
      : null
  const user =
    como === 'propia'
      ? delTestigo
      : // Con `activo` además: una cuenta de TraumaHub dada de baja no es soporte
        // de nadie, y sin esto pasaría por administrador de la institución en
        // las páginas que no miran `activo`.
        como === 'soporte' && delTestigo?.activo === true && lugar.institucion
        ? comoSoporte(delTestigo, lugar.institucion.id)
        : null
  return { user, delTestigo, lugar }
}

/**
 * Sesión resuelta, con la vista previa de rol ya aplicada.
 *
 * Devuelve además un usuario con el rol efectivo, listo para pasárselo a las
 * consultas: así, cuando un editor mira «como residente», la propia base filtra
 * los borradores en lugar de que la página los oculte por su cuenta. Eso es lo
 * que hace fiable la vista previa: enseña exactamente lo que el residente
 * recibiría, no una imitación.
 *
 * Con `cache` de React, una vez por petición. La llaman la plantilla, la página,
 * la guardia del panel y la barra en el mismo pintado, y cada llamada era un
 * `payload.auth`: verificar el testigo y leer la cuenta de la base, tres o
 * cuatro veces para contestar lo mismo. `cache` solo dura lo que dura la
 * petición, así que una baja o un cambio de rol se ven en la siguiente, igual
 * que antes. Fuera de un pintado de servidor —las pruebas— no guarda nada y
 * cada llamada vuelve a preguntar.
 */
export const obtenerSesion = cache(async function obtenerSesion(): Promise<
  Sesion & { usuarioEfectivo: unknown }
> {
  const payload = await getPayload({ config })
  const cabeceras = await siguientesCabeceras()
  const { user, delTestigo, lugar } = await cuentaEnSuLugar(payload, cabeceras)

  if (!user) {
    // Solo cuando hay cookie y no hay sesión, que es raro: quien nunca entró no
    // paga la consulta. `motivoDelCierre` no lanza.
    const testigo = await testigoDeLaPeticion(cabeceras)
    const motivo = testigo ? await motivoDelCierre(payload, testigo) : null
    return {
      usuario: null,
      activo: false,
      rolReal: null,
      rol: null,
      simulando: false,
      usuarioEfectivo: null,
      cierre: motivo === 'otra-entrada' && !delTestigo ? motivo : null,
      lugar,
    }
  }

  const registro = user as unknown as Record<string, unknown>
  const activo = registro.activo === true
  const rolReal = (registro.rol as Rol) ?? 'lector'

  const galleta = (await siguientesCookies()).get(COOKIE_VISTA_PREVIA)?.value
  const rol = rolEfectivo(rolReal, galleta)

  return {
    usuario: registro,
    activo,
    rolReal,
    rol,
    simulando: rol !== rolReal,
    usuarioEfectivo: { ...registro, rol },
    lugar,
  }
})
