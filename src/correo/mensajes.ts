import { AUTORIA } from '@/lib/autoria'
import { bloquesDesdeTexto, type BloqueDeCorreo, type Correo } from './plantilla'

/**
 * Lo que dice cada correo de la plataforma.
 *
 * Aquí está el texto y nada más: la forma la pone `armarCorreo` y el envío
 * `enviarCorreo`. Separado así, cambiar una frase no obliga a tocar marcado ni
 * transporte, y la vista previa de la difusión arma exactamente el mismo
 * mensaje que después sale.
 *
 * Los enlaces llegan ya absolutos. Estas funciones no saben cuál es la dirección
 * pública de la plataforma a propósito: la sabe el servidor
 * (`direccionPublica()`, en `src/collections/Usuarios.ts`), y este archivo lo
 * importa también el navegador.
 *
 * Trato de usted en todos, como el resto de la plataforma.
 */

const MOTIVO_CUENTA = 'Recibe este correo porque tiene una cuenta en TraumaHub.'
const MOTIVO_SOLICITUD = 'Recibe este correo porque alguien pidió una cuenta en TraumaHub con esta dirección.'

/**
 * «Hola, Ana.» o «Hola.» si no hay nombre: nunca «Hola, .».
 *
 * El nombre lo escribió otra persona —quien pidió la cuenta en `/registro`, o
 * quien la creó en el panel—, así que va en un párrafo que no convierte
 * direcciones en enlaces y en una sola línea. Con enlaces, un «nombre» como
 * «su clave vence hoy, renuévela en https://…» salía pulsable en un correo con
 * el logotipo y el remitente de la plataforma. `solicitarCuenta` ya rechaza esos
 * nombres al pedir la cuenta; esto cubre también los que no pasan por ahí.
 */
const saludo = (nombre?: string): BloqueDeCorreo => {
  const limpio = (nombre ?? '').replace(/\s+/g, ' ').trim()
  return { tipo: 'parrafo', texto: limpio ? `Hola, ${limpio}.` : 'Hola.', sinEnlaces: true }
}

export function mensajeDeClaveNueva(enlace: string): Correo {
  return {
    asunto: 'TraumaHub · Elegir una contraseña nueva',
    resumen: 'El enlace para elegir su contraseña nueva. Dura una hora.',
    titulo: 'Elegir una contraseña nueva',
    bloques: [
      {
        tipo: 'parrafo',
        texto: 'Alguien pidió una contraseña nueva para su cuenta de TraumaHub. Pulse el botón para elegirla.',
      },
    ],
    boton: { texto: 'Elegir mi contraseña', enlace },
    nota:
      'El enlace sirve una sola vez y caduca en una hora. Si no fue usted, no haga nada: su contraseña actual sigue siendo válida.',
    motivoDelEnvio: MOTIVO_CUENTA,
  }
}

export function mensajeDeBienvenida(datos: { nombre: string; enlace: string; horas: number }): Correo {
  return {
    asunto: 'TraumaHub · Su cuenta está lista',
    resumen: 'Le crearon una cuenta en TraumaHub. Elija su contraseña para entrar.',
    titulo: 'Bienvenido a TraumaHub',
    bloques: [
      saludo(datos.nombre),
      {
        tipo: 'parrafo',
        texto:
          'Un administrador le creó una cuenta en TraumaHub, la plataforma docente de traumatología: biblioteca de patologías, examen físico, técnica AO, simulador quirúrgico y lectura de imágenes.',
      },
      { tipo: 'parrafo', texto: 'Para entrar, elija su contraseña con el botón.' },
    ],
    boton: { texto: 'Elegir mi contraseña', enlace: datos.enlace },
    nota: `El enlace sirve una sola vez y caduca en ${datos.horas} horas. Si caduca, use «¿Olvidó su contraseña?» en la pantalla de entrada con este mismo correo.`,
    motivoDelEnvio: MOTIVO_CUENTA,
  }
}

export function mensajeDeSolicitudRecibida(datos: { nombre: string }): Correo {
  return {
    asunto: 'TraumaHub · Recibimos su solicitud',
    resumen: 'Su solicitud de cuenta quedó registrada. Le avisaremos cuando esté activa.',
    titulo: 'Recibimos su solicitud',
    bloques: [
      saludo(datos.nombre),
      {
        tipo: 'parrafo',
        texto:
          'Su solicitud de cuenta en TraumaHub quedó registrada. Un administrador la revisará y, cuando la active, le llegará otro correo para avisarle.',
      },
      {
        tipo: 'parrafo',
        texto: 'Mientras tanto no hace falta hacer nada. Si intenta entrar antes, la plataforma le dirá que la cuenta todavía no está activada.',
      },
    ],
    nota: `Si no pidió esta cuenta, puede ignorar este mensaje o escribir a ${AUTORIA.correo}.`,
    motivoDelEnvio: MOTIVO_SOLICITUD,
  }
}

/**
 * Lo que recibe el titular de un correo que ya tiene cuenta cuando alguien pide
 * otra con esa dirección.
 *
 * La pantalla de solicitud contesta lo mismo exista o no la cuenta —decir «ese
 * correo ya está registrado» la convierte en un comprobador de quién tiene
 * acceso—, así que la verdad se le dice aquí, en el buzón, que solo lee el
 * titular.
 */
export function mensajeDeCuentaYaExistente(datos: { enlaceEntrar: string; enlaceClave: string }): Correo {
  return {
    asunto: 'TraumaHub · Ya tiene una cuenta',
    resumen: 'Alguien pidió una cuenta con su correo, pero ya tiene una.',
    titulo: 'Ya tiene una cuenta',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'Alguien pidió una cuenta nueva en TraumaHub con esta dirección, pero ya existe una cuenta con ella. No se creó ninguna otra.',
      },
      {
        tipo: 'parrafo',
        texto: `Si fue usted, entre con su contraseña. Si no la recuerda, pida una nueva aquí: ${datos.enlaceClave}`,
      },
    ],
    boton: { texto: 'Ir a la pantalla de entrada', enlace: datos.enlaceEntrar },
    nota: 'Si no fue usted, no haga nada: su cuenta y su contraseña siguen como estaban.',
    motivoDelEnvio: MOTIVO_SOLICITUD,
  }
}

export function mensajeDeNuevaSolicitud(datos: {
  nombre: string
  correo: string
  institucion?: string
  motivo?: string
  enlacePanel: string
}): Correo {
  return {
    asunto: `TraumaHub · Nueva solicitud de cuenta: ${datos.nombre}`,
    resumen: `${datos.nombre} (${datos.correo}) pidió una cuenta y espera su activación.`,
    titulo: 'Nueva solicitud de cuenta',
    bloques: [
      {
        tipo: 'parrafo',
        texto: 'Una persona pidió una cuenta en TraumaHub. La cuenta existe pero no puede entrar hasta que un administrador la active.',
      },
      {
        tipo: 'datos',
        filas: [
          ['Nombre', datos.nombre],
          ['Correo', datos.correo],
          ['Institución', datos.institucion?.trim() || '—'],
        ],
      },
      ...(datos.motivo?.trim()
        ? ([{ tipo: 'parrafo', texto: 'Lo que escribió al pedirla:' }, { tipo: 'cita', texto: datos.motivo.trim() }] as const)
        : []),
    ],
    boton: { texto: 'Revisar la solicitud', enlace: datos.enlacePanel },
    nota: 'Antes de activarla, compruebe que la persona es quien dice ser: la plataforma no verifica la identidad de quien pide la cuenta.',
    motivoDelEnvio: 'Recibe este correo porque es administrador de TraumaHub.',
  }
}

export function mensajeDeCuentaActivada(datos: { nombre: string; enlaceEntrar: string }): Correo {
  return {
    asunto: 'TraumaHub · Su cuenta ya está activa',
    resumen: 'Un administrador activó su cuenta. Ya puede entrar.',
    titulo: 'Su cuenta ya está activa',
    bloques: [
      saludo(datos.nombre),
      {
        tipo: 'parrafo',
        texto: 'Un administrador revisó su solicitud y activó su cuenta en TraumaHub. Ya puede entrar con su correo y la contraseña que eligió.',
      },
    ],
    boton: { texto: 'Entrar a TraumaHub', enlace: datos.enlaceEntrar },
    nota: 'Si no recuerda la contraseña, use «¿Olvidó su contraseña?» en la pantalla de entrada.',
    motivoDelEnvio: MOTIVO_CUENTA,
  }
}

export function mensajeDeSolicitudRechazada(datos: { nombre: string }): Correo {
  return {
    asunto: 'TraumaHub · Sobre su solicitud de cuenta',
    resumen: 'Su solicitud de cuenta no fue aprobada.',
    titulo: 'Su solicitud no fue aprobada',
    bloques: [
      saludo(datos.nombre),
      {
        tipo: 'parrafo',
        texto:
          'Un administrador revisó su solicitud de cuenta en TraumaHub y no la aprobó. Los datos que envió se eliminaron.',
      },
      {
        tipo: 'parrafo',
        texto: `Si cree que es un error, escriba a ${AUTORIA.correo} indicando su nombre, su institución y para qué necesita el acceso.`,
      },
    ],
    motivoDelEnvio: MOTIVO_SOLICITUD,
  }
}

export function mensajeDeComentarioNuevo(datos: {
  autor: string
  modulo: string
  texto: string
  enlacePanel: string
}): Correo {
  return {
    asunto: `TraumaHub · Nuevo comentario en ${datos.modulo}`,
    resumen: `${datos.autor} dejó un comentario en ${datos.modulo}.`,
    titulo: 'Nuevo comentario',
    bloques: [
      { tipo: 'datos', filas: [['Autor', datos.autor], ['Módulo', datos.modulo]] },
      { tipo: 'cita', texto: datos.texto },
    ],
    boton: { texto: 'Abrir los comentarios', enlace: datos.enlacePanel },
    motivoDelEnvio: 'Recibe este correo porque es administrador de TraumaHub.',
  }
}

export interface DatosDeDifusion {
  asunto: string
  mensaje: string
  boton?: { texto: string; enlace: string }
}

/**
 * Un aviso escrito por un administrador para todas las cuentas.
 *
 * El saludo lleva el nombre de cada destinatario: cada correo sale por separado,
 * nunca con la lista de direcciones a la vista (ver `src/correo/difusion.ts`).
 */
export function mensajeDeDifusion(datos: DatosDeDifusion, nombre?: string): Correo {
  return {
    asunto: datos.asunto,
    resumen: datos.mensaje.replace(/\s+/g, ' ').trim().slice(0, 140),
    titulo: datos.asunto,
    bloques: [saludo(nombre), ...bloquesDesdeTexto(datos.mensaje)],
    boton: datos.boton?.texto.trim() && datos.boton.enlace.trim() ? datos.boton : undefined,
    motivoDelEnvio: MOTIVO_CUENTA,
  }
}

export function mensajeDePrueba(datos: { quien: string; servidor: string }): Correo {
  return {
    asunto: 'TraumaHub · Correo de prueba',
    resumen: 'Si lee esto, el correo saliente de la plataforma funciona.',
    titulo: 'El correo saliente funciona',
    bloques: [
      {
        tipo: 'parrafo',
        texto: 'Si está leyendo esto, la plataforma pudo entregar un correo con la configuración actual.',
      },
      { tipo: 'datos', filas: [['Pedido por', datos.quien], ['Servidor', datos.servidor]] },
      {
        tipo: 'parrafo',
        texto: 'Revise también que no haya caído en correo no deseado. Si cayó ahí, falta configurar SPF y DKIM en el dominio (ver docs/CORREO.md).',
      },
    ],
    motivoDelEnvio: 'Recibe este correo porque lo pidió desde el panel de TraumaHub.',
  }
}
