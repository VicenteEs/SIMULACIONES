import { describe, expect, it } from 'vitest'
import { AUTORIA } from '@/lib/autoria'
import {
  armarCorreo,
  bloquesDesdeTexto,
  CID_DEL_LOGO,
  esEnlaceSeguro,
  type Correo,
} from '@/correo/plantilla'
import {
  mensajeDeBienvenida,
  mensajeDeCuentaActivada,
  mensajeDeDifusion,
  mensajeDeSolicitudRecibida,
  mensajeDeSolicitudRechazada,
} from '@/correo/mensajes'

describe('el nombre de la cuenta en el saludo', () => {
  // El nombre lo escribe otra persona. Con enlaces, un «nombre» con una
  // dirección salía pulsable en un correo con el logotipo de la plataforma.
  const NOMBRE = 'Su clave vence hoy, renuévela en https://falso.example/login\nOtra línea'
  const correos = [
    mensajeDeSolicitudRecibida({ nombre: NOMBRE }),
    mensajeDeCuentaActivada({ nombre: NOMBRE, enlaceEntrar: 'https://traumahub.cl/entrar' }),
    mensajeDeSolicitudRechazada({ nombre: NOMBRE }),
    mensajeDeBienvenida({ nombre: NOMBRE, enlace: 'https://traumahub.cl/clave/x', horas: 72 }),
    mensajeDeDifusion({ asunto: 'Aviso', mensaje: 'Texto con https://traumahub.cl/caso' }, NOMBRE),
  ]

  it.each(correos.map((c) => [c.asunto, c]))('«%s» no enlaza la dirección del nombre ni parte la línea', (_, correo) => {
    const { html } = armarCorreo(correo, { logo: null })
    expect(html).not.toContain('href="https://falso.example')
    expect(html).toContain('renuévela en https://falso.example/login Otra línea.')
  })

  it('el mensaje de la difusión sí enlaza sus direcciones: solo el nombre va sin enlaces', () => {
    const { html } = armarCorreo(correos[4], { logo: null })
    expect(html).toContain('href="https://traumahub.cl/caso"')
  })
})

/**
 * La plantilla única de los correos (`src/correo/plantilla.ts`).
 *
 * Casi todo lo que entra en ella lo escribe alguien que no es el programador:
 * el residente que comenta, quien pide una cuenta y cuenta su motivo, el
 * administrador que redacta una difusión. Y lo que sale es HTML que se abre en
 * el buzón de otra persona. Por eso lo primero que se prueba es que ningún
 * campo llega sin escapar, campo por campo: basta con que uno se olvide para
 * que un comentario con etiquetas se convierta en marcado —o en un enlace
 * falso con el logotipo de la plataforma encima— en el correo del
 * administrador.
 */

/** Un correo con una etiqueta distinta en cada campo, para saber cuál se escapó mal. */
const correoConEtiquetas = (): Correo => ({
  asunto: '<i id="asunto">',
  resumen: '<i id="resumen">',
  titulo: '<i id="titulo">',
  bloques: [
    { tipo: 'parrafo', texto: '<i id="parrafo">' },
    { tipo: 'lista', elementos: ['<i id="lista">'] },
    { tipo: 'datos', filas: [['<i id="etiqueta">', '<i id="valor">']] },
    { tipo: 'cita', texto: '<i id="cita">' },
  ],
  boton: { texto: '<i id="boton">', enlace: 'https://traumahub.cl/entrar' },
  nota: '<i id="nota">',
  motivoDelEnvio: '<i id="motivo">',
})

describe('todo texto de usuario sale escapado en el HTML', () => {
  const { html } = armarCorreo(correoConEtiquetas(), { logo: null })

  it.each(['asunto', 'resumen', 'titulo', 'parrafo', 'lista', 'etiqueta', 'valor', 'cita', 'boton', 'nota', 'motivo'])(
    'el campo «%s»',
    (campo) => {
      expect(html).not.toContain(`<i id="${campo}">`)
      expect(html).toContain(`&lt;i id=&quot;${campo}&quot;&gt;`)
    },
  )

  it('las comillas del enlace del botón no salen del atributo', () => {
    const { html: conComillas } = armarCorreo(
      { ...correoConEtiquetas(), boton: { texto: 'Ir', enlace: 'https://traumahub.cl/"onmouseover="alert(1)' } },
      { logo: null },
    )
    expect(conComillas).not.toContain('"onmouseover="')
  })
})

describe('el botón', () => {
  it('con un enlace javascript: no se pinta, ni en el HTML ni en el texto', () => {
    const correo = { ...correoConEtiquetas(), boton: { texto: 'Pulse aquí', enlace: 'javascript:alert(1)' } }
    const { html, texto } = armarCorreo(correo, { logo: null })
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('Pulse aquí')
    expect(texto).not.toContain('javascript:')
  })

  it('esEnlaceSeguro solo admite http y https', () => {
    expect(esEnlaceSeguro('https://traumahub.cl/x')).toBe(true)
    expect(esEnlaceSeguro(' http://localhost:3000/x ')).toBe(true)
    expect(esEnlaceSeguro('javascript:alert(1)')).toBe(false)
    expect(esEnlaceSeguro('data:text/html,<b>')).toBe(false)
    expect(esEnlaceSeguro('/admin-panel/comentarios')).toBe(false)
    expect(esEnlaceSeguro('https://traumahub.cl/con espacio')).toBe(false)
  })

  it('con un enlace válido se pinta, y también la dirección para copiarla a mano', () => {
    const { html } = armarCorreo(
      { ...correoConEtiquetas(), boton: { texto: 'Entrar', enlace: 'https://traumahub.cl/entrar' } },
      { logo: null },
    )
    expect(html.match(/href="https:\/\/traumahub\.cl\/entrar"/g)?.length).toBe(2)
    expect(html).toContain('>Entrar</a>')
  })
})

describe('las direcciones escritas en el texto', () => {
  const html = (texto: string) =>
    armarCorreo({ ...correoConEtiquetas(), bloques: [{ tipo: 'parrafo', texto }] }, { logo: null }).html

  it('una https se convierte en enlace, con el & escapado dentro del atributo', () => {
    expect(html('El caso está en https://traumahub.cl/caso?id=1&vista=2 desde hoy.')).toContain(
      '<a href="https://traumahub.cl/caso?id=1&amp;vista=2"',
    )
  })

  it('la puntuación que la sigue no entra en el enlace', () => {
    expect(html('Véalo en https://traumahub.cl/caso.')).toContain('href="https://traumahub.cl/caso"')
  })

  it('javascript: y ftp: se quedan en texto', () => {
    const salida = html('javascript:alert(1) y ftp://servidor.cl/archivo')
    expect(salida).not.toMatch(/<a [^>]*href="(javascript|ftp):/)
    expect(salida).toContain('javascript:alert(1)')
  })

  it('las comillas latinas y las rectas que la rodean quedan fuera del enlace', () => {
    // Buscada sobre el texto ya escapado, la dirección se tragaba el `&quot;`
    // y el `»` del cierre: el enlace llevaba a una página que no existe.
    expect(html('Lea «https://traumahub.cl/a» antes')).toContain('href="https://traumahub.cl/a"')
    expect(html('Lea "https://traumahub.cl/b" antes')).toContain('href="https://traumahub.cl/b"')
  })

  it('en los datos y en la cita, que escribe otra persona, una dirección se queda en texto', () => {
    // El nombre y la institución de una solicitud los escribe cualquiera sin
    // cuenta. Enlazados, eran un enlace pulsable a cualquier sitio dentro de un
    // aviso con el logotipo de la plataforma.
    const { html } = armarCorreo(
      {
        ...correoConEtiquetas(),
        bloques: [
          { tipo: 'datos', filas: [['Nombre', 'Dr. Pérez, verifique en https://falso.example/activar']] },
          { tipo: 'cita', texto: 'ver https://falso.example/cita' },
        ],
        boton: undefined,
      },
      { logo: null },
    )
    expect(html).toContain('https://falso.example/activar')
    expect(html).toContain('https://falso.example/cita')
    expect(html).not.toMatch(/href="https:\/\/falso\.example/)
  })

  it('una dirección con etiquetas pegadas no cuela marcado', () => {
    const salida = html('https://traumahub.cl/x"><script>alert(1)</script>')
    expect(salida).not.toContain('<script>')
    expect(salida).not.toMatch(/href="[^"]*"[^ >]/)
  })
})

describe('la versión en texto plano', () => {
  const { texto } = armarCorreo(
    {
      asunto: 'Asunto',
      resumen: 'Resumen',
      titulo: 'Título del aviso',
      bloques: [
        { tipo: 'parrafo', texto: 'Un párrafo.' },
        { tipo: 'lista', elementos: ['uno', 'dos'] },
        { tipo: 'cita', texto: 'línea 1\nlínea 2' },
      ],
      boton: { texto: 'Elegir mi contraseña', enlace: 'https://traumahub.cl/clave/abc' },
      nota: 'Caduca en una hora.',
      motivoDelEnvio: 'Recibe este correo porque tiene cuenta.',
    },
    { logo: CID_DEL_LOGO },
  )

  it('lleva el enlace del botón escrito entero, que es lo único pulsable que tiene', () => {
    expect(texto).toContain('Elegir mi contraseña: https://traumahub.cl/clave/abc')
  })

  it('lleva la autoría y el motivo del envío', () => {
    expect(texto).toContain(AUTORIA.nombre)
    expect(texto).toContain(AUTORIA.correo)
    expect(texto).toContain('Recibe este correo porque tiene cuenta.')
  })

  it('no lleva marcado', () => {
    expect(texto).not.toMatch(/<[a-z/]/i)
    expect(texto).toContain('  - uno')
    expect(texto).toContain('> línea 2')
  })
})

describe('la cabecera y el resumen', () => {
  it('el resumen va en un bloque oculto al principio del cuerpo', () => {
    const { html } = armarCorreo({ ...correoConEtiquetas(), resumen: 'Lo que se lee en la bandeja' }, { logo: null })
    const cuerpo = html.slice(html.indexOf('<body'))
    expect(cuerpo).toMatch(/^<body[^>]*>\s*<div style="display:none;[^"]*">Lo que se lee en la bandeja<\/div>/)
  })

  it('con logo null sale el nombre escrito y ninguna imagen', () => {
    const { html } = armarCorreo(correoConEtiquetas(), { logo: null })
    expect(html).not.toContain('<img')
    expect(html).toMatch(/<span[^>]*>TraumaHub<\/span>/)
  })

  it('con logo sale la imagen con esa dirección', () => {
    const { html } = armarCorreo(correoConEtiquetas(), { logo: `cid:${CID_DEL_LOGO}` })
    expect(html).toContain(`<img src="cid:${CID_DEL_LOGO}"`)
  })

  it('el pie lleva la autoría', () => {
    const { html } = armarCorreo(correoConEtiquetas(), { logo: null })
    expect(html).toContain(AUTORIA.nombre)
    expect(html).toContain(`mailto:${AUTORIA.correo}`)
  })
})

describe('bloquesDesdeTexto', () => {
  it('una línea en blanco separa párrafos y las líneas con guion forman una lista', () => {
    expect(bloquesDesdeTexto('Estimados:\r\n\r\nNovedades\n- uno\n• dos\nFin de la lista\n\n\n\nÚltimo')).toEqual([
      { tipo: 'parrafo', texto: 'Estimados:' },
      { tipo: 'parrafo', texto: 'Novedades' },
      { tipo: 'lista', elementos: ['uno', 'dos'] },
      { tipo: 'parrafo', texto: 'Fin de la lista' },
      { tipo: 'parrafo', texto: 'Último' },
    ])
  })

  it('las líneas seguidas de un mismo párrafo se conservan con su salto', () => {
    expect(bloquesDesdeTexto('línea uno\nlínea dos')).toEqual([{ tipo: 'parrafo', texto: 'línea uno\nlínea dos' }])
  })

  it('un guion sin espacio no es una lista', () => {
    expect(bloquesDesdeTexto('-5 grados de flexión')).toEqual([{ tipo: 'parrafo', texto: '-5 grados de flexión' }])
  })

  it('un texto vacío o solo con espacios no da bloques', () => {
    expect(bloquesDesdeTexto('  \n\n \n')).toEqual([])
  })
})
