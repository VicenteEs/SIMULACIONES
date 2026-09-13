import { describe, it, expect } from 'vitest'
import type { Field } from 'payload'
import { COLECCIONES } from '@/collections'
import { BLOQUES as BLOQUES_PAYLOAD } from '@/blocks'
import {
  coleccionesRelacionadasDe,
  estadoEnPalabras,
  ESQUEMAS,
  camposDe,
  esColeccionEditable,
  esquemaDe,
  recorrerCampos,
  REGLAS_DEL_OBJETIVO_DEL_PASO,
  type Campo,
} from '@/admin/esquema'
import { BLOQUES as BLOQUES_PANEL } from '@/admin/bloques'
import { faltantes, depurarCampos } from '@/admin/depurar'
import { encuadreQueLoAbarca } from '@/lib/encuadre'
import { LIMITE_BYTES_MODELO_3D } from '@/uploads/validarModelo3D'

/**
 * El esquema del panel es paralelo a la definición de Payload, no derivado.
 *
 * Payload describe cómo se guarda el dato; `src/admin/esquema.ts`, cómo se
 * edita. Tenerlos separados evita que la interfaz quede atada a los detalles
 * del almacenamiento, pero abre la puerta a que se separen sin que nadie se
 * entere: un campo renombrado en la colección y no en el esquema deja de
 * guardarse en silencio, y el editor sigue mostrándolo como si funcionara.
 *
 * Estas pruebas son el pegamento. Si fallan, uno de los dos archivos se movió.
 */

/** Nombres de campo de una colección, entrando en pestañas y filas. */
function nombresDeCampos(campos: Field[]): Set<string> {
  const nombres = new Set<string>()
  const recorrer = (lista: Field[]) => {
    for (const campo of lista) {
      if ('name' in campo && typeof campo.name === 'string') nombres.add(campo.name)
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) recorrer(pestana.fields as Field[])
      }
      if ('fields' in campo && Array.isArray(campo.fields) && !('name' in campo)) {
        recorrer(campo.fields as Field[])
      }
    }
  }
  recorrer(campos)
  return nombres
}

/**
 * Los mismos nombres, pero entrando también en grupos y filas.
 *
 * `nombresDeCampos` se queda en el primer nivel del dato a propósito: lo usan
 * las comprobaciones que hablan de columnas del listado y de campos de primer
 * nivel, y ensancharlas las volvería más flojas. Esta versión es para el
 * invariante contrario —que no quede en la colección ningún campo que el panel
 * no describa—, y ahí hay que bajar, porque es abajo donde se esconden: el
 * campo que se coló fue `instrumental.tecnicas`, y lo que lo mantuvo invisible
 * es que nadie miraba en esa dirección.
 *
 * Los bloques no se recorren: sus campos no son de la colección sino de la
 * definición del bloque, y de esos se encarga el par de pruebas de abajo —una
 * por dirección—, que usan esta misma función sobre `bloque.fields`.
 */
function nombresDeCamposHondo(campos: Field[]): Set<string> {
  const nombres = new Set<string>()
  const recorrer = (lista: Field[]) => {
    for (const campo of lista) {
      if ('name' in campo && typeof campo.name === 'string') nombres.add(campo.name)
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) recorrer(pestana.fields as Field[])
      }
      if ('fields' in campo && Array.isArray(campo.fields)) recorrer(campo.fields as Field[])
    }
  }
  recorrer(campos)
  return nombres
}

/**
 * Lo que pone Payload por su cuenta y ningún esquema tiene por qué describir.
 *
 * Estos nombres no salen de `src/collections`: los añade Payload al preparar la
 * configuración —el identificador, las dos fechas, el estado de publicación de
 * una colección versionada y los seis del archivo subido—. Si alguno llegara a
 * declararse a mano en una colección, la comprobación de abajo lo reclamaría en
 * el panel, donde no pinta nada.
 */
const LOS_PONE_PAYLOAD = new Set([
  'id',
  'updatedAt',
  'createdAt',
  '_status',
  'filename',
  'mimeType',
  'url',
  'thumbnailURL',
  'filesize',
  'width',
  'height',
  'sizes',
  'focalX',
  'focalY',
])

/**
 * Campos obligatorios de primer nivel de una colección.
 *
 * «Primer nivel» es del dato, no de la pantalla: las pestañas, las filas y los
 * plegables agrupan al mirar, pero lo que contienen se guarda igual de suelto.
 * Antes solo se miraban las pestañas, de modo que un campo obligatorio metido
 * en una fila se escapaba de la comprobación —y era exactamente el caso que
 * esta prueba existe para impedir: el editor deja guardar sin él y Payload
 * rechaza el documento señalando un campo que no se ve en pantalla—.
 */
function obligatoriosDePrimerNivel(campos: Field[]): string[] {
  const nombres: string[] = []
  const recorrer = (lista: Field[]) => {
    for (const campo of lista) {
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) recorrer(pestana.fields as Field[])
        continue
      }
      if ('fields' in campo && Array.isArray(campo.fields) && !('name' in campo)) {
        recorrer(campo.fields as Field[])
        continue
      }
      if (
        'name' in campo &&
        typeof campo.name === 'string' &&
        (campo as { required?: boolean }).required === true
      ) {
        nombres.push(campo.name)
      }
    }
  }
  recorrer(campos)
  return nombres
}

describe('el esquema del panel cubre las colecciones', () => {
  it('describe todas las colecciones de contenido, y solo esas', () => {
    const editables = ESQUEMAS.map((e) => e.slug).sort()
    expect(editables).toEqual(
      [
        'casos-ao',
        'cirugias',
        'estudios-ia',
        'maniobras',
        'medios',
        'modelos-3d',
        'patologias',
        'segmentos',
        // Los catálogos del simulador: el vocabulario con el que el
        // traumatólogo escribe los casos, y que él mismo mantiene.
        'huesos-ao',
        'clasificaciones-ao',
        'tecnicas-quirurgicas',
        'fases-quirurgicas',
        'instrumental',
      ].sort(),
    )
  })

  it('no deja editar usuarios, comentarios ni actividad desde el editor de contenido', () => {
    // Son colecciones con reglas propias: las cuentas se gestionan en su
    // sección, y los comentarios y la actividad los escribe la plataforma.
    // `instancias-atlas` tampoco: se arma en el taller del atlas, con su
    // visor, y en el editor genérico saldría como un cuadro de texto con
    // miles de identificadores dentro.
    for (const slug of ['usuarios', 'comentarios', 'actividad', 'instancias-atlas']) {
      expect(esColeccionEditable(slug), slug).toBe(false)
    }
  })

  it('cada esquema apunta a una colección que existe de verdad', () => {
    const registradas = COLECCIONES.map((c) => c.slug)
    for (const esquema of ESQUEMAS) {
      expect(registradas, esquema.slug).toContain(esquema.slug)
    }
  })

  it('todo campo del esquema existe en su colección', () => {
    // Se baja a las filas y a los grupos por los dos lados: un `pasos[].titlo`
    // mal escrito en el esquema pinta un cuadro de texto que se rellena, se
    // guarda y no llega a ninguna columna.
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const existentes = nombresDeCamposHondo(coleccion.fields)
      for (const campo of recorrerCampos(camposDe(esquema))) {
        expect(existentes, `${esquema.slug}.${campo.nombre} no existe en la colección`).toContain(
          campo.nombre,
        )
      }
    }
  })

  it('todo campo de la colección está en el esquema', () => {
    // El invariante que faltaba, y el que habría cazado `instrumental.tecnicas`:
    // ese campo existía en la colección desde siempre y el panel no lo
    // describía, así que desde que se retiró la interfaz de Payload (D-038) no
    // quedó ninguna pantalla desde la que llenarlo —y duplicar un instrumento
    // lo perdía, porque `depurarDocumento` reconstruye la copia y ahí solo
    // sobrevive lo descrito—. Un campo que no se puede editar desde ninguna
    // parte es un campo muerto, y el silencio es lo que lo mantiene vivo en la
    // base.
    //
    // Si algún campo tiene que quedar fuera a propósito, este es el sitio para
    // decirlo con su porqué, no para no mirar.
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const enElEsquema = new Set([...recorrerCampos(camposDe(esquema))].map((c) => c.nombre))
      for (const nombre of nombresDeCamposHondo(coleccion.fields)) {
        if (LOS_PONE_PAYLOAD.has(nombre)) continue
        expect(enElEsquema, `${esquema.slug}.${nombre} falta en el esquema del panel`).toContain(
          nombre,
        )
      }
    }
  })

  it('todo campo obligatorio de la colección está en el esquema', () => {
    // Si falta, el editor deja guardar sin él y Payload rechaza el documento
    // con un mensaje que no señala nada que se pueda tocar en pantalla.
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const enElEsquema = new Set(camposDe(esquema).map((c) => c.nombre))
      for (const obligatorio of obligatoriosDePrimerNivel(coleccion.fields)) {
        expect(enElEsquema, `${esquema.slug}.${obligatorio} falta en el esquema`).toContain(
          obligatorio,
        )
      }
    }
  })

  it('el campo que da título a cada colección está descrito', () => {
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      expect(nombresDeCampos(coleccion.fields), esquema.slug).toContain(esquema.titulo)
    }
  })

  it('marca como versionada exactamente lo que guarda borradores', () => {
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const tieneBorradores = Boolean(
        coleccion.versions && (coleccion.versions as { drafts?: unknown }).drafts,
      )
      expect(esquema.versionada, esquema.slug).toBe(tieneBorradores)
    }
  })

  it('las colecciones de archivo son las que suben archivos', () => {
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      expect(Boolean(esquema.subida), esquema.slug).toBe(Boolean(coleccion.upload))
    }
  })

  it('el techo que se anuncia es el mismo que se comprueba', () => {
    // La frase la lee el traumatólogo y la cifra la comprueba `subirArchivo`.
    // Separadas, el panel llegó a prometer 50 MB mientras Next cortaba en 8 sin
    // decir nada, y nadie lo vio porque una frase no la compara nadie.
    for (const esquema of ESQUEMAS) {
      if (!esquema.subida) continue
      const anunciado = /(\d+)\s*MB/.exec(esquema.subida.ayuda)
      expect(anunciado, `${esquema.slug}: la ayuda no dice ningún techo en MB`).not.toBeNull()
      expect(Number(anunciado![1]), `${esquema.slug}: la ayuda y la cifra no dicen lo mismo`).toBe(
        esquema.subida.maximoBytes / 1024 / 1024,
      )
    }
  })

  it('el techo de los modelos 3D es el que hace cumplir la validación', () => {
    // No se importa `LIMITE_BYTES_MODELO_3D` desde el esquema para no arrastrar
    // un módulo de servidor al paquete del navegador —el formulario importa
    // este esquema—, así que los dos números viven separados y los ata esto.
    expect(esquemaDe('modelos-3d').subida?.maximoBytes).toBe(LIMITE_BYTES_MODELO_3D)
  })
})

describe('los bloques del panel cubren los de la plataforma', () => {
  it('describe los mismos bloques, con el mismo identificador', () => {
    expect(BLOQUES_PANEL.map((b) => b.slug).sort()).toEqual(
      BLOQUES_PAYLOAD.map((b) => b.slug).sort(),
    )
  })

  it('todo campo de un bloque existe en su definición', () => {
    for (const bloque of BLOQUES_PANEL) {
      const original = BLOQUES_PAYLOAD.find((b) => b.slug === bloque.slug)!
      const existentes = nombresDeCampos(original.fields)
      for (const campo of bloque.campos) {
        expect(existentes, `${bloque.slug}.${campo.nombre}`).toContain(campo.nombre)
      }
    }
  })

  it('todo campo de la definición del bloque está en el panel', () => {
    // El reverso del de arriba, y el que de verdad muerde. El de arriba caza un
    // nombre mal escrito en el panel; este caza uno que falta, y ahí la
    // consecuencia es peor que la de `instrumental.tecnicas`: `depurarCampos`
    // reconstruye cada bloque a partir de `bloqueDe(blockType).campos`, así que
    // un campo de bloque que el panel no describa no se pierde solo al
    // duplicar, se pierde en CADA guardado y sin decir nada.
    //
    // Se mira hondo por los dos lados porque es abajo donde se esconden: los
    // puntos de una lista clínica y las filas de una tabla de clasificación son
    // campos dentro de un `array`, y el primer nivel no los ve.
    for (const original of BLOQUES_PAYLOAD) {
      const panel = BLOQUES_PANEL.find((b) => b.slug === original.slug)!
      const enElPanel = new Set([...recorrerCampos(panel.campos)].map((c) => c.nombre))
      for (const nombre of nombresDeCamposHondo(original.fields)) {
        expect(enElPanel, `${original.slug}.${nombre} falta en el panel`).toContain(nombre)
      }
    }
  })
})

describe('coherencia interna del esquema', () => {
  it('ningún campo se repite dentro de una colección', () => {
    for (const esquema of ESQUEMAS) {
      const nombres = camposDe(esquema).map((c) => c.nombre)
      expect(new Set(nombres).size, esquema.slug).toBe(nombres.length)
    }
  })

  it('las columnas del listado se pueden mostrar', () => {
    // `_status` y las fechas las pone Payload; el resto tiene que ser un campo.
    const propias = new Set(['_status', 'updatedAt', 'createdAt', 'filename', 'mimeType'])
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const existentes = nombresDeCampos(coleccion.fields)
      for (const columna of esquema.columnas) {
        if (propias.has(columna.nombre)) continue
        expect(existentes, `${esquema.slug}: columna ${columna.nombre}`).toContain(columna.nombre)
      }
    }
  })

  it('los campos por los que se busca son de texto', () => {
    const esTexto = (campo: Campo) => campo.tipo === 'texto' || campo.tipo === 'area'
    for (const esquema of ESQUEMAS) {
      const porNombre = new Map(
        [...recorrerCampos(camposDe(esquema))].map((c) => [c.nombre, c]),
      )
      for (const nombre of esquema.buscarEn) {
        const campo = porNombre.get(nombre)
        // `filename` lo pone Payload en las colecciones de archivo.
        if (!campo) {
          expect(esquema.subida, `${esquema.slug}: ${nombre}`).toBeTruthy()
          continue
        }
        expect(esTexto(campo), `${esquema.slug}: se busca en ${nombre}, que no es texto`).toBe(true)
      }
    }
  })

  it('lo que una selección exige o prohíbe apunta a opciones y a hermanos que existen', () => {
    // `exigeAlguno` y `prohibeAlguno` repiten en el idioma del panel una
    // validación de la colección. Una opción mal escrita ahí no rompe nada:
    // simplemente deja de avisar, y el traumatólogo vuelve a encontrarse el
    // mensaje en inglés de Payload sin saber qué rellenar. Un fallo que solo se
    // nota por lo que deja de pasar necesita que alguien lo mire.
    const revisar = (campos: Campo[], donde: string) => {
      const hermanos = new Set(campos.map((c) => c.nombre))
      for (const campo of campos) {
        if (campo.tipo === 'seleccion') {
          // Las dos se comprueban igual y por lo mismo, así que se recorren
          // juntas: separarlas invitaba a que la segunda se quedara sin
          // vigilar, que es justo como nació.
          const reglas = [...(campo.exigeAlguno ?? []), ...(campo.prohibeAlguno ?? [])]
          for (const regla of reglas) {
            expect(
              campo.opciones.map((o) => o.valor),
              `${donde}.${campo.nombre}: tiene una regla para «${regla.opcion}», que no es una opción`,
            ).toContain(regla.opcion)
            for (const nombre of regla.campos) {
              expect(
                hermanos,
                `${donde}.${campo.nombre}: su regla nombra «${nombre}», que no es hermano`,
              ).toContain(nombre)
            }
            expect(regla.mensaje.length, `${donde}.${campo.nombre}`).toBeGreaterThan(20)
          }
        }
        if (campo.tipo === 'lista' || campo.tipo === 'grupo') {
          revisar(campo.campos, `${donde}.${campo.nombre}`)
        }
      }
    }
    for (const esquema of ESQUEMAS) revisar(camposDe(esquema), esquema.slug)
  })

  it('toda selección ofrece al menos una opción', () => {
    for (const esquema of ESQUEMAS) {
      for (const campo of recorrerCampos(camposDe(esquema))) {
        if (campo.tipo === 'seleccion') {
          expect(campo.opciones.length, `${esquema.slug}.${campo.nombre}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('el formulario precarga toda colección que algún desplegable necesita', () => {
    // Esta lista estaba escrita a mano en el formulario y se quedó atrás en
    // cuanto llegaron los catálogos del simulador: hueso, clasificación,
    // técnica, fase e instrumental abrían vacíos, sin un solo error, en un
    // formulario donde tres de ellos son obligatorios. El caso no se podía
    // guardar y la pantalla no decía por qué. Ahora se deriva del esquema, y
    // esto comprueba que la derivación no se deje ninguna.
    for (const esquema of ESQUEMAS) {
      const precargadas = new Set(coleccionesRelacionadasDe(esquema))
      for (const campo of recorrerCampos(camposDe(esquema))) {
        if (campo.tipo === 'relacion' || campo.tipo === 'archivo') {
          expect(precargadas, `${esquema.slug}.${campo.nombre} -> ${campo.coleccion}`).toContain(
            campo.coleccion,
          )
        }
      }
    }
  })

  it('los catálogos del simulador llegan al formulario de una cirugía', () => {
    // El caso concreto que falló. Se nombra entero a propósito: una prueba
    // genérica pasaría igual con la lista vacía.
    const deCirugias = coleccionesRelacionadasDe(esquemaDe('cirugias'))
    for (const catalogo of [
      'huesos-ao',
      'clasificaciones-ao',
      'tecnicas-quirurgicas',
      'fases-quirurgicas',
      'instrumental',
      'modelos-3d',
    ]) {
      expect(deCirugias, catalogo).toContain(catalogo)
    }
  })

  it('cada colección declara el género de su singular', () => {
    // El tipo ya lo exige, pero el esquema también lo lee código que no pasa
    // por el compilador de aquí —una prueba, un `JSON.parse`—, y un género
    // ausente se leería como femenino en `estadoEnPalabras` sin decir nada.
    for (const esquema of ESQUEMAS) {
      expect(['m', 'f'], `${esquema.slug} (${esquema.singular})`).toContain(esquema.genero)
    }
  })

  it('la insignia de estado concuerda con el singular', () => {
    // El caso que se veía: «✓ Publicada» encima de «Modelo 3D». Se nombran las
    // colecciones concretas a propósito, porque una prueba que recorriera
    // `ESQUEMAS` comparando contra el mismo `genero` pasaría con los trece
    // puestos al revés.
    //
    // Aquí se comprobaba también un `avisoDeRetirada` que conjugaba «retírela
    // de publicación». Se fueron los dos, y el orden importa: esa frase ya
    // estaba desechada en `FormularioDocumento.tsx` —ver `salidaSuave`, manda a
    // pulsar un botón que solo existe con `versionada && publicado`—, así que
    // esta prueba defendía en verde el texto que aquella decisión había
    // quitado. Una prueba así es peor que ninguna: convierte en regresión el
    // arreglo.
    expect(estadoEnPalabras(esquemaDe('modelos-3d'), true)).toBe('✓ Publicado')
    expect(estadoEnPalabras(esquemaDe('patologias'), true)).toBe('✓ Publicada')
    expect(estadoEnPalabras(esquemaDe('modelos-3d'), false)).toBe('● Borrador')
  })

  it('toda relación apunta a una colección que existe', () => {
    const registradas = COLECCIONES.map((c) => c.slug)
    const campos = [
      ...ESQUEMAS.flatMap((e) => [...recorrerCampos(e.secciones.flatMap((s) => s.campos))]),
      ...BLOQUES_PANEL.flatMap((b) => [...recorrerCampos(b.campos)]),
    ]
    for (const campo of campos) {
      if (campo.tipo === 'relacion' || campo.tipo === 'archivo') {
        expect(registradas, `${campo.nombre} -> ${campo.coleccion}`).toContain(campo.coleccion)
      }
    }
  })
})

/**
 * Las tres reglas del objetivo de un paso, que ahora son una sola lista.
 *
 * `src/collections/Cirugias.ts` las hace cumplir al publicar y
 * `src/admin/depurar.ts` las adelanta en el panel para que el motivo llegue en
 * español. Estuvieron escritas dos veces, con los textos copiados a mano, y se
 * separaron: la que prohíbe llegó a la colección y no al panel, así que durante
 * ese tiempo el rechazo salía por el `ValidationError` de Payload, en inglés y
 * con el español encerrado en `error.data`. Es un defecto que solo se nota por
 * lo que deja de pasar —el caso igual no se publica—, de modo que mirarlo no
 * sirve: tiene que fallar algo.
 *
 * Se recorre `REGLAS_DEL_OBJETIVO_DEL_PASO` en vez de nombrar las tres para que
 * una cuarta entre vigilada sola. Eso es lo que aporta este bloque frente a
 * `tests/unit/reglasDelObjetivo.test.ts`, que nació cuando las reglas estaban
 * escritas dos veces y compara tres casos nombrados a mano: aquel archivo
 * conserva su valor en lo que prueba del comportamiento —el 0 que es número
 * tecleado, las tres tolerancias que no estorban, el borrador de D-011 y el
 * texto que de verdad lee el traumatólogo—, pero sus tres comparaciones «dice
 * lo mismo en los dos sitios» ya no comparan dos textos: los dos lados leen
 * esta constante. Si se va a tocar uno de los dos archivos, que sea aquel.
 */
describe('la colección y el panel aplican las mismas reglas del objetivo', () => {
  interface CampoDePayload {
    name?: string
    fields?: CampoDePayload[]
    options?: { value: string }[]
    validate?: unknown
  }

  const buscar = (campos: CampoDePayload[] | undefined, nombre: string): CampoDePayload | undefined => {
    for (const campo of campos ?? []) {
      if (campo.name === nombre) return campo
      const dentro = buscar(campo.fields, nombre)
      if (dentro) return dentro
    }
    return undefined
  }

  const coleccion = COLECCIONES.find((c) => c.slug === 'cirugias')!
  const campoDeLaColeccion = buscar(coleccion.fields as unknown as CampoDePayload[], 'objetivo')!
  const validar = (valor: string, paso: Record<string, unknown>) =>
    (
      campoDeLaColeccion.validate as (
        v: string,
        o: { siblingData?: unknown },
      ) => string | true
    )(valor, { siblingData: paso })

  const campoDelPanel = [...recorrerCampos(camposDe(esquemaDe('cirugias')))].find(
    (c) => c.nombre === 'objetivo',
  )!

  /** Un caso mínimo publicable, con un solo paso, para que `faltantes` no traiga ruido. */
  const casoConUnPaso = (paso: Record<string, unknown>): Record<string, unknown> => ({
    nombre: 'Caso de prueba',
    pasos: [{ titulo: 'Paso', ...paso }],
  })

  it('la colección corta con el texto exacto que declara la regla', () => {
    for (const regla of REGLAS_DEL_OBJETIVO_DEL_PASO.exige) {
      expect(validar(regla.opcion, {}), `exige ${regla.opcion}`).toBe(regla.mensaje)
    }
    for (const regla of REGLAS_DEL_OBJETIVO_DEL_PASO.prohibe) {
      for (const nombre of regla.campos) {
        expect(validar(regla.opcion, { [nombre]: 12 }), `prohíbe ${regla.opcion}+${nombre}`).toBe(
          regla.mensaje,
        )
      }
    }
  })

  it('el panel enseña ese mismo texto antes de intentar guardar', () => {
    for (const regla of REGLAS_DEL_OBJETIVO_DEL_PASO.exige) {
      const problemas = faltantes(esquemaDe('cirugias'), casoConUnPaso({ objetivo: regla.opcion }))
      expect(problemas, `exige ${regla.opcion}`).toContain(`En paso 1: ${regla.mensaje}`)
    }
    for (const regla of REGLAS_DEL_OBJETIVO_DEL_PASO.prohibe) {
      const problemas = faltantes(
        esquemaDe('cirugias'),
        casoConUnPaso({ objetivo: regla.opcion, [regla.campos[0]]: 12 }),
      )
      expect(problemas, `prohíbe ${regla.opcion}`).toContain(`En paso 1: ${regla.mensaje}`)
    }
  })

  it('el aviso del panel no salta al guardar un borrador', () => {
    // D-011: Payload salta sus validaciones con `draft: true`, así que
    // adelantarlas siempre dejaría el borrador sin poder guardarse y se
    // perdería lo escrito esa tarde.
    for (const regla of REGLAS_DEL_OBJETIVO_DEL_PASO.exige) {
      const problemas = faltantes(esquemaDe('cirugias'), casoConUnPaso({ objetivo: regla.opcion }), {
        profundo: false,
      })
      expect(problemas.join(' '), regla.opcion).not.toContain(regla.mensaje)
    }
  })

  it('las dos pantallas ofrecen las mismas cuatro opciones', () => {
    // Las reglas se identifican por el valor de la opción: una que exista en un
    // lado y no en el otro deja la regla sin disparar justamente donde falta.
    expect(campoDelPanel.tipo).toBe('seleccion')
    const enElPanel = (campoDelPanel as Extract<Campo, { tipo: 'seleccion' }>).opciones
      .map((o) => o.valor)
      .sort()
    const enLaColeccion = (campoDeLaColeccion.options ?? []).map((o) => o.value).sort()
    expect(enElPanel).toEqual(enLaColeccion)
  })
})

/**
 * El encuadre de un modelo 3D, que ahora se guarda en dos sitios.
 *
 * El traumatólogo pidió poder «dejarle el modelo de la pierna en una pose», así
 * que la colección `modelos-3d` guarda desde hoy su encuadre inicial. Esa forma
 * ya existía —la del bloque «Modelo 3D» de una ficha—, y lo que estas pruebas
 * defienden es que siga siendo **una sola**: dos maneras de guardar un encuadre
 * en la misma plataforma obligan a traducir entre ellas en cada lector, y el
 * primer lector que se olvide enseña el hueso del revés sin ningún error.
 *
 * La tercera candidata era `VistaDeInstancia` (`src/atlas/formato.ts`), que
 * guarda cámara y objetivo. No encaja y por eso no está: sirve para el atlas,
 * que es una escena compartida en metros donde una coordenada absoluta
 * significa siempre lo mismo; un `.glb` subido viene en las unidades de su
 * estudio y centrado donde quiso Blender. El porqué entero, en el campo.
 */
describe('el encuadre inicial de un modelo 3D', () => {
  /** Los nombres de los subcampos de un grupo, vengan de donde vengan. */
  const subcamposDe = (campos: Field[], nombre: string): string[] => {
    const grupo = campos.find((c) => 'name' in c && c.name === nombre) as
      | { fields?: Field[] }
      | undefined
    return (grupo?.fields ?? [])
      .map((c) => ('name' in c && typeof c.name === 'string' ? c.name : ''))
      .sort()
  }

  const modelos3D = COLECCIONES.find((c) => c.slug === 'modelos-3d')!
  const bloque = BLOQUES_PAYLOAD.find((b) => b.slug === 'modelo-3d')!

  it('se guarda con la misma forma en el modelo y en el bloque que lo inserta', () => {
    // Se nombran los cinco a propósito, y no solo se comparan entre sí: con dos
    // listas vacías la comparación pasaría igual.
    expect(subcamposDe(modelos3D.fields, 'encuadre')).toEqual([
      'distanciaCamara',
      'escala',
      'giroX',
      'giroY',
      'giroZ',
    ])
    expect(subcamposDe(bloque.fields, 'encuadre')).toEqual(
      subcamposDe(modelos3D.fields, 'encuadre'),
    )
  })

  it('puede quedarse vacío, que es lo que significa «encuádralo tú»', () => {
    // Ningún `defaultValue`, ni aquí ni en el bloque. `tieneEncuadre`
    // (`src/lib/aritmeticaDelEncuadre.ts`) decide por `distanciaCamara`: en
    // cuanto hubiera una por omisión, todo modelo nacería con un encuadre que
    // nadie capturó, el ajuste automático dejaría de actuar y los modelos en
    // milímetros volverían a abrirse como un punto.
    //
    // El bloque SÍ los llevaba, y eso es lo que hacía que la pose del catálogo
    // no llegara jamás a una ficha ya escrita: su distancia de 3 contestaba
    // «sí, tengo encuadre», y la precedencia respeta al bloque por encima del
    // modelo. Se retiraron, y `tests/unit/poseEnLasTresPantallas.test.ts`
    // vigila que no vuelvan.
    const grupo = modelos3D.fields.find((c) => 'name' in c && c.name === 'encuadre') as {
      fields?: Field[]
    }
    for (const campo of grupo.fields ?? []) {
      const nombre = 'name' in campo ? campo.name : '?'
      expect(
        (campo as { defaultValue?: unknown }).defaultValue,
        `modelos-3d.encuadre.${nombre} trae un valor por omisión: el encuadre dejaría de poder estar vacío`,
      ).toBeUndefined()
    }
  })

  it('el panel declara el editor de captura para ese grupo', () => {
    // Cinco números sin visor delante no los rellena nadie: ya pasó cuando la
    // interfaz de Payload se retiró con el botón de capturar dentro (D-038), y
    // la ayuda siguió meses mandando a pulsar un botón que no existía.
    //
    // El título sigue diciendo «declara» y no «lo pinta», porque declarar es
    // todo lo que esto comprueba: que la pantalla salga es cosa de
    // `Campos.tsx`, y una prueba que promete más de lo que mira convierte un
    // verde en una coartada.
    //
    // Hubo un rato en que las dos cosas iban por separado y el visor no salía:
    // `Campos.tsx` buscaba la dirección del modelo solo en el campo hermano
    // `modelo`, que en el formulario de un modelo no existe. Ya no:
    // `modeloParaEncuadrar` cae al documento que se está editando, que trae su
    // propia `url` por ser una colección de subida, y eso lo vigila
    // `tests/unit/encuadreDelModelo.test.ts`.
    const campo = [...recorrerCampos(camposDe(esquemaDe('modelos-3d')))].find(
      (c) => c.nombre === 'encuadre',
    )
    expect(campo?.tipo).toBe('grupo')
    expect((campo as Extract<Campo, { tipo: 'grupo' }>).editor).toBe('encuadre3d')
  })

  it('los topes del panel son los mismos que los de la colección', () => {
    // `depurarCampo` recorta con los del panel antes de guardar y Payload
    // rechaza con los suyos: separados, el panel deja escribir un número que el
    // servidor devuelve en inglés.
    const enElPanel = new Map(
      [...recorrerCampos(camposDe(esquemaDe('modelos-3d')))].map((c) => [c.nombre, c]),
    )
    const grupo = modelos3D.fields.find((c) => 'name' in c && c.name === 'encuadre') as {
      fields?: Field[]
    }
    for (const campo of grupo.fields ?? []) {
      if (!('name' in campo) || typeof campo.name !== 'string') continue
      const suyo = enElPanel.get(campo.name)
      expect(suyo?.tipo, `modelos-3d.encuadre.${campo.name}`).toBe('numero')
      const numero = suyo as Extract<Campo, { tipo: 'numero' }>
      const declarado = campo as { min?: number; max?: number }
      expect(numero.min, `min de encuadre.${campo.name}`).toBe(declarado.min)
      expect(numero.max, `max de encuadre.${campo.name}`).toBe(declarado.max)
    }
  })

  it('el suelo de la escala deja pasar un modelo en milímetros, que es lo que tenía que proteger', () => {
    // El recorrido entero y no el número suelto: se captura como captura el
    // botón «Ajustar al modelo» y se guarda como guarda el panel. Con `min:
    // 0.01` —lo que hubo— esta prueba fallaba en la última línea, y fallaba en
    // silencio en producción: `depurarCampo` recorta **sin avisar**, así que el
    // traumatólogo veía el fémur encuadrado, pulsaba guardar y el residente lo
    // abría cinco veces más grande. Un fallo que no da error no lo encuentra
    // nadie mirando; lo encuentra esto o no se encuentra.
    const RADIO_DE_UN_FEMUR_EN_MILIMETROS = 250
    const capturado = encuadreQueLoAbarca(RADIO_DE_UN_FEMUR_EN_MILIMETROS)
    expect(capturado).not.toBeNull()
    // Si esto dejara de ser cierto, el caso se habría movido y la prueba estaría
    // comprobando otra cosa: se afirma para que el fallo lo diga.
    expect(capturado!.escala!).toBeLessThan(0.01)

    const grupoDelPanel = [...recorrerCampos(camposDe(esquemaDe('modelos-3d')))].find(
      (c) => c.nombre === 'encuadre',
    ) as Extract<Campo, { tipo: 'grupo' }>
    const guardado = depurarCampos(grupoDelPanel.campos, {
      escala: capturado!.escala,
      distanciaCamara: capturado!.distanciaCamara,
    })
    expect(guardado.escala, 'el panel recortó la escala capturada sin decirlo').toBe(
      capturado!.escala,
    )

    // Y por la otra vía —API local, guion de demostración— quien rechaza es
    // Payload con el `min` de la colección, que tiene que admitir lo mismo.
    const enLaColeccion = (
      (
        modelos3D.fields.find((c) => 'name' in c && c.name === 'encuadre') as {
          fields?: Field[]
        }
      ).fields ?? []
    ).find((c) => 'name' in c && c.name === 'escala') as { min?: number }
    expect(enLaColeccion.min!).toBeLessThanOrEqual(capturado!.escala!)

    // Bajar el suelo no era quitarlo: escala cero hace desaparecer el modelo, y
    // ese es el único caso que el tope existía para impedir.
    expect(depurarCampos(grupoDelPanel.campos, { escala: 0 }).escala).toBeGreaterThan(0)
  })
})

describe('el mapa corporal que no se va a dibujar', () => {
  it('ni la colección ni el panel siguen pidiendo sus cuatro coordenadas', () => {
    // `zonaMapa` estuvo desde la migración inicial reservando x, y, ancho y alto
    // para un mapa sensible que no llegó nunca, y el panel pedía las cuatro por
    // cada uno de los veintitantos segmentos, con una advertencia al lado que
    // decía que no servían para nada. El traumatólogo decidió que no se dibuja.
    //
    // La prueba se queda después de retirarlo porque el campo se reponía solo
    // con dos líneas —«total, si el mapa vuelve, esto ya está»—, que es
    // exactamente el razonamiento que lo mantuvo vivo. Si el mapa vuelve, vuelve
    // con su pantalla, y esta prueba se borra en ese mismo cambio.
    const segmentos = COLECCIONES.find((c) => c.slug === 'segmentos')!
    expect(nombresDeCamposHondo(segmentos.fields)).not.toContain('zonaMapa')
    const enElPanel = [...recorrerCampos(camposDe(esquemaDe('segmentos')))].map((c) => c.nombre)
    expect(enElPanel).not.toContain('zonaMapa')
  })
})
