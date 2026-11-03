/**
 * Lo que comparten los formularios que cualquiera puede mandar sin cuenta:
 * la solicitud de cuenta (`solicitarCuenta`, D-119) y la cotización
 * (`pedirCotizacion`, P-007 E3).
 *
 * Vivía dentro de `acciones/sesion.ts`, que era el único. Con el segundo se
 * sacó aquí y no se copió: una regla contra el abuso que se corrige en un
 * formulario y no en el otro deja abierto justo el que nadie mira.
 *
 * Los comentarios de cada pieza hablan de la solicitud de cuenta porque ahí se
 * decidió; en la cotización valen igual: también acaba en un acuse que sale
 * del buzón real de la plataforma hacia la dirección que alguien escribió.
 */

/**
 * Lo que un nombre o una institución no pueden traer: algo que un cliente de
 * correo convierta en enlace, o un salto de línea.
 *
 * El nombre acaba en el saludo del acuse, que sale desde el buzón real de la
 * plataforma hacia la dirección que la persona escribió, sea suya o no. La
 * plantilla enlaza las direcciones `https://` de los párrafos y convierte los
 * saltos en `<br>`, de modo que sin esto `solicitarCuenta` era un servicio
 * público para mandar, firmado con el dominio de la plataforma, «Hola, su clave
 * vence hoy, renuévela en https://…» a cualquiera. Treinta por hora bastan para
 * quemar la reputación de la cuenta de cPanel, y con ella la recuperación de
 * contraseña de todos.
 *
 * Se rechaza aquí y no solo se escapa en la plantilla porque la plantilla no es
 * el único que enlaza: Gmail y Outlook convierten en enlace un `www.` o un
 * dominio suelto por su cuenta, también en la parte de texto plano. Por eso
 * entran los dominios sin esquema, con dos límites a sabiendas. Uno con ruta se
 * detecta en cualquier caja («EVIL.CL/entrar», «t.co/x»). Uno suelto, solo en
 * minúsculas, porque en mayúsculas choca con las abreviaturas sin espacio que
 * se escriben de verdad en este gremio («Dra.Soto», «U.Chile») y un residente
 * rechazado por escribir su nombre es peor que un «EVIL.COM» que casi ningún
 * buzón pinta como enlace. El mensaje dice cómo salir del falso positivo que
 * queda («dra.soto» en minúsculas).
 *
 * El motivo no pasa por aquí: va en un bloque `cita`, que se escapa sin
 * enlazar, y solo lo leen los administradores.
 */
export const PARECE_ENLACE = new RegExp(
  [
    String.raw`\p{Cc}`,
    String.raw`:\/\/`,
    String.raw`[wW]{3}\.`,
    '@',
    String.raw`[\p{L}\p{N}-]\.\p{L}{2,}\/`,
    String.raw`[a-z0-9-]\.[a-z]{2,24}(?![\p{L}\p{N}])`,
  ].join('|'),
  'u',
)

export function exigirSinEnlaces(texto: string, que: string): string {
  if (PARECE_ENLACE.test(texto)) {
    throw new Error(
      `${que} no puede llevar direcciones web, correos ni saltos de línea. ` +
        'Si abrevia, deje un espacio después del punto.',
    )
  }
  return texto
}

/**
 * Lo mínimo que tarda en contestar una solicitud que llegó a mirar la base, o
 * que cayó en el campo trampa y tiene que parecer una que sí llegó.
 *
 * Crear la cuenta cuesta el `pbkdf2` de la contraseña —25 000 iteraciones, unos
 * 70 ms en el equipo de desarrollo y más en el servidor—, la escritura, sus
 * ganchos y la búsqueda de administradores; responder a un correo que ya existe
 * cuesta una consulta. Con la misma respuesta pero no el mismo tiempo, el
 * cronómetro volvía a decir quién tiene cuenta, que es lo que la respuesta
 * idéntica pretende callar. Calcular un hash de relleno en el camino corto no
 * alcanza: iguala el `pbkdf2`, pero no la escritura ni los ganchos, que cambian
 * con la carga de la base.
 *
 * Un suelo de segundo y medio sobra para todo eso con margen, y a una persona
 * que acaba de rellenar seis campos no le pesa. Si algún día crear pasa de ese
 * tiempo, la diferencia reaparece: se sube el suelo, no se quita.
 */
export const DEMORA_MINIMA_MS = 1500

/** Espera lo que falte para `DEMORA_MINIMA_MS` desde `inicio`. */
export async function esperarElSuelo(inicio: number): Promise<void> {
  const falta = inicio + DEMORA_MINIMA_MS - Date.now()
  if (falta > 0) await new Promise((listo) => setTimeout(listo, falta))
}
