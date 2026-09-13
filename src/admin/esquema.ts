/**
 * Esquema del panel propio.
 *
 * Describe, para cada colección, qué campos tiene y cómo se editan. De aquí
 * salen a la vez la tabla del listado y el formulario del editor, de modo que
 * agregar un campo es agregar una línea y no tocar dos pantallas.
 *
 * Es deliberadamente **paralelo** a la definición de Payload en
 * `src/collections`, no derivado de ella: Payload describe cómo se guarda el
 * dato y quién puede tocarlo; esto describe cómo se edita. Mezclarlos ataría la
 * interfaz a los detalles del almacenamiento, y la prueba de
 * `tests/unit/esquema.test.ts` se encarga de que no se separen sin que nadie se
 * entere: comprueba que todo campo del esquema exista en la colección y que
 * todo campo obligatorio de la colección esté en el esquema.
 *
 * No hay tipos aquí que Payload no sepa guardar, ni al revés.
 */

// `bloques.ts` solo importa de aquí un tipo, que se borra al compilar, así que
// este par no forma un ciclo en tiempo de ejecución.
import { BLOQUES } from './bloques'

export type TipoDeCampo =
  | 'texto'
  | 'area'
  | 'numero'
  | 'seleccion'
  | 'casilla'
  | 'relacion'
  | 'archivo'
  | 'rico'
  | 'lista'
  | 'grupo'
  | 'bloques'

export interface Opcion {
  valor: string
  etiqueta: string
}

/**
 * Condición entre la opción elegida en una selección y sus campos hermanos.
 *
 * `campos` se cumple con **uno**: son parejas de mínimo y máximo, y declarar
 * solo un extremo es legítimo. `mensaje` es el texto que lee el traumatólogo, y
 * es exactamente el mismo que devuelve la colección al cortar, porque las dos
 * lo sacan de la misma lista.
 */
export interface ReglaDeSeleccion {
  opcion: string
  campos: string[]
  mensaje: string
}

interface CampoBase {
  nombre: string
  etiqueta: string
  requerido?: boolean
  ayuda?: string
  /** Ocupa media fila en el formulario. Dos seguidos comparten línea. */
  medio?: boolean
}

export type Campo =
  | (CampoBase & { tipo: 'texto' })
  | (CampoBase & { tipo: 'area'; filas?: number })
  | (CampoBase & { tipo: 'numero'; min?: number; max?: number; paso?: number })
  | (CampoBase & {
      tipo: 'seleccion'
      opciones: Opcion[]
      /**
       * Con qué opción se queda un valor obligatorio que no llega.
       *
       * Sin esto el respaldo era `opciones[0]`, y el orden de la lista es de
       * presentación: en `rol` está «piel» primera porque es la capa más
       * externa, no porque una pieza sin clasificar sea piel. Tiene que
       * coincidir con el `defaultValue` del mismo campo en `src/collections`,
       * porque el de Payload no llega a actuar nunca: `depurarCampos` escribe
       * siempre la clave y un `defaultValue` solo se aplica ante `undefined`.
       */
      porOmision?: string
      /**
       * Qué más hay que llenar según la opción que se elija.
       *
       * Adelanta en el panel una validación que la colección hace al publicar.
       * No es una copia suya: es la misma lista, que la colección importa de
       * aquí (`REGLAS_DEL_OBJETIVO_DEL_PASO`). Adelantarla hace falta porque la
       * de la colección es la que manda —es el único punto por el que pasan
       * todas las escrituras— pero Payload la envuelve en un `ValidationError`
       * cuyo `message` dice «The following field is invalid: Qué se evalúa» y
       * deja el texto en español dentro de `error.data`, que es justo lo que
       * `accion()` no enseña: el traumatólogo veía media frase en inglés con el
       * nombre del campo y ninguna pista de qué rellenar.
       *
       * La atiende `faltantes` en `src/admin/depurar.ts`, y solo al publicar.
       */
      exigeAlguno?: ReglaDeSeleccion[]
      /**
       * Qué **no** puede venir lleno según la opción que se elija.
       *
       * El reverso de `exigeAlguno`, y tampoco está por simetría: lo pide el
       * motor. El porqué entero va junto a la regla, en
       * `REGLAS_DEL_OBJETIVO_DEL_PASO`, que es de donde salen las dos.
       */
      prohibeAlguno?: ReglaDeSeleccion[]
    })
  | (CampoBase & { tipo: 'casilla' })
  | (CampoBase & {
      tipo: 'relacion'
      coleccion: string
      /**
       * Varios a la vez, con casillas en vez de desplegable.
       *
       * Un desplegable múltiple obliga a mantener pulsada una tecla para
       * añadir el segundo, cosa que nadie descubre solo. Con casillas se ve de
       * un vistazo qué está marcado y qué no, que es exactamente lo que hay
       * que ver al componer una bandeja.
       */
      multiple?: boolean
    })
  | (CampoBase & { tipo: 'archivo'; coleccion: string; acepta?: string })
  | (CampoBase & { tipo: 'rico' })
  | (CampoBase & {
      tipo: 'lista'
      campos: Campo[]
      singular: string
      /**
       * Editor propio que se pinta encima de las filas.
       *
       * `piezas3d` abre el modelo elegido en el campo hermano `modelo` y deja
       * señalar cada trozo con el ratón. Sin él, esas filas piden el nombre
       * exacto del objeto de Blender escrito de memoria, y una letra de
       * diferencia no da error: deja una pieza que no se enciende ni se apaga.
       */
      editor?: 'piezas3d'
    })
  | (CampoBase & {
      tipo: 'grupo'
      campos: Campo[]
      /**
       * Editor propio que se pinta encima de los subcampos.
       *
       * Hoy solo hay uno, `encuadre3d`: el visor con el que el traumatólogo
       * deja el modelo como quiere y captura el encuadre. Sin él, ese grupo son
       * cinco casillas numéricas que nadie sabe con qué rellenar.
       */
      editor?: 'encuadre3d'
    })
  | (CampoBase & { tipo: 'bloques' })

export interface Seccion {
  titulo: string
  descripcion?: string
  campos: Campo[]
}

export interface Columna {
  nombre: string
  etiqueta: string
  /** Cómo se presenta el valor en la tabla del listado. */
  formato?: 'texto' | 'fecha' | 'estado' | 'relacion' | 'booleano' | 'numero'
}

export interface EsquemaDeColeccion {
  slug: string
  singular: string
  plural: string
  /**
   * Género del singular, para concordar las frases que lo llevan al lado.
   *
   * El femenino estaba escrito fijo en las pantallas, porque los cinco módulos
   * que se escribieron primero son todos femeninos: el editor decía «✓
   * Publicada» encima de «Modelo 3D» y el listado lo repetía por su cuenta, con
   * su propio literal. Es dato de la colección y no de cada pantalla por lo
   * mismo que el resto del esquema: las dos que enseñan el mismo estado —la
   * insignia del editor y la del listado— no pueden concordarlo distinto si lo
   * componen con la misma función. Quien lo compone es `estadoEnPalabras`, aquí
   * abajo, y de ahí salen hoy las dos: `FormularioDocumento.tsx` y
   * `TablaDocumentos.tsx` ya no llevan ningún literal de estado.
   *
   * La otra frase que iba en femenino fijo —la salida que ofrece el `confirm`
   * de eliminar— no se arregló con el género sino nombrando el botón, porque su
   * problema mayor era otro: ver `salidaSuave` en `FormularioDocumento.tsx`. De
   * modo que este campo tiene un solo lector, y basta: es el que se veía.
   *
   * Va sin `?` a propósito: así una colección nueva no puede olvidarlo sin que
   * el compilador lo diga. Con respaldo, lo olvidado se leería como femenino y
   * el defecto volvería en silencio, que es como llegó hasta aquí.
   */
  genero: 'm' | 'f'
  /** Campo que da nombre a cada registro en listados y migas de pan. */
  titulo: string
  descripcion?: string
  /** Las colecciones versionadas distinguen borrador de publicado. */
  versionada: boolean
  /** Grupo bajo el que aparece en la navegación del panel. */
  familia: 'modulos' | 'apoyo'
  columnas: Columna[]
  /** Campos por los que busca el cuadro de búsqueda del listado. */
  buscarEn: string[]
  secciones: Seccion[]
  /**
   * Colecciones de archivo: el registro nace de una subida y no de un
   * formulario vacío.
   *
   * `maximoBytes` es el mismo techo que anuncia `ayuda`, pero en cifra. La
   * frase la lee el traumatólogo; la cifra la comprueba `subirArchivo` antes de
   * entregarle el archivo a Payload. Iban solo en prosa, y por eso el panel
   * pudo prometer 50 MB mientras Next cortaba el cuerpo en 8 sin decir nada:
   * una frase no la puede comprobar nadie. Escritos juntos, separarlos exige
   * verlos a la vez.
   */
  subida?: { acepta: string; ayuda: string; maximoBytes: number }
}

// ---------------------------------------------------------------- auxiliares

/** Pila de bloques: el campo que se repite en los cinco módulos. */
const bloques = (nombre: string, etiqueta: string): Campo => ({
  tipo: 'bloques',
  nombre,
  etiqueta,
  ayuda: 'Apile los bloques que necesite y muévalos con las flechas.',
})

const TIPO_DE_FICHA: Opcion[] = [
  { valor: 'trauma', etiqueta: 'Trauma' },
  { valor: 'ortopedia', etiqueta: 'Ortopedia' },
]

// ------------------------------------------------------------------- módulos

export const Patologias: EsquemaDeColeccion = {
  slug: 'patologias',
  singular: 'Patología',
  plural: 'Patologías',
  genero: 'f',
  titulo: 'nombre',
  descripcion: 'Fichas por segmento. Cada una termina en manejo y rehabilitación.',
  versionada: true,
  familia: 'modulos',
  buscarEn: ['nombre', 'subtitulo', 'codigo'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Nombre' },
    { nombre: 'segmento', etiqueta: 'Segmento', formato: 'relacion' },
    { nombre: 'codigo', etiqueta: 'Código' },
    { nombre: '_status', etiqueta: 'Estado', formato: 'estado' },
    { nombre: 'updatedAt', etiqueta: 'Editada', formato: 'fecha' },
  ],
  secciones: [
    {
      titulo: 'Identificación',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre de la patología', requerido: true },
        { tipo: 'texto', nombre: 'subtitulo', etiqueta: 'Subtítulo' },
        {
          tipo: 'relacion',
          nombre: 'segmento',
          etiqueta: 'Segmento anatómico',
          coleccion: 'segmentos',
          requerido: true,
          medio: true,
        },
        {
          tipo: 'texto',
          nombre: 'codigo',
          etiqueta: 'Código AO/OTA o abreviatura',
          medio: true,
        },
        { tipo: 'seleccion', nombre: 'tipo', etiqueta: 'Tipo', opciones: TIPO_DE_FICHA },
      ],
    },
    { titulo: 'Definición', campos: [bloques('definicion', 'Contenido de la pestaña')] },
    { titulo: 'Mecanismo', campos: [bloques('mecanismo', 'Contenido de la pestaña')] },
    { titulo: 'Clasificación', campos: [bloques('clasificacion', 'Contenido de la pestaña')] },
    { titulo: 'Evaluación', campos: [bloques('evaluacion', 'Contenido de la pestaña')] },
    { titulo: 'Manejo', campos: [bloques('manejo', 'Contenido de la pestaña')] },
    {
      titulo: 'Rehabilitación',
      descripcion: 'La pestaña que abre la plataforma al equipo de kinesiología.',
      campos: [
        bloques('rehabilitacion', 'Contenido de la pestaña'),
        {
          tipo: 'lista',
          nombre: 'fases',
          etiqueta: 'Fases de rehabilitación',
          singular: 'Fase',
          campos: [
            { tipo: 'texto', nombre: 'cuando', etiqueta: 'Periodo', requerido: true, medio: true },
            {
              tipo: 'texto',
              nombre: 'titulo',
              etiqueta: 'Objetivo de la fase',
              requerido: true,
              medio: true,
            },
            { tipo: 'area', nombre: 'contenido', etiqueta: 'Qué se trabaja', requerido: true },
            { tipo: 'area', nombre: 'criterio', etiqueta: 'Criterio para progresar' },
          ],
        },
      ],
    },
  ],
}

export const Maniobras: EsquemaDeColeccion = {
  slug: 'maniobras',
  singular: 'Maniobra',
  plural: 'Maniobras',
  genero: 'f',
  titulo: 'nombre',
  descripcion: 'Maniobras de exploración física, agrupadas por segmento.',
  versionada: true,
  familia: 'modulos',
  buscarEn: ['nombre', 'evalua'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Maniobra' },
    { nombre: 'segmento', etiqueta: 'Segmento', formato: 'relacion' },
    { nombre: 'evalua', etiqueta: 'Qué evalúa' },
    { nombre: '_status', etiqueta: 'Estado', formato: 'estado' },
    { nombre: 'updatedAt', etiqueta: 'Editada', formato: 'fecha' },
  ],
  secciones: [
    {
      titulo: 'La maniobra',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre de la maniobra', requerido: true },
        {
          tipo: 'relacion',
          nombre: 'segmento',
          etiqueta: 'Segmento',
          coleccion: 'segmentos',
          requerido: true,
          medio: true,
        },
        { tipo: 'texto', nombre: 'evalua', etiqueta: 'Qué evalúa', requerido: true, medio: true },
        { tipo: 'rico', nombre: 'tecnica', etiqueta: 'Técnica', requerido: true },
        {
          tipo: 'rico',
          nombre: 'positivo',
          etiqueta: 'Qué se considera positivo',
          requerido: true,
        },
        { tipo: 'rico', nombre: 'nota', etiqueta: 'Nota de interpretación' },
      ],
    },
    { titulo: 'Material adicional', campos: [bloques('contenido', 'Material adicional')] },
  ],
}

export const CasosAO: EsquemaDeColeccion = {
  slug: 'casos-ao',
  singular: 'Caso AO',
  plural: 'Casos AO',
  genero: 'm',
  titulo: 'titulo',
  descripcion: 'Casos paso a paso con el principio AO de cada gesto.',
  versionada: true,
  familia: 'modulos',
  buscarEn: ['titulo', 'codigo'],
  columnas: [
    { nombre: 'titulo', etiqueta: 'Caso' },
    { nombre: 'codigo', etiqueta: 'Código AO/OTA' },
    { nombre: '_status', etiqueta: 'Estado', formato: 'estado' },
    { nombre: 'updatedAt', etiqueta: 'Editado', formato: 'fecha' },
  ],
  secciones: [
    {
      titulo: 'El caso',
      campos: [
        { tipo: 'texto', nombre: 'titulo', etiqueta: 'Título del caso', requerido: true },
        { tipo: 'texto', nombre: 'codigo', etiqueta: 'Código AO/OTA', medio: true },
        { tipo: 'rico', nombre: 'procedimiento', etiqueta: 'Procedimiento' },
      ],
    },
    {
      titulo: 'Pasos',
      descripcion: 'El residente los recorre en este orden.',
      campos: [
        {
          tipo: 'lista',
          nombre: 'pasos',
          etiqueta: 'Pasos de la cirugía',
          singular: 'Paso',
          campos: [
            { tipo: 'texto', nombre: 'titulo', etiqueta: 'Título del paso', requerido: true },
            { tipo: 'rico', nombre: 'descripcion', etiqueta: 'Qué se hace', requerido: true },
            {
              tipo: 'texto',
              nombre: 'principio',
              etiqueta: 'Principio AO en juego',
              requerido: true,
            },
            { tipo: 'rico', nombre: 'nota', etiqueta: 'Nota técnica' },
            {
              tipo: 'relacion',
              nombre: 'modelo',
              etiqueta: 'Modelo 3D del paso',
              coleccion: 'modelos-3d',
            },
          ],
        },
      ],
    },
    { titulo: 'Material adicional', campos: [bloques('contenido', 'Material adicional')] },
  ],
}

/**
 * Qué tiene que traer, y qué no puede traer, un paso según lo que evalúa.
 *
 * Las aplican dos archivos. `src/collections/Cirugias.ts` las hace cumplir al
 * publicar, que es donde se corta de verdad: la colección es el único punto por
 * el que pasan todas las escrituras. `src/admin/depurar.ts` las adelanta en el
 * panel para que el motivo llegue en español y señalando la fila.
 *
 * Estuvieron escritas dos veces, con los mismos textos copiados a mano, y se
 * separaron: la tercera —la que prohíbe— llegó a la colección y no al panel, de
 * modo que durante ese tiempo el caso se rechazaba con el «The following field
 * is invalid: Qué se evalúa» de Payload, en inglés y con el español encerrado
 * en `error.data`, que `accion()` no enseña. Un defecto que solo se nota por lo
 * que deja de pasar no lo encuentra nadie mirando, así que ahora hay una lista
 * y las dos la importan.
 *
 * Vive aquí, y no en la colección que las hace cumplir, porque el camino
 * contrario no se puede recorrer: este archivo lo importa el formulario del
 * navegador, y `Cirugias.ts` arrastra el adaptador de Payload, el control de
 * acceso y los ganchos. Es la excepción a lo que dice la cabecera —esquema y
 * colección son paralelos, no derivados— y sale barata, porque lo que la
 * colección importa de aquí son datos sin código.
 *
 * `reduccion` no tiene regla a propósito: sus tres tolerancias tienen
 * `defaultValue: 5` y `DEFAULT 5` en la migración, de modo que siempre hay
 * rango contra el que medir.
 */
export const REGLAS_DEL_OBJETIVO_DEL_PASO: {
  exige: ReglaDeSeleccion[]
  prohibe: ReglaDeSeleccion[]
} = {
  exige: [
    {
      opcion: 'trazo',
      campos: ['trazoMinimo', 'trazoMaximo'],
      mensaje:
        'Un paso que evalúa el trazo necesita al menos una de las dos longitudes: sin rango, cualquier incisión se da por buena.',
    },
    {
      opcion: 'fuerza',
      campos: ['fuerzaMinima', 'fuerzaMaxima'],
      mensaje:
        'Un paso que evalúa la fuerza necesita al menos uno de los dos topes: sin rango, cualquier fuerza se da por buena.',
    },
  ],
  prohibe: [
    {
      // La única que prohíbe, la que más se dispara y la que no está por
      // simetría: la pide el motor. `objetivoDelPaso` (src/lib/simulador.ts) no
      // se fía del valor `instrumento` —es lo que el `DEFAULT` de la columna
      // escribió en TODA fila anterior al 10 de septiembre—, así que ante él
      // deduce el modo del rango que el paso traiga, y un número de fuerza
      // olvidado convierte en silencio «elija el punzón» en «aplique entre 8 y
      // 20 N». Olvidarlo es además el gesto natural: el editor pinta los siete
      // números uno debajo de otro, sin esconder los que no tocan.
      //
      // Las tres tolerancias quedan fuera: las lleva puestas toda fila por su
      // `defaultValue`, así que no prueban intención de nadie. Los cuatro de
      // fuerza y trazo se crearon sin `DEFAULT`, y ahí un número lo tecleó una
      // persona.
      opcion: 'instrumento',
      campos: ['fuerzaMinima', 'fuerzaMaxima', 'trazoMinimo', 'trazoMaximo'],
      mensaje:
        'Un paso que solo pide elegir el instrumento no puede llevar además un rango de fuerza o de incisión: borre esos números, o cambie el objetivo al que de verdad se mide.',
    },
  ],
}

export const Cirugias: EsquemaDeColeccion = {
  slug: 'cirugias',
  singular: 'Cirugía simulada',
  plural: 'Cirugías simuladas',
  genero: 'f',
  titulo: 'nombre',
  descripcion: 'Caso quirúrgico con su modelo 3D, su guion de pasos y su puntaje.',
  versionada: true,
  familia: 'modulos',
  buscarEn: ['nombre', 'codigo'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Caso' },
    { nombre: 'codigo', etiqueta: 'Código' },
    { nombre: '_status', etiqueta: 'Estado', formato: 'estado' },
    { nombre: 'updatedAt', etiqueta: 'Editado', formato: 'fecha' },
  ],
  secciones: [
    {
      titulo: 'El caso',
      descripcion:
        'Hueso, trazo y técnica salen de catálogos que usted mismo edita en Contenido. Si falta alguno, créelo ahí y vuelva.',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre del caso', requerido: true },
        { tipo: 'relacion', nombre: 'hueso', etiqueta: 'Hueso', coleccion: 'huesos-ao', medio: true },
        {
          tipo: 'relacion',
          nombre: 'clasificacion',
          etiqueta: 'Clasificación AO',
          coleccion: 'clasificaciones-ao',
          medio: true,
        },
        {
          tipo: 'relacion',
          nombre: 'tecnica',
          etiqueta: 'Técnica',
          coleccion: 'tecnicas-quirurgicas',
          medio: true,
        },
        {
          tipo: 'texto',
          nombre: 'codigo',
          etiqueta: 'Código AO/OTA',
          medio: true,
          ayuda: 'Déjelo vacío y se compone solo con el número del hueso y el de la clasificación.',
        },
        { tipo: 'rico', nombre: 'resumen', etiqueta: 'Resumen del procedimiento' },
      ],
    },
    {
      titulo: 'El modelo',
      descripcion:
        'Exporte desde Blender el hueso ya partido y REDUCIDO, con cada trozo como un objeto con nombre. El desplazamiento de la fractura se describe aquí abajo, no en el archivo: así la reducción correcta es siempre volver al cero y la consola puede medir cuánto falta.',
      campos: [
        {
          tipo: 'relacion',
          nombre: 'modelo',
          etiqueta: 'Modelo 3D del caso',
          coleccion: 'modelos-3d',
        },
        {
          tipo: 'relacion',
          nombre: 'instrumental',
          etiqueta: 'Bandeja del caso',
          coleccion: 'instrumental',
          multiple: true,
          ayuda:
            'Si se deja vacía, la componen los instrumentos que piden los pasos. Declararla sirve para añadir señuelos: instrumentos que no usa ningún paso pero que en pabellón estarían ahí. Lo que un paso necesita se añade solo, aunque aquí falte.',
        },
        {
          tipo: 'numero',
          nombre: 'milimetrosPorUnidad',
          etiqueta: 'Milímetros por unidad',
          medio: true,
          ayuda: 'glTF trabaja en metros: 1000 es lo normal. Si exportó en milímetros, ponga 1.',
        },
        {
          tipo: 'seleccion',
          nombre: 'ejeLargo',
          etiqueta: 'Eje largo del hueso',
          medio: true,
          opciones: [
            { valor: 'y', etiqueta: 'Y (vertical, lo habitual)' },
            { valor: 'x', etiqueta: 'X' },
            { valor: 'z', etiqueta: 'Z' },
          ],
        },
        {
          tipo: 'lista',
          nombre: 'piezas',
          etiqueta: 'Piezas del modelo',
          editor: 'piezas3d',
          singular: 'Pieza',
          ayuda:
            'El nombre tiene que coincidir exactamente con el del objeto en Blender. Marque una sola como fragmento móvil: es la que el residente reduce.',
          campos: [
            { tipo: 'texto', nombre: 'nodo', etiqueta: 'Nombre del objeto', requerido: true, medio: true },
            { tipo: 'texto', nombre: 'etiqueta', etiqueta: 'Cómo llamarlo en pantalla', medio: true },
            {
              tipo: 'seleccion',
              nombre: 'rol',
              etiqueta: 'Qué es',
              requerido: true,
              // El mismo valor que `defaultValue` en `src/collections/Cirugias.ts`
              // y que el DEFAULT de la columna. Una fila añadida con «+ Agregar
              // pieza» nace vacía, y con el respaldo por orden de lista se
              // guardaba como «piel» mientras el taller la enseñaba como «Hueso
              // fijo»: la consola abre con piel y músculo apagados, así que el
              // hueso recién declarado era invisible hasta que alguien marcaba
              // a mano la casilla «Piel».
              //
              // Lo que se enseña lo cierra `seleccionVisible` en
              // `formulario/Campos.tsx`, que calca este mismo respaldo cuando el
              // valor llega vacío; los dos se mueven juntos. Antes no era así, y
              // se veía: el desplegable genérico usaba `value={texto(valor)}` y,
              // por ser obligatorio el campo, no ofrecía opción vacía, de modo
              // que el navegador enseñaba la primera —«Piel»— sobre una fila que
              // se estaba guardando como hueso.
              porOmision: 'hueso',
              opciones: [
                { valor: 'piel', etiqueta: 'Piel' },
                { valor: 'musculo', etiqueta: 'Músculo' },
                { valor: 'hueso', etiqueta: 'Hueso (fijo)' },
                { valor: 'fragmento', etiqueta: 'Fragmento móvil' },
                { valor: 'implante', etiqueta: 'Implante' },
              ],
            },
          ],
        },
        {
          tipo: 'grupo',
          nombre: 'desplazamientoInicial',
          etiqueta: 'Desplazamiento inicial de la fractura',
          ayuda: 'Cómo está el fragmento al abrir el caso. En milímetros y grados.',
          campos: [
            { tipo: 'numero', nombre: 'x', etiqueta: 'Lateral (mm)', medio: true },
            { tipo: 'numero', nombre: 'y', etiqueta: 'Axial (mm)', medio: true },
            { tipo: 'numero', nombre: 'z', etiqueta: 'Anteroposterior (mm)', medio: true },
            { tipo: 'numero', nombre: 'giroX', etiqueta: 'Angulación X (°)', medio: true },
            { tipo: 'numero', nombre: 'giroY', etiqueta: 'Rotación Y (°)', medio: true },
            { tipo: 'numero', nombre: 'giroZ', etiqueta: 'Angulación Z (°)', medio: true },
          ],
        },
      ],
    },
    {
      titulo: 'Guion quirúrgico',
      descripcion:
        'Cada paso declara qué se le mide al residente. Solo el título y el objetivo son obligatorios: rellene lo demás cuando lo tenga claro, y publique cuando esté completo.',
      campos: [
        {
          tipo: 'lista',
          nombre: 'pasos',
          etiqueta: 'Pasos del guion',
          singular: 'Paso',
          campos: [
            { tipo: 'texto', nombre: 'titulo', etiqueta: 'Título del paso', requerido: true, medio: true },
            {
              tipo: 'relacion',
              nombre: 'fase',
              etiqueta: 'Fase',
              coleccion: 'fases-quirurgicas',
              medio: true,
            },
            { tipo: 'rico', nombre: 'descripcion', etiqueta: 'Qué se hace' },
            {
              tipo: 'seleccion',
              nombre: 'objetivo',
              etiqueta: 'Qué se evalúa',
              requerido: true,
              medio: true,
              opciones: [
                { valor: 'instrumento', etiqueta: 'Elegir el instrumento correcto' },
                { valor: 'trazo', etiqueta: 'Trazar una incisión de la longitud correcta' },
                { valor: 'reduccion', etiqueta: 'Reducir dentro de la tolerancia' },
                { valor: 'fuerza', etiqueta: 'Aplicar la fuerza correcta' },
              ],
              // Las tres reglas no se escriben aquí: son las mismas que hace
              // cumplir `exigeElRangoDeSuObjetivo` en
              // `src/collections/Cirugias.ts`, que las importa de la misma
              // lista. Escribirlas otra vez aquí es lo que hizo que se
              // separaran; ver `REGLAS_DEL_OBJETIVO_DEL_PASO`.
              exigeAlguno: REGLAS_DEL_OBJETIVO_DEL_PASO.exige,
              prohibeAlguno: REGLAS_DEL_OBJETIVO_DEL_PASO.prohibe,
            },
            {
              tipo: 'relacion',
              nombre: 'instrumento',
              etiqueta: 'Instrumento correcto',
              coleccion: 'instrumental',
              medio: true,
            },
            { tipo: 'numero', nombre: 'puntos', etiqueta: 'Puntos que vale', medio: true },
            {
              tipo: 'numero',
              nombre: 'trazoMinimo',
              etiqueta: 'Incisión mínima (mm)',
              medio: true,
              ayuda: 'Solo si el objetivo es trazar.',
            },
            { tipo: 'numero', nombre: 'trazoMaximo', etiqueta: 'Incisión máxima (mm)', medio: true },
            {
              tipo: 'numero',
              nombre: 'toleranciaDesplazamiento',
              etiqueta: 'Desplazamiento aceptable (mm)',
              medio: true,
              ayuda: 'Solo si el objetivo es reducir.',
            },
            {
              tipo: 'numero',
              nombre: 'toleranciaDiastasis',
              etiqueta: 'Diástasis aceptable (mm)',
              medio: true,
            },
            {
              tipo: 'numero',
              nombre: 'toleranciaAngulacion',
              etiqueta: 'Angulación aceptable (°)',
              medio: true,
            },
            {
              tipo: 'numero',
              nombre: 'fuerzaMinima',
              etiqueta: 'Fuerza mínima útil (N)',
              medio: true,
              ayuda: 'Solo si el objetivo es la fuerza.',
            },
            { tipo: 'numero', nombre: 'fuerzaMaxima', etiqueta: 'Fuerza máxima útil (N)', medio: true },
            {
              tipo: 'lista',
              nombre: 'muestra',
              etiqueta: 'Piezas que se ven en este paso',
              singular: 'Pieza',
              ayuda: 'Vacío: se mantiene lo del paso anterior.',
              campos: [{ tipo: 'texto', nombre: 'nodo', etiqueta: 'Nombre del objeto', requerido: true }],
            },
            { tipo: 'area', nombre: 'exito', etiqueta: 'Si lo hace bien' },
            { tipo: 'area', nombre: 'insuficiente', etiqueta: 'Si se queda corto' },
            { tipo: 'area', nombre: 'excesivo', etiqueta: 'Si se pasa' },
            { tipo: 'rico', nombre: 'riesgo', etiqueta: 'Estructura o principio en juego' },
          ],
        },
      ],
    },
    { titulo: 'Material adicional', campos: [bloques('contenido', 'Material adicional')] },
  ],
}

export const EstudiosIA: EsquemaDeColeccion = {
  slug: 'estudios-ia',
  singular: 'Estudio de demostración',
  plural: 'Estudios de demostración',
  genero: 'm',
  titulo: 'nombre',
  descripcion: 'Casos de lectura de imágenes con la clasificación propuesta y sus opciones.',
  versionada: true,
  familia: 'modulos',
  buscarEn: ['nombre', 'codigo'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Caso' },
    { nombre: 'codigo', etiqueta: 'Clasificación' },
    { nombre: 'confianza', etiqueta: 'Confianza', formato: 'numero' },
    { nombre: '_status', etiqueta: 'Estado', formato: 'estado' },
    { nombre: 'updatedAt', etiqueta: 'Editado', formato: 'fecha' },
  ],
  secciones: [
    {
      titulo: 'El estudio',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre del caso', requerido: true },
        { tipo: 'texto', nombre: 'codigo', etiqueta: 'Clasificación propuesta', medio: true },
        {
          tipo: 'numero',
          nombre: 'confianza',
          etiqueta: 'Confianza declarada (%)',
          min: 0,
          max: 100,
          medio: true,
        },
        {
          tipo: 'lista',
          nombre: 'hallazgos',
          etiqueta: 'Hallazgos',
          singular: 'Hallazgo',
          campos: [{ tipo: 'area', nombre: 'texto', etiqueta: 'Hallazgo', requerido: true }],
        },
      ],
    },
    {
      titulo: 'Opciones de manejo',
      descripcion: 'Cada opción con sus argumentos a favor y en contra.',
      campos: [
        {
          tipo: 'lista',
          nombre: 'opciones',
          etiqueta: 'Opciones',
          singular: 'Opción',
          campos: [
            { tipo: 'texto', nombre: 'titulo', etiqueta: 'Opción', requerido: true },
            {
              tipo: 'casilla',
              nombre: 'frecuente',
              etiqueta: 'Coincide con la indicación más frecuente',
            },
            {
              tipo: 'lista',
              nombre: 'aFavor',
              etiqueta: 'A favor',
              singular: 'Argumento',
              campos: [{ tipo: 'area', nombre: 'texto', etiqueta: 'Argumento', requerido: true }],
            },
            {
              tipo: 'lista',
              nombre: 'enContra',
              etiqueta: 'En contra',
              singular: 'Argumento',
              campos: [{ tipo: 'area', nombre: 'texto', etiqueta: 'Argumento', requerido: true }],
            },
          ],
        },
      ],
    },
    { titulo: 'Material adicional', campos: [bloques('contenido', 'Material adicional')] },
  ],
}

// ---------------------------------------------------------------- de apoyo

export const Segmentos: EsquemaDeColeccion = {
  slug: 'segmentos',
  singular: 'Segmento',
  plural: 'Segmentos anatómicos',
  genero: 'm',
  titulo: 'nombre',
  // Decía «y el mapa corporal del examen físico». No hay tal mapa: `zonaMapa`
  // se guarda desde la primera migración y no lo lee ninguna página, y
  // `examen-fisico/page.tsx` agrupa por segmento en secciones con su título,
  // sin silueta ninguna. La colección ya lo corrigió en su propio texto
  // (`src/collections/Segmentos.ts`), pero ese texto no lo pinta nadie desde
  // que se retiró la interfaz de Payload (D-038): el que se lee es este.
  descripcion: 'Ordenan la biblioteca y agrupan las maniobras del examen físico.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['nombre'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Segmento' },
    { nombre: 'orden', etiqueta: 'Orden', formato: 'numero' },
    { nombre: 'updatedAt', etiqueta: 'Editado', formato: 'fecha' },
  ],
  secciones: [
    {
      titulo: 'El segmento',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre del segmento', requerido: true },
        { tipo: 'numero', nombre: 'orden', etiqueta: 'Orden de aparición', medio: true },
      ],
    },
    {
      titulo: 'Zona en el mapa corporal',
      // La sección se queda, con su promesa retirada. Las cuatro columnas
      // existen desde la migración inicial y soltarlas cuesta otra migración,
      // así que quitarlas de aquí dejaría un campo de la colección sin ninguna
      // pantalla desde la que tocarlo —justo lo que vigila
      // `tests/unit/esquema.test.ts`—. Lo que sí se retira es la frase que
      // anunciaba un mapa que no existe: el traumatólogo rellenaba cuatro
      // casillas creyendo que dibujaba algo.
      descripcion:
        'Reservado para el mapa corporal: todavía no se dibuja en ninguna página, así que rellenarlo no cambia nada de lo que ve el residente.',
      campos: [
        {
          tipo: 'grupo',
          nombre: 'zonaMapa',
          etiqueta: 'Recuadro',
          campos: [
            { tipo: 'numero', nombre: 'x', etiqueta: 'X', medio: true },
            { tipo: 'numero', nombre: 'y', etiqueta: 'Y', medio: true },
            { tipo: 'numero', nombre: 'ancho', etiqueta: 'Ancho', medio: true },
            { tipo: 'numero', nombre: 'alto', etiqueta: 'Alto', medio: true },
          ],
        },
      ],
    },
  ],
}

export const Medios: EsquemaDeColeccion = {
  slug: 'medios',
  singular: 'Archivo',
  plural: 'Medios',
  genero: 'm',
  titulo: 'alt',
  descripcion: 'Imágenes y videos que se insertan en los bloques de contenido.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['alt', 'filename'],
  columnas: [
    { nombre: 'alt', etiqueta: 'Descripción' },
    { nombre: 'filename', etiqueta: 'Archivo' },
    { nombre: 'mimeType', etiqueta: 'Tipo' },
    { nombre: 'updatedAt', etiqueta: 'Subido', formato: 'fecha' },
  ],
  subida: {
    acepta: 'image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm',
    // Decía 50 MB, que es el techo de `upload.limits` en `payload.config.ts`, y
    // ese nunca se llega a ejercer: la subida va por acción de servidor y Next
    // corta el cuerpo en los 8 MB de `serverActions.bodySizeLimit`
    // (`next.config.mjs`). Un vídeo de 14 MB —el caso corriente del módulo 02—
    // se rechazaba en el marco, sin mensaje, seis veces por debajo del número
    // que el panel prometía. Se anuncian 7 MB y no 8 porque el cuerpo lleva
    // además el formulario y su codificación. Los dos números se deciden
    // juntos: cambiar uno sin el otro los vuelve a separar.
    ayuda: 'Imagen (PNG, JPG, WEBP, SVG) o video (MP4, WEBM). Máximo 7 MB.',
    maximoBytes: 7 * 1024 * 1024,
  },
  secciones: [
    {
      titulo: 'El archivo',
      campos: [
        {
          tipo: 'texto',
          nombre: 'alt',
          etiqueta: 'Descripción para lectores de pantalla',
          requerido: true,
          ayuda: 'Qué se ve en la imagen. Sin esto la plataforma no es accesible.',
        },
      ],
    },
  ],
}

export const Modelos3D: EsquemaDeColeccion = {
  slug: 'modelos-3d',
  singular: 'Modelo 3D',
  plural: 'Modelos 3D',
  genero: 'm',
  titulo: 'nombre',
  descripcion: 'Mallas obtenidas de TC y RM segmentadas.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['nombre', 'filename'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Modelo' },
    { nombre: 'origen', etiqueta: 'Origen' },
    { nombre: 'triangulos', etiqueta: 'Triángulos', formato: 'numero' },
    { nombre: 'anonimizado', etiqueta: 'Anonimizado', formato: 'booleano' },
    { nombre: 'updatedAt', etiqueta: 'Subido', formato: 'fecha' },
  ],
  subida: {
    acepta: '.glb,model/gltf-binary',
    // El porqué del `.glb` va en la ayuda y no en un comentario: quien exporta
    // desde Blender tiene delante tres opciones —«glTF Separate», «glTF
    // Embedded» y «glTF Binary»— y elegir mal no da un error que se entienda,
    // sino un rechazo por firma del archivo. El glTF de texto sale acompañado
    // de un `.bin` y de las texturas sueltas, y aquí se guarda **un** archivo
    // por modelo: los demás se quedarían fuera y el modelo abriría sin
    // geometría o sin color. La razón completa está en
    // `src/uploads/validarModelo3D.ts`, que es quien rechaza.
    ayuda:
      'Archivo .glb de hasta 5 MB. En Blender, «glTF Binary (.glb)»: las otras dos opciones dejan un .bin y las texturas en archivos aparte, y aquí se guarda uno solo. Se comprueba el contenido, no la extensión.',
    // El mismo número que `LIMITE_BYTES_MODELO_3D` en
    // `src/uploads/validarModelo3D.ts`, que es quien lo hace cumplir por
    // firma. No se importa de allá para no arrastrar un módulo de servidor al
    // paquete del navegador —este esquema lo importa el formulario—; los ata
    // `tests/unit/esquema.test.ts`, que falla si se separan.
    maximoBytes: 5 * 1024 * 1024,
  },
  secciones: [
    {
      titulo: 'El modelo',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre del modelo', requerido: true },
        {
          tipo: 'seleccion',
          nombre: 'origen',
          etiqueta: 'Origen',
          requerido: true,
          medio: true,
          opciones: [
            { valor: 'tc', etiqueta: 'Tomografía computarizada' },
            { valor: 'rm', etiqueta: 'Resonancia magnética' },
            { valor: 'sintetico', etiqueta: 'Modelo sintético o de referencia' },
          ],
        },
        {
          tipo: 'numero',
          nombre: 'triangulos',
          etiqueta: 'Triángulos de la malla',
          medio: true,
          ayuda: 'El objetivo para navegador va de 50.000 a 150.000.',
        },
        {
          tipo: 'casilla',
          nombre: 'anonimizado',
          etiqueta: 'Confirmo que el estudio de origen está anonimizado',
          ayuda:
            'Los metadatos DICOM guardan nombre, identificador y fecha de nacimiento aunque la imagen se vea anónima.',
        },
        { tipo: 'area', nombre: 'notas', etiqueta: 'Notas del procesamiento' },
      ],
    },
  ],
}

// ----------------------------------------------------------------- registro

// ------------------------------------------------- catálogos del simulador
//
// Cinco listas cortas que forman el vocabulario de un caso quirúrgico. Están
// en el panel, y no escritas en el código, para que el traumatólogo pueda
// añadir un separador o una técnica sin esperar a un despliegue.

export const HuesosAO: EsquemaDeColeccion = {
  slug: 'huesos-ao',
  singular: 'Hueso',
  plural: 'Huesos y segmentos',
  genero: 'm',
  titulo: 'nombre',
  descripcion: 'Hueso y tercio, con el número que le da la AO.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['nombre', 'codigo'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Hueso' },
    { nombre: 'codigo', etiqueta: 'Número AO' },
    { nombre: 'orden', etiqueta: 'Orden', formato: 'numero' },
  ],
  secciones: [
    {
      titulo: 'El hueso',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
        {
          tipo: 'texto',
          nombre: 'codigo',
          etiqueta: 'Número AO',
          medio: true,
          ayuda: 'El primero del código: «42» es la diáfisis de la tibia.',
        },
        { tipo: 'numero', nombre: 'orden', etiqueta: 'Orden de aparición', medio: true },
      ],
    },
  ],
}

export const ClasificacionesAO: EsquemaDeColeccion = {
  slug: 'clasificaciones-ao',
  singular: 'Clasificación AO',
  plural: 'Clasificaciones AO',
  genero: 'f',
  titulo: 'nombre',
  descripcion: 'Tipo y grupo del trazo de fractura, sin el hueso.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['codigo', 'nombre'],
  columnas: [
    { nombre: 'codigo', etiqueta: 'Código' },
    { nombre: 'nombre', etiqueta: 'Trazo' },
    { nombre: 'tipo', etiqueta: 'Tipo' },
    { nombre: 'orden', etiqueta: 'Orden', formato: 'numero' },
  ],
  secciones: [
    {
      titulo: 'La clasificación',
      descripcion:
        'Va sin el número del hueso: el mismo trazo A2 existe en la tibia y en el fémur, y la consola compone el código completo al mostrarlo.',
      campos: [
        {
          tipo: 'texto',
          nombre: 'codigo',
          etiqueta: 'Código',
          requerido: true,
          medio: true,
          ayuda: '«A2», «B1», «C3».',
        },
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre del trazo', requerido: true, medio: true },
        {
          tipo: 'seleccion',
          nombre: 'tipo',
          etiqueta: 'Tipo',
          medio: true,
          opciones: [
            { valor: 'A', etiqueta: 'A · Simple' },
            { valor: 'B', etiqueta: 'B · En cuña' },
            { valor: 'C', etiqueta: 'C · Compleja' },
          ],
        },
        { tipo: 'numero', nombre: 'orden', etiqueta: 'Orden de aparición', medio: true },
        { tipo: 'area', nombre: 'descripcion', etiqueta: 'Qué la caracteriza' },
      ],
    },
  ],
}

export const TecnicasQuirurgicas: EsquemaDeColeccion = {
  slug: 'tecnicas-quirurgicas',
  singular: 'Técnica',
  plural: 'Técnicas quirúrgicas',
  genero: 'f',
  titulo: 'nombre',
  descripcion: 'Clavo endomedular, placa, tornillos, fijador externo.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['nombre'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Técnica' },
    { nombre: 'orden', etiqueta: 'Orden', formato: 'numero' },
  ],
  secciones: [
    {
      titulo: 'La técnica',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre de la técnica', requerido: true },
        { tipo: 'numero', nombre: 'orden', etiqueta: 'Orden de aparición', medio: true },
        { tipo: 'area', nombre: 'descripcion', etiqueta: 'Cuándo se elige' },
      ],
    },
  ],
}

export const FasesQuirurgicas: EsquemaDeColeccion = {
  slug: 'fases-quirurgicas',
  singular: 'Fase',
  plural: 'Fases quirúrgicas',
  genero: 'f',
  titulo: 'nombre',
  descripcion: 'Abordaje, reducción, fijación, cierre. Agrupan los pasos del guion.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['nombre'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Fase' },
    { nombre: 'orden', etiqueta: 'Orden', formato: 'numero' },
  ],
  secciones: [
    {
      titulo: 'La fase',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre de la fase', requerido: true },
        { tipo: 'numero', nombre: 'orden', etiqueta: 'Orden en el acto quirúrgico', medio: true },
      ],
    },
  ],
}

export const Instrumental: EsquemaDeColeccion = {
  slug: 'instrumental',
  singular: 'Instrumento',
  plural: 'Instrumental',
  genero: 'm',
  titulo: 'nombre',
  descripcion: 'La bandeja de la consola. Cada paso declara cuál es el correcto.',
  versionada: false,
  familia: 'apoyo',
  buscarEn: ['nombre'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Instrumento' },
    { nombre: 'icono', etiqueta: 'Icono' },
    { nombre: 'orden', etiqueta: 'Orden', formato: 'numero' },
  ],
  secciones: [
    {
      titulo: 'El instrumento',
      descripcion:
        'La bandeja de un caso la forman los instrumentos que sus pasos declaran, no este catálogo entero: una bandeja con los cuarenta del hospital no enseña a elegir.',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre del instrumento', requerido: true },
        {
          tipo: 'seleccion',
          nombre: 'icono',
          etiqueta: 'Icono',
          medio: true,
          opciones: [
            { valor: 'generico', etiqueta: 'Genérico' },
            { valor: 'bisturi', etiqueta: 'Bisturí' },
            { valor: 'separador', etiqueta: 'Separador' },
            { valor: 'pinza', etiqueta: 'Pinza' },
            { valor: 'tijera', etiqueta: 'Tijera' },
            { valor: 'punzon', etiqueta: 'Punzón' },
            { valor: 'guia', etiqueta: 'Guía' },
            { valor: 'fresa', etiqueta: 'Fresa' },
            { valor: 'martillo', etiqueta: 'Martillo' },
            { valor: 'atornillador', etiqueta: 'Atornillador' },
            { valor: 'aguja', etiqueta: 'Aguja' },
          ],
        },
        { tipo: 'numero', nombre: 'orden', etiqueta: 'Orden en la bandeja', medio: true },
        { tipo: 'area', nombre: 'descripcion', etiqueta: 'Para qué sirve' },
        {
          tipo: 'relacion',
          nombre: 'modelo',
          etiqueta: 'Modelo 3D del instrumento',
          coleccion: 'modelos-3d',
          ayuda: 'Opcional. Se enseña al residente cuando coge este instrumento, uno cada vez.',
        },
        {
          // Existe en la colección desde siempre y era el único campo del
          // repositorio que el esquema del panel no describía. Como la
          // interfaz de Payload se retiró (D-038), no quedaba ninguna pantalla
          // desde la que llenarlo, y duplicar un instrumento lo perdía:
          // `duplicarDocumento` reconstruye la copia con `depurarDocumento` y
          // ahí solo sobrevive lo descrito aquí.
          tipo: 'relacion',
          nombre: 'tecnicas',
          etiqueta: 'Técnicas en las que se usa',
          coleccion: 'tecnicas-quirurgicas',
          multiple: true,
          ayuda:
            'Solo ordena el catálogo. La bandeja de un caso la forman los instrumentos que sus pasos declaran, no esta lista.',
        },
      ],
    },
  ],
}

export const ESQUEMAS: EsquemaDeColeccion[] = [
  Patologias,
  Maniobras,
  CasosAO,
  Cirugias,
  EstudiosIA,
  Segmentos,
  HuesosAO,
  ClasificacionesAO,
  TecnicasQuirurgicas,
  FasesQuirurgicas,
  Instrumental,
  Medios,
  Modelos3D,
]

/**
 * Lista blanca de colecciones editables desde el panel de contenido.
 *
 * Las acciones de servidor la consultan antes de tocar nada: sin ella, un
 * argumento `coleccion` manipulado dejaría editar `usuarios` —contraseñas
 * incluidas— por la puerta del editor de fichas.
 */
export const SLUGS_EDITABLES = ESQUEMAS.map((e) => e.slug)

export const esColeccionEditable = (slug: unknown): slug is string =>
  typeof slug === 'string' && SLUGS_EDITABLES.includes(slug)

export function esquemaDe(slug: string): EsquemaDeColeccion {
  const esquema = ESQUEMAS.find((e) => e.slug === slug)
  if (!esquema) throw new Error(`No hay esquema para la colección «${slug}».`)
  return esquema
}

/**
 * La insignia de estado, concordada con el singular de la colección.
 *
 * La componen dos pantallas —la del editor y la del listado— y estaba escrita
 * a mano en las dos, en femenino fijo: «✓ Publicada» encima de «Modelo 3D».
 * Vive aquí para que arreglar una no deje a la otra diciéndolo distinto, que es
 * el modo en que este tipo de frase se vuelve a torcer.
 *
 * «Borrador» no concuerda con nada: es el nombre del estado, no un adjetivo.
 *
 * Aquí vivió un rato un `avisoDeRetirada` que conjugaba «retírela/retírelo de
 * publicación» para el `confirm` de eliminar. Se quitó, y no conviene reponerlo:
 * esa frase ya se había desechado a propósito en `FormularioDocumento.tsx` —ver
 * `salidaSuave`— por un motivo que el género no arregla. La salida que ofrecía
 * no siempre existe: el botón «Retirar de publicación» solo aparece con
 * `versionada && publicado`, así que en medios, en modelos 3D, en los catálogos
 * y en cualquier borrador mandaba a buscar en la pantalla un botón que no está,
 * y quien no lo encuentra vuelve al «Eliminar», que sí está. El aviso pasó a
 * nombrar el botón, que concuerda igual y además dice cuál pulsar. Traerlo aquí
 * sin esa condición reponía el defecto, con una prueba encima defendiéndolo.
 */
export const estadoEnPalabras = (esquema: EsquemaDeColeccion, publicado: boolean): string =>
  publicado ? (esquema.genero === 'm' ? '✓ Publicado' : '✓ Publicada') : '● Borrador'

/** Todos los campos de un esquema en una sola lista, sin las secciones. */
export const camposDe = (esquema: EsquemaDeColeccion): Campo[] =>
  esquema.secciones.flatMap((s) => s.campos)

/** Recorre el árbol de campos, incluidos los anidados en listas y grupos. */
export function* recorrerCampos(campos: Campo[]): Generator<Campo> {
  for (const campo of campos) {
    yield campo
    if (campo.tipo === 'lista' || campo.tipo === 'grupo') {
      yield* recorrerCampos(campo.campos)
    }
  }
}

/**
 * Colecciones a las que apunta algún campo de un esquema, con sus bloques.
 *
 * El formulario del panel precarga estas listas para poder pintar cada
 * desplegable de relación. Antes las tenía escritas a mano, y la lista se
 * quedó atrás en cuanto llegaron los catálogos del simulador: los desplegables
 * de hueso, clasificación, técnica, fase e instrumental abrían **vacíos**, sin
 * un solo error, en un formulario donde tres de esos campos son obligatorios.
 * El caso no se podía guardar y la pantalla no decía por qué.
 *
 * Derivarla del esquema en vez de escribirla cierra esa puerta: un campo de
 * relación nuevo trae consigo su precarga, y no hay una segunda lista que
 * alguien tenga que acordarse de actualizar.
 */
export function coleccionesRelacionadasDe(esquema: EsquemaDeColeccion): string[] {
  const campos = [
    ...recorrerCampos(camposDe(esquema)),
    // Un campo de bloques puede insertar cualquier bloque, y los bloques
    // también tienen relaciones: la imagen de una ficha sale de «medios».
    ...(camposDe(esquema).some((c) => c.tipo === 'bloques')
      ? BLOQUES.flatMap((b) => [...recorrerCampos(b.campos)])
      : []),
  ]

  const slugs = new Set<string>()
  for (const campo of campos) {
    if (campo.tipo === 'relacion' || campo.tipo === 'archivo') slugs.add(campo.coleccion)
  }
  return [...slugs].sort()
}
