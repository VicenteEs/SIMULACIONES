import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Block, Field } from 'payload'
import { COLECCIONES } from '@/collections'
import { migrations } from '@/migrations'

/**
 * Las migraciones van al día con las colecciones.
 *
 * En desarrollo, Payload ajusta la base al vuelo (`push`), de modo que añadir
 * un campo a una colección funciona en el portátil sin hacer nada más. En
 * producción no: allí solo se aplican las migraciones. Un campo nuevo sin su
 * migración funciona en las pruebas, funciona al desarrollar, y falla al
 * desplegar —o peor, arranca y deja de guardar ese campo en silencio—.
 *
 * Ya pasó una vez en esta plataforma: la base del servidor arrancó con cero
 * tablas porque no había ninguna migración generada. Estas pruebas leen la
 * última instantánea que Payload escribe junto a cada migración y comprueban
 * que describa lo mismo que declaran las colecciones hoy.
 *
 * Si alguna falla, casi siempre la respuesta es la misma:
 *
 *     npx payload migrate:create
 *
 * Qué NO se compara aquí, para que nadie confíe de más:
 *
 * - El tipo, el valor por defecto, los índices y las claves foráneas de cada
 *   columna. Solo se comparan nombres: cambiar un `text` por un `number` no lo
 *   ve ninguna de estas pruebas.
 * - La columna `path` de las tablas `..._rels`, que es la que distingue dos
 *   relaciones múltiples distintas hacia la misma colección.
 * - Las columnas `version_…` de la tabla de versiones: las escribe la misma
 *   `migrate:create` que la tabla normal, así que repetirlas no cubriría nada
 *   que no cubra ya el par de pruebas de columnas.
 * - Los campos `localized`: la plataforma es monolingüe y no hay locales
 *   configurados; en cuanto los haya, Payload cambia la forma de las tablas y
 *   estas comprobaciones se quedan cortas.
 */

const CARPETA = join(process.cwd(), 'src', 'migrations')

/** La instantánea de la migración más reciente. */
function ultimaInstantanea(): {
  nombre: string
  tablas: Record<string, { columns: Record<string, unknown> }>
} {
  const archivos = readdirSync(CARPETA)
    .filter((n) => n.endsWith('.json'))
    .sort()
  const nombre = archivos[archivos.length - 1]
  const contenido = JSON.parse(readFileSync(join(CARPETA, nombre), 'utf8'))
  return { nombre, tablas: contenido.tables ?? {} }
}

/** Payload nombra las tablas y columnas en minúsculas con guion bajo. */
const aTabla = (slug: string) => slug.replace(/-/g, '_')
const aColumna = (nombre: string) =>
  nombre
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()

/**
 * Si la relación se guarda en la tabla `..._rels` y no en una columna propia.
 *
 * `hasMany` es la mitad evidente. La otra es `relationTo` en arreglo: una
 * relación polimórfica va al `_rels` aunque apunte a un solo documento, porque
 * una columna `<campo>_id` no podría decir además a qué colección apunta. En el
 * adaptador salen de la misma rama: `traverseFields.js` mira
 * `Array.isArray(field.relationTo)` ANTES que `field.hasMany`.
 *
 * Mirar solo `hasMany` deja un fallo por lado: `columnasDe` exigiría una columna
 * `<campo>_id` que Payload no crea nunca —rojo falso que manda a generar una
 * migración que no arregla nada— y `relacionesMultiples` se saltaría la relación
 * de verdad. Hoy no hay ninguna `relationTo: [...]` en `src/`; queda escrito
 * antes de que la haya.
 */
function esMultiple(campo: Field): boolean {
  // Con `in` y no con `as`: aquí `campo` es la unión entera de tipos de campo, y
  // a buena parte de sus miembros (una fila, una pestaña) les faltan las dos
  // propiedades, así que la aserción no se sostendría sola.
  if ('hasMany' in campo && campo.hasMany) return true
  return 'relationTo' in campo && Array.isArray(campo.relationTo)
}

/**
 * Columnas que un campo debería tener en la tabla de su colección.
 *
 * Se queda en lo que vive en la propia tabla. Los arreglos y los bloques tienen
 * tabla aparte y los vigila `tablasHijas`; las relaciones múltiples tienen la
 * suya y la vigila `relacionesMultiples`.
 *
 * Los grupos sí están aquí, y no siempre lo estuvieron: durante un tiempo se
 * saltaban con el resto, con la excusa de que «meterse ahí daría fallos falsos».
 * Era falso: un grupo no crea tabla, crea columnas en la tabla padre con su
 * nombre por delante —`desplazamientoInicial.x` es `desplazamiento_inicial_x` en
 * `cirugias`, `encuadre.giroX` es `encuadre_giro_x` en `modelos_3d`—, así que
 * saltárselo dejaba pasar columnas de verdad sin su migración. El `prefijo` es
 * lo que las reconstruye.
 *
 * El otro ejemplo de esta lista era `zonaMapa.alto` en `segmentos`, y se cayó
 * con el campo: el mapa corporal no se va a dibujar y la migración soltó sus
 * cuatro columnas. Se deja dicho porque estas pruebas solo miran en una
 * dirección —que exista la columna que la colección declara— y no ven nunca una
 * columna que sobra, así que un campo retirado sin su `DROP COLUMN` pasa en
 * verde y se queda en la base para siempre.
 */
function columnasDe(campos: Field[], prefijoInicial = ''): string[] {
  const salida: string[] = []

  const recorrer = (lista: Field[], prefijo: string) => {
    for (const campo of lista) {
      // Pestañas y contenedores sin nombre agrupan en pantalla, no en el dato.
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) {
          // Una pestaña CON nombre se comporta como un grupo: prefija.
          recorrer(
            pestana.fields as Field[],
            'name' in pestana ? `${prefijo}${aColumna(pestana.name)}_` : prefijo,
          )
        }
        continue
      }
      if ('fields' in campo && Array.isArray(campo.fields) && !('name' in campo)) {
        recorrer(campo.fields as Field[], prefijo)
        continue
      }

      if (!('name' in campo) || typeof campo.name !== 'string') continue
      const tipo = campo.type

      if (tipo === 'group') {
        recorrer(campo.fields as Field[], `${prefijo}${aColumna(campo.name)}_`)
        continue
      }

      // Tablas propias, o nada que guardar. `join` es un campo calculado: se
      // resuelve leyendo la otra colección y no ocupa columna ninguna.
      if (tipo === 'array' || tipo === 'blocks' || tipo === 'ui' || tipo === 'join') continue
      // Muchos a muchos: también tabla aparte. La vigila `relacionesMultiples`.
      if (esMultiple(campo)) continue

      salida.push(
        tipo === 'relationship' || tipo === 'upload'
          ? `${prefijo}${aColumna(campo.name)}_id`
          : `${prefijo}${aColumna(campo.name)}`,
      )
    }
  }

  recorrer(campos, prefijoInicial)
  return salida
}

/** Una tabla que cuelga de la de la colección, con los campos que debe traer. */
type TablaHija = { tabla: string; campos: Field[]; ruta: string }

/**
 * Tablas propias que cuelgan de una colección: arreglos, bloques y listas.
 *
 * Aquí es por donde crece el esquema de esta plataforma. El guion quirúrgico es
 * un arreglo de pasos con un arreglo de piezas dentro, y las fichas son pilas de
 * bloques: casi ningún campo que se añade hoy es un campo suelto de primer
 * nivel. Cada una de esas formas es una tabla que en el servidor no existe hasta
 * que alguien genera la migración.
 *
 * Las reglas de nombre salen de la instantánea, no de suponer:
 *
 * - Arreglo: `<padre>_<campo>`, y anidado, `<padre>_<campo>_<subcampo>`
 *   (`cirugias_pasos_muestra`).
 * - Bloque: `<padre>_blocks_<slug del bloque>`, SIN el nombre del campo. Por eso
 *   las seis pilas de Patologías comparten un único juego de tablas y se
 *   distinguen por la columna `_path`.
 * - Campo múltiple que no es relación: `<padre>_<campo>`, una fila por valor
 *   (`usuarios_modulos_visibles`). Las relaciones múltiples no: van a
 *   `..._rels` y las vigila `relacionesMultiples`.
 *
 * `prefijoInicial` sirve para la tabla de versiones, donde los campos del
 * documento cuelgan de `version_`.
 */
function tablasHijas(campos: Field[], tablaPadre: string, prefijoInicial = ''): TablaHija[] {
  const vistas = new Map<string, TablaHija>()

  // Devuelve false si la tabla ya estaba anotada, para no recorrer ocho bloques
  // seis veces en Patologías y repetir los mismos avisos.
  const anotar = (tabla: string, suyos: Field[], ruta: string): boolean => {
    if (vistas.has(tabla)) return false
    vistas.set(tabla, { tabla, campos: suyos, ruta })
    return true
  }

  const recorrer = (lista: Field[], padre: string, prefijo: string, ruta: string) => {
    for (const campo of lista) {
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) {
          const conNombre = 'name' in pestana
          recorrer(
            pestana.fields as Field[],
            padre,
            conNombre ? `${prefijo}${aColumna(pestana.name)}_` : prefijo,
            conNombre ? `${ruta}${pestana.name}.` : ruta,
          )
        }
        continue
      }
      if ('fields' in campo && Array.isArray(campo.fields) && !('name' in campo)) {
        recorrer(campo.fields as Field[], padre, prefijo, ruta)
        continue
      }
      if (!('name' in campo) || typeof campo.name !== 'string') continue

      if (campo.type === 'group') {
        recorrer(
          campo.fields as Field[],
          padre,
          `${prefijo}${aColumna(campo.name)}_`,
          `${ruta}${campo.name}.`,
        )
        continue
      }

      if (campo.type === 'array') {
        const tabla = `${padre}_${prefijo}${aColumna(campo.name)}`
        const suya = `${ruta}${campo.name}`
        // Dentro de la tabla del arreglo se vuelve a empezar: el prefijo de
        // columna del padre ya quedó consumido en su nombre.
        if (anotar(tabla, campo.fields as Field[], suya)) {
          recorrer(campo.fields as Field[], tabla, '', `${suya}.`)
        }
        continue
      }

      if (campo.type === 'blocks') {
        for (const bloque of campo.blocks as Block[]) {
          const tabla = `${padre}_blocks_${aColumna(bloque.slug)}`
          const suya = `${ruta}${campo.name}[${bloque.slug}]`
          if (anotar(tabla, bloque.fields, suya)) {
            recorrer(bloque.fields, tabla, '', `${suya}.`)
          }
        }
        continue
      }

      if (
        (campo as { hasMany?: boolean }).hasMany &&
        campo.type !== 'relationship' &&
        campo.type !== 'upload'
      ) {
        // Sus columnas son fijas (`order`, `parent_id`, `value`, `id`): lo único
        // que hay que comprobar es que la tabla exista.
        anotar(`${padre}_${prefijo}${aColumna(campo.name)}`, [], `${ruta}${campo.name}`)
      }
    }
  }

  recorrer(campos, tablaPadre, prefijoInicial, '')
  return [...vistas.values()]
}

/**
 * Campos de relación «muchos a muchos» de una colección, con su destino.
 *
 * No son una columna: Payload les crea una tabla `<coleccion>_rels` con una
 * columna por cada colección a la que se pueda apuntar.
 *
 * Hay que bajar por grupos, arreglos y bloques, y no es precaución de más: una
 * relación múltiple anidada NO se queda en la tabla de su arreglo ni de su
 * bloque, sube al `_rels` de la colección entera y allí se distingue de las
 * demás por la columna `path`. El adaptador lo hace pasando el mismo conjunto de
 * relaciones hacia abajo (`traverseFields.js`, ramas de `array` y de `blocks`:
 * `rootRelationships: relationships`; los grupos lo comparten por recursión
 * directa), y solo crea la tabla en la raíz (`build.js`: `const isRoot =
 * !incomingRootTableName`, con la creación del `_rels` dentro de `if (isRoot)`).
 *
 * De ahí las dos consecuencias que explican esta función:
 *
 * - Quedarse en el primer nivel dejaba abierto justo el fallo silencioso que
 *   D-056 existe para impedir, y en la forma de dato por la que crece esta
 *   plataforma: el guion quirúrgico es un arreglo de pasos, y `paso.instrumento`
 *   ya es una relación de una. La de varias es el paso siguiente.
 * - La columna que se exige es la misma que si el campo fuera de primer nivel,
 *   porque se llama por la colección de destino (`<destino>_id`) y no por la
 *   ruta del campo. Por eso aquí no se arrastra prefijo ninguno, al revés que en
 *   `columnasDe` y en `tablasHijas`.
 */
function relacionesMultiples(campos: Field[]): { nombre: string; destino: string }[] {
  const salida: { nombre: string; destino: string }[] = []

  const recorrer = (lista: Field[]) => {
    for (const campo of lista) {
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        // Una pestaña CON nombre prefija columnas, pero no cambia a dónde va la
        // relación: al `_rels` de la colección. Por eso aquí se baja igual que
        // por una sin nombre, y no como en `columnasDe`.
        for (const pestana of campo.tabs) recorrer(pestana.fields as Field[])
        continue
      }
      if ('fields' in campo && Array.isArray(campo.fields) && !('name' in campo)) {
        recorrer(campo.fields as Field[])
        continue
      }
      if (!('name' in campo) || typeof campo.name !== 'string') continue

      if (campo.type === 'group' || campo.type === 'array') {
        recorrer(campo.fields as Field[])
        continue
      }
      if (campo.type === 'blocks') {
        for (const bloque of campo.blocks as Block[]) recorrer(bloque.fields)
        continue
      }

      if (campo.type !== 'relationship' && campo.type !== 'upload') continue
      if (!esMultiple(campo)) continue

      const destino = (campo as { relationTo?: unknown }).relationTo
      // Una relación múltiple a varias colecciones da una columna por cada una;
      // basta comprobar la primera para saber que la tabla existe.
      const primero = Array.isArray(destino) ? destino[0] : destino
      if (typeof primero === 'string') salida.push({ nombre: campo.name, destino: primero })
    }
  }

  recorrer(campos)
  return salida
}

describe('lo que se mira antes de comparar con la instantánea', () => {
  // Estas cuatro no leen la instantánea: vigilan al vigilante. Las de abajo
  // recorren las colecciones de hoy, y hoy ninguna tiene una relación múltiple
  // dentro de un arreglo, de un bloque ni de un grupo: pasarían en verde con
  // `relacionesMultiples` mirando solo el primer nivel, que es como estuvo y es
  // el agujero que dejaba. Con campos de mentira el agujero se ve.

  it('encuentra una relación múltiple dentro de un arreglo, un bloque y un grupo', () => {
    // Copia de la forma real de Cirugias: el guion es un arreglo de pasos, la
    // ficha una pila de bloques y la colocación inicial un grupo.
    const campos: Field[] = [
      {
        name: 'pasos',
        type: 'array',
        fields: [
          { name: 'segmentosTocados', type: 'relationship', relationTo: 'segmentos', hasMany: true },
        ],
      },
      {
        name: 'desplazamientoInicial',
        type: 'group',
        fields: [{ name: 'mediosDeApoyo', type: 'upload', relationTo: 'medios', hasMany: true }],
      },
      {
        name: 'ficha',
        type: 'blocks',
        blocks: [
          {
            slug: 'galeria',
            fields: [
              { name: 'modelos', type: 'relationship', relationTo: 'modelos-3d', hasMany: true },
            ],
          },
        ],
      },
    ]

    expect(relacionesMultiples(campos)).toEqual([
      { nombre: 'segmentosTocados', destino: 'segmentos' },
      { nombre: 'mediosDeApoyo', destino: 'medios' },
      { nombre: 'modelos', destino: 'modelos-3d' },
    ])
  })

  it('encuentra una relación múltiple dentro de una pestaña con nombre', () => {
    // La pestaña con nombre prefija columnas, así que `columnasDe` la trata
    // distinto. La relación no: va al mismo `_rels` que todas.
    const campos: Field[] = [
      {
        type: 'tabs',
        tabs: [
          {
            name: 'planificacion',
            fields: [
              { name: 'apoyos', type: 'relationship', relationTo: 'instrumental', hasMany: true },
            ],
          },
        ],
      },
    ]

    expect(relacionesMultiples(campos)).toEqual([{ nombre: 'apoyos', destino: 'instrumental' }])
  })

  it('una relación polimórfica va al `_rels` aunque no sea de varias', () => {
    // Sin `hasMany`, pero con `relationTo` en arreglo: Payload no crea la
    // columna `origen_id`, crea columnas en el `_rels`. Exigirla sería un rojo
    // falso que manda a generar una migración que no arregla nada.
    const campos: Field[] = [
      { name: 'titulo', type: 'text' },
      { name: 'origen', type: 'relationship', relationTo: ['segmentos', 'medios'] },
    ]

    expect(columnasDe(campos)).toEqual(['titulo'])
    expect(relacionesMultiples(campos)).toEqual([{ nombre: 'origen', destino: 'segmentos' }])
  })

  it('una relación de una sí es columna, y un arreglo anidado sí es tabla', () => {
    // El contrapeso de las tres anteriores: al ensanchar lo que se mira es fácil
    // pasarse y dar por buena una columna que sí hace falta.
    const camposDelPaso: Field[] = [
      { name: 'instrumento', type: 'relationship', relationTo: 'instrumental' },
      { name: 'muestra', type: 'array', fields: [{ name: 'nodo', type: 'text' }] },
    ]
    const campos: Field[] = [{ name: 'pasos', type: 'array', fields: camposDelPaso }]

    expect(relacionesMultiples(campos)).toEqual([])
    expect(columnasDe(camposDelPaso)).toContain('instrumento_id')
    expect(tablasHijas(campos, 'cirugias').map((h) => h.tabla)).toEqual([
      'cirugias_pasos',
      'cirugias_pasos_muestra',
    ])
  })
})

describe('las migraciones siguen a las colecciones', () => {
  it('cada archivo de migración está registrado en el índice', () => {
    // `prodMigrations` recibe esta lista. Un archivo suelto que nadie importa
    // no se aplica nunca, y no hay ningún aviso de que exista.
    const enDisco = readdirSync(CARPETA)
      .filter((n) => n.endsWith('.ts') && n !== 'index.ts')
      .map((n) => n.replace(/\.ts$/, ''))
      .sort()
    const registradas = migrations.map((m) => m.name).sort()
    expect(registradas).toEqual(enDisco)
  })

  it('se aplican en orden cronológico', () => {
    // El nombre empieza por la fecha, así que el orden alfabético es el
    // cronológico. Aplicarlas desordenadas rompe las que dependen de una tabla
    // creada por la anterior.
    const nombres = migrations.map((m) => m.name)
    expect(nombres).toEqual([...nombres].sort())
  })

  it('cada migración trae su instantánea', () => {
    const json = new Set(
      readdirSync(CARPETA)
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.replace(/\.json$/, '')),
    )
    for (const { name } of migrations) {
      expect(json, `falta ${name}.json`).toContain(name)
    }
  })

  it('toda colección tiene su tabla en la última instantánea', () => {
    const { nombre, tablas } = ultimaInstantanea()
    for (const coleccion of COLECCIONES) {
      expect(
        Object.keys(tablas),
        `la colección '${coleccion.slug}' no tiene tabla en ${nombre}: falta una migración`,
      ).toContain(`public.${aTabla(coleccion.slug)}`)
    }
  })

  it('toda relación múltiple tiene su tabla de enlaces', () => {
    // El agujero que esto tapa: `columnasDe` se salta los campos «muchos a
    // muchos» porque no son una columna, y con eso se saltaba también la
    // comprobación entera. Un campo de relación múltiple añadido sin migración
    // pasaba las pruebas en verde y llegaba al servidor a una base sin la tabla
    // `..._rels`, que es la clase de fallo silencioso que D-056 existe para
    // impedir. Se descubrió al añadir la bandeja declarada de un caso.
    const { nombre, tablas } = ultimaInstantanea()
    for (const coleccion of COLECCIONES) {
      for (const campo of relacionesMultiples(coleccion.fields)) {
        const enlaces = tablas[`public.${aTabla(coleccion.slug)}_rels`]
        expect(
          enlaces,
          `${coleccion.slug}.${campo.nombre} es múltiple y no hay tabla de enlaces en ${nombre}: genere una migración`,
        ).toBeTruthy()
        expect(
          Object.keys(enlaces?.columns ?? {}),
          `${coleccion.slug}.${campo.nombre} apunta a ${campo.destino} y esa columna falta en ${nombre}`,
        ).toContain(`${aColumna(campo.destino)}_id`)
      }
    }
  })

  it('todo campo suelto de una colección tiene su columna', () => {
    const { nombre, tablas } = ultimaInstantanea()
    for (const coleccion of COLECCIONES) {
      const tabla = tablas[`public.${aTabla(coleccion.slug)}`]
      if (!tabla) continue // lo cubre la prueba anterior
      const columnas = Object.keys(tabla.columns ?? {})
      for (const esperada of columnasDe(coleccion.fields)) {
        expect(
          columnas,
          `${coleccion.slug}.${esperada} no está en ${nombre}: genere una migración`,
        ).toContain(esperada)
      }
    }
  })

  it('todo arreglo y todo bloque tienen su tabla, con sus columnas', () => {
    // El caso que se escapaba: añadir un campo dentro del arreglo `pasos` de
    // una cirugía —una tolerancia nueva, un dato nuevo de la pieza— pasaba las
    // cuatro órdenes de «Antes de subir» en verde, porque la comprobación de
    // columnas solo miraba el primer nivel de la tabla de la colección. En el
    // servidor la columna no existe, y guardar el caso desde el panel revienta
    // o deja de guardar ese campo sin decir nada.
    const { nombre, tablas } = ultimaInstantanea()
    for (const coleccion of COLECCIONES) {
      for (const hija of tablasHijas(coleccion.fields, aTabla(coleccion.slug))) {
        const tabla = tablas[`public.${hija.tabla}`]
        expect(
          tabla,
          `${coleccion.slug}.${hija.ruta} necesita la tabla '${hija.tabla}' y no está en ${nombre}: genere una migración`,
        ).toBeTruthy()
        const columnas = Object.keys(tabla?.columns ?? {})
        for (const esperada of columnasDe(hija.campos)) {
          expect(
            columnas,
            `${coleccion.slug}.${hija.ruta}.${esperada} no está en '${hija.tabla}' (${nombre}): genere una migración`,
          ).toContain(esperada)
        }
      }
    }
  })

  it('toda colección con borradores tiene sus tablas de versión', () => {
    // Activar `versions` no añade un campo: añade una familia entera de tablas
    // paralelas. Sin migración, el servidor arranca y el primer borrador que se
    // guarde se estrella contra una tabla que no está.
    const { nombre, tablas } = ultimaInstantanea()
    for (const coleccion of COLECCIONES) {
      if (!coleccion.versions) continue
      const raiz = `_${aTabla(coleccion.slug)}_v`
      expect(
        Object.keys(tablas),
        `'${coleccion.slug}' guarda versiones y no hay tabla '${raiz}' en ${nombre}: genere una migración`,
      ).toContain(`public.${raiz}`)
      // El `_rels` también se duplica en la familia de versiones
      // (`_cirugias_v_rels` junto a `cirugias_rels`), con las mismas columnas.
      // Se comprueba aquí, y no en la prueba de enlaces, porque esta tabla solo
      // existe si la colección guarda borradores.
      for (const campo of relacionesMultiples(coleccion.fields)) {
        const enlaces = tablas[`public.${raiz}_rels`]
        expect(
          enlaces,
          `la versión de ${coleccion.slug}.${campo.nombre} necesita la tabla '${raiz}_rels' y no está en ${nombre}: genere una migración`,
        ).toBeTruthy()
        expect(
          Object.keys(enlaces?.columns ?? {}),
          `${coleccion.slug}.${campo.nombre} apunta a ${campo.destino} y esa columna falta en '${raiz}_rels' (${nombre})`,
        ).toContain(`${aColumna(campo.destino)}_id`)
      }
      // En la tabla de versiones los campos del documento cuelgan de `version_`
      // (`_cirugias_v_version_piezas`). Los bloques son la excepción: Payload
      // los nombra igual que en la tabla normal (`_cirugias_v_blocks_texto`).
      for (const hija of tablasHijas(coleccion.fields, raiz, 'version_')) {
        const tabla = tablas[`public.${hija.tabla}`]
        expect(
          tabla,
          `la versión de ${coleccion.slug}.${hija.ruta} necesita la tabla '${hija.tabla}' y no está en ${nombre}: genere una migración`,
        ).toBeTruthy()
        const columnas = Object.keys(tabla?.columns ?? {})
        for (const esperada of columnasDe(hija.campos)) {
          expect(
            columnas,
            `${coleccion.slug}.${hija.ruta}.${esperada} no está en '${hija.tabla}' (${nombre}): genere una migración`,
          ).toContain(esperada)
        }
      }
    }
  })
})
