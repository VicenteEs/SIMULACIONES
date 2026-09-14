import { AUTORIA } from '@/lib/autoria'

/**
 * La plantilla única de los correos de TraumaHub.
 *
 * Todos los mensajes de la plataforma —la contraseña nueva, la solicitud de
 * cuenta, la activación, la difusión— se describen como datos (`Correo`) y se
 * convierten en HTML aquí, en un solo sitio. Cuando cada correo armaba su propio
 * marcado, el de comentarios salía como tres párrafos sueltos y el de la clave
 * con otro tono: la persona que recibe los dos no sabe que vienen de la misma
 * plataforma, y un correo que no se reconoce es un correo que se marca como
 * correo basura.
 *
 * ## Por qué tablas y estilos en línea
 *
 * Porque los buzones no son navegadores. Gmail borra las hojas de estilo del
 * `<head>` en muchas de sus vistas y Outlook de escritorio pinta con el motor de
 * Word, que no entiende `flex`, ni `max-width` en un `div`, ni márgenes
 * automáticos. Lo único que se ve igual en todos es una tabla con cada estilo
 * escrito en su celda. Parece código de 2005 y es a propósito: una maquetación
 * moderna aquí sale bien en el navegador del que la escribe y rota en el
 * teléfono del residente.
 *
 * ## Sin dependencias de servidor
 *
 * Este archivo no importa nada de Node ni de Payload. Lo usa el servidor para
 * enviar y lo usa el navegador para la vista previa de la difusión, y tiene que
 * ser **la misma función** en los dos lados: una vista previa que se arma con
 * otra plantilla enseña un correo que no es el que se va a mandar.
 */

/** Un trozo del cuerpo del correo. Todo texto que llega aquí se escapa. */
export type BloqueDeCorreo =
  /**
   * `sinEnlaces` para un párrafo que lleva texto de otra persona, como el saludo
   * con el nombre de la cuenta: ver `saludo` en `mensajes.ts`.
   */
  | { tipo: 'parrafo'; texto: string; sinEnlaces?: boolean }
  | { tipo: 'lista'; elementos: string[] }
  /**
   * Pares etiqueta/valor, para los avisos al administrador. Los valores no se
   * enlazan: ver el caso `'datos'` de `bloqueHtml`.
   */
  | { tipo: 'datos'; filas: Array<[string, string]> }
  /** Texto escrito por otra persona: un comentario, el motivo de una solicitud. */
  | { tipo: 'cita'; texto: string }

export interface Correo {
  asunto: string
  /**
   * La línea que Gmail, Outlook y el teléfono muestran junto al asunto antes de
   * abrir el mensaje. Sin ella enseñan el primer texto que encuentran, que en
   * esta plantilla sería el texto alternativo del logotipo.
   */
  resumen: string
  titulo: string
  bloques: BloqueDeCorreo[]
  boton?: { texto: string; enlace: string }
  /** Letra pequeña bajo el botón: cuánto dura el enlace, qué hacer si no fue usted. */
  nota?: string
  /** Por qué le llega esto a quien lo lee. Va en el pie, sobre la autoría. */
  motivoDelEnvio?: string
}

export interface CorreoArmado {
  asunto: string
  html: string
  /**
   * La versión en texto plano. No es cortesía: un correo solo con HTML puntúa
   * peor en los filtros de correo basura, y hay lectores de pantalla y relojes
   * que solo leen esta.
   */
  texto: string
}

/**
 * Identificador del logotipo adjunto dentro del mensaje (`cid:`).
 *
 * El logotipo viaja **dentro** del correo y no como una dirección de la
 * plataforma: Outlook bloquea las imágenes remotas hasta que alguien pulsa
 * «descargar», y la plataforma vive detrás de un túnel que puede estar caído
 * justo cuando se abre el correo. Adjunto, se ve siempre. Lo adjunta
 * `enviarCorreo`, en `src/correo/enviar.ts`.
 */
export const CID_DEL_LOGO = 'logo@traumahub'

/** Los colores de `estilos.css`, repetidos aquí porque un correo no lee variables CSS. */
const COLOR = {
  tinta: '#0c1a38',
  pizarra: '#46587a',
  mudo: '#5a6880',
  papel: '#eef1f7',
  superficie: '#ffffff',
  linea: '#d7dfec',
  marca: '#12509e',
  cian: '#1e9fe0',
  cianTenue: '#e2f3fc',
} as const

const LETRA =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Escapa el texto y convierte en enlace las direcciones `https://` que traiga.
 *
 * Un aviso de difusión casi siempre lleva una dirección («el caso nuevo está en
 * …»), y en texto plano Gmail la enlaza pero Outlook no. Solo `http(s)`: un
 * `javascript:` escrito en el mensaje no puede acabar siendo un enlace pulsable.
 *
 * Las direcciones se buscan en el texto **antes** de escaparlo, y cada trozo se
 * escapa por separado. Al principio se buscaban sobre el texto ya escapado, y
 * ahí las comillas son `&quot;` —letras y un punto y coma que la búsqueda no
 * sabe separar de la dirección—: `"https://…/caso"` salía enlazado a
 * `…/caso"`, que da 404. Lo mismo con las comillas latinas, que no se escapan
 * y que en esta plataforma se escriben en cada frase: `«https://…»` se llevaba
 * el `»` dentro del enlace.
 */
const DIRECCION_EN_TEXTO = /https?:\/\/[^\s<>"'«»]+[^\s<>"'«».,;:!?)\]]/g

function textoConEnlaces(texto: string): string {
  let html = ''
  let desde = 0
  for (const casa of texto.matchAll(DIRECCION_EN_TEXTO)) {
    const url = escaparHtml(casa[0])
    html += `${escaparHtml(texto.slice(desde, casa.index))}<a href="${url}" style="color:${COLOR.marca};text-decoration:underline;">${url}</a>`
    desde = casa.index + casa[0].length
  }
  return html + escaparHtml(texto.slice(desde))
}

/** Los saltos de línea que la persona escribió se respetan dentro del párrafo. */
const conSaltos = (html: string) => html.replace(/\r?\n/g, '<br>')

/**
 * Un enlace de botón solo se acepta si es `http(s)`.
 *
 * El botón de la difusión lo escribe un administrador, y el valor acaba en un
 * `href`. Escapar las comillas impide salirse del atributo, pero no impide un
 * `javascript:alert(1)` perfectamente escapado.
 */
export function esEnlaceSeguro(enlace: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(enlace.trim())
}

function bloqueHtml(bloque: BloqueDeCorreo): string {
  const parrafo = `margin:0 0 16px;font-family:${LETRA};font-size:15px;line-height:1.65;color:${COLOR.pizarra};`
  switch (bloque.tipo) {
    case 'parrafo':
      return `<p style="${parrafo}">${conSaltos(bloque.sinEnlaces ? escaparHtml(bloque.texto) : textoConEnlaces(bloque.texto))}</p>`
    case 'lista':
      return `<ul style="margin:0 0 16px;padding:0 0 0 22px;">${bloque.elementos
        .map(
          (e) =>
            `<li style="margin:0 0 6px;font-family:${LETRA};font-size:15px;line-height:1.6;color:${COLOR.pizarra};">${textoConEnlaces(e)}</li>`,
        )
        .join('')}</ul>`
    // Los valores de estas filas se escapan sin convertir direcciones en enlaces,
    // igual que la cita. Lo que va aquí es el nombre y la institución que
    // escribe en el formulario público cualquiera sin cuenta, o el nombre de
    // quien comenta. Con enlaces, un anónimo podía llamarse «Dr. Pérez, verifique
    // en https://…» y la plataforma le entregaba al administrador un enlace
    // pulsable, con el logotipo y el remitente institucional, justo encima del
    // botón «Revisar la solicitud». Ningún mensaje necesita enlazar un dato.
    case 'datos':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:collapse;">${bloque.filas
        .map(
          ([etiqueta, valor]) =>
            `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${COLOR.linea};font-family:${LETRA};font-size:13px;color:${COLOR.mudo};white-space:nowrap;vertical-align:top;width:1%;">${escaparHtml(etiqueta)}</td><td style="padding:8px 0;border-bottom:1px solid ${COLOR.linea};font-family:${LETRA};font-size:14px;color:${COLOR.tinta};vertical-align:top;">${conSaltos(escaparHtml(valor))}</td></tr>`,
        )
        .join('')}</table>`
    case 'cita':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr><td style="background:${COLOR.cianTenue};border-left:3px solid ${COLOR.cian};padding:12px 16px;font-family:${LETRA};font-size:14px;line-height:1.6;color:${COLOR.tinta};">${conSaltos(escaparHtml(bloque.texto))}</td></tr></table>`
  }
}

function bloqueTexto(bloque: BloqueDeCorreo): string {
  switch (bloque.tipo) {
    case 'parrafo':
      return bloque.texto
    case 'lista':
      return bloque.elementos.map((e) => `  - ${e}`).join('\n')
    case 'datos':
      return bloque.filas.map(([e, v]) => `${e}: ${v}`).join('\n')
    case 'cita':
      return bloque.texto
        .split(/\r?\n/)
        .map((l) => `> ${l}`)
        .join('\n')
  }
}

export interface OpcionesDePlantilla {
  /**
   * De dónde sale la imagen del logotipo: `cid:logo@traumahub` al enviar, una
   * ruta de la plataforma en la vista previa del panel, o `null` para no poner
   * imagen y dejar el nombre escrito.
   */
  logo: string | null
}

/**
 * Convierte la descripción de un correo en el mensaje que se envía.
 */
export function armarCorreo(correo: Correo, { logo }: OpcionesDePlantilla): CorreoArmado {
  const boton =
    correo.boton && esEnlaceSeguro(correo.boton.enlace)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;"><tr><td bgcolor="${COLOR.marca}" style="border-radius:6px;background:${COLOR.marca};"><a href="${escaparHtml(correo.boton.enlace.trim())}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${LETRA};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escaparHtml(correo.boton.texto)}</a></td></tr></table>
         <p style="margin:0 0 18px;font-family:${LETRA};font-size:12.5px;line-height:1.55;color:${COLOR.mudo};">Si el botón no funciona, copie esta dirección en el navegador:<br><a href="${escaparHtml(correo.boton.enlace.trim())}" style="color:${COLOR.marca};word-break:break-all;">${escaparHtml(correo.boton.enlace.trim())}</a></p>`
      : ''

  const nota = correo.nota
    ? `<p style="margin:0;padding-top:16px;border-top:1px solid ${COLOR.linea};font-family:${LETRA};font-size:13px;line-height:1.6;color:${COLOR.mudo};">${conSaltos(textoConEnlaces(correo.nota))}</p>`
    : ''

  const cabecera = logo
    ? `<img src="${escaparHtml(logo)}" width="150" alt="TraumaHub" style="display:block;width:150px;max-width:150px;height:auto;border:0;margin:0 auto;font-family:${LETRA};font-size:22px;font-weight:700;color:${COLOR.tinta};">`
    : `<span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:${COLOR.tinta};letter-spacing:-0.01em;">TraumaHub</span>`

  const motivo = correo.motivoDelEnvio
    ? `${escaparHtml(correo.motivoDelEnvio)}<br>`
    : ''

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escaparHtml(correo.asunto)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.papel};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escaparHtml(correo.resumen)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.papel}" style="background:${COLOR.papel};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td bgcolor="${COLOR.superficie}" style="background:${COLOR.superficie};border:1px solid ${COLOR.linea};border-radius:12px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td height="4" bgcolor="${COLOR.marca}" style="height:4px;line-height:4px;font-size:0;background:${COLOR.marca};">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 20px;border-bottom:1px solid ${COLOR.linea};">${cabecera}</td></tr>
<tr><td style="padding:30px 32px 30px;">
<h1 style="margin:0 0 18px;font-family:${LETRA};font-size:22px;line-height:1.3;font-weight:650;color:${COLOR.tinta};">${escaparHtml(correo.titulo)}</h1>
${correo.bloques.map(bloqueHtml).join('\n')}
${boton}
${nota}
</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:20px 24px 8px;font-family:${LETRA};font-size:12px;line-height:1.7;color:${COLOR.mudo};">
${motivo}<strong style="color:${COLOR.pizarra};">TraumaHub</strong> · Plataforma docente de traumatología<br>
Desarrollado por ${escaparHtml(AUTORIA.nombre)} · <a href="mailto:${AUTORIA.correo}" style="color:${COLOR.marca};text-decoration:none;">${AUTORIA.correo}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const partes = [
    correo.titulo,
    '',
    ...correo.bloques.flatMap((b) => [bloqueTexto(b), '']),
    ...(correo.boton && esEnlaceSeguro(correo.boton.enlace)
      ? [`${correo.boton.texto}: ${correo.boton.enlace.trim()}`, '']
      : []),
    ...(correo.nota ? [correo.nota, ''] : []),
    '--',
    ...(correo.motivoDelEnvio ? [correo.motivoDelEnvio] : []),
    'TraumaHub · Plataforma docente de traumatología',
    `Desarrollado por ${AUTORIA.nombre} · ${AUTORIA.correo}`,
  ]

  return { asunto: correo.asunto, html, texto: partes.join('\n') }
}

/**
 * Convierte lo que un administrador escribe en un cuadro de texto en bloques.
 *
 * Las reglas son las que cualquiera usa sin que se las expliquen: una línea en
 * blanco separa párrafos, y las líneas que empiezan por «- » o «• » forman una
 * lista. No hay negritas ni títulos a propósito: cada marca que se admite es
 * una marca que alguien escribe sin querer y sale convertida.
 */
export function bloquesDesdeTexto(texto: string): BloqueDeCorreo[] {
  const bloques: BloqueDeCorreo[] = []
  for (const trozo of texto.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lineas = trozo.split('\n').filter((l) => l.trim() !== '')
    if (lineas.length === 0) continue
    let parrafo: string[] = []
    let lista: string[] = []
    const cerrarParrafo = () => {
      if (parrafo.length) bloques.push({ tipo: 'parrafo', texto: parrafo.join('\n') })
      parrafo = []
    }
    const cerrarLista = () => {
      if (lista.length) bloques.push({ tipo: 'lista', elementos: lista })
      lista = []
    }
    for (const linea of lineas) {
      const item = /^\s*[-•*]\s+(.*)$/.exec(linea)
      if (item) {
        cerrarParrafo()
        lista.push(item[1].trim())
      } else {
        cerrarLista()
        parrafo.push(linea.trim())
      }
    }
    cerrarParrafo()
    cerrarLista()
  }
  return bloques
}
