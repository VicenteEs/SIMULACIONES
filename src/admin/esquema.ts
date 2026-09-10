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
  | (CampoBase & { tipo: 'seleccion'; opciones: Opcion[] })
  | (CampoBase & { tipo: 'casilla' })
  | (CampoBase & { tipo: 'relacion'; coleccion: string })
  | (CampoBase & { tipo: 'archivo'; coleccion: string; acepta?: string })
  | (CampoBase & { tipo: 'rico' })
  | (CampoBase & { tipo: 'lista'; campos: Campo[]; singular: string })
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
   */
  subida?: { acepta: string; ayuda: string }
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

export const Cirugias: EsquemaDeColeccion = {
  slug: 'cirugias',
  singular: 'Cirugía simulada',
  plural: 'Cirugías simuladas',
  titulo: 'nombre',
  descripcion: 'Guion quirúrgico con instrumental y rangos de fuerza.',
  versionada: true,
  familia: 'modulos',
  buscarEn: ['nombre', 'codigo'],
  columnas: [
    { nombre: 'nombre', etiqueta: 'Cirugía' },
    { nombre: 'codigo', etiqueta: 'Código' },
    { nombre: '_status', etiqueta: 'Estado', formato: 'estado' },
    { nombre: 'updatedAt', etiqueta: 'Editada', formato: 'fecha' },
  ],
  secciones: [
    {
      titulo: 'La cirugía',
      campos: [
        { tipo: 'texto', nombre: 'nombre', etiqueta: 'Nombre de la cirugía', requerido: true },
        { tipo: 'texto', nombre: 'codigo', etiqueta: 'Código AO/OTA', medio: true },
        { tipo: 'rico', nombre: 'resumen', etiqueta: 'Resumen del procedimiento' },
      ],
    },
    {
      titulo: 'Guion quirúrgico',
      descripcion:
        'Cada paso define el instrumento correcto y la ventana de fuerza en la que sale bien.',
      campos: [
        {
          tipo: 'lista',
          nombre: 'pasos',
          etiqueta: 'Pasos del guion',
          singular: 'Paso',
          campos: [
            { tipo: 'texto', nombre: 'titulo', etiqueta: 'Título del paso', requerido: true },
            { tipo: 'rico', nombre: 'descripcion', etiqueta: 'Qué se hace', requerido: true },
            {
              tipo: 'texto',
              nombre: 'instrumento',
              etiqueta: 'Instrumento correcto',
              requerido: true,
            },
            {
              tipo: 'numero',
              nombre: 'fuerzaMinima',
              etiqueta: 'Fuerza mínima útil (N)',
              requerido: true,
              medio: true,
            },
            {
              tipo: 'numero',
              nombre: 'fuerzaMaxima',
              etiqueta: 'Fuerza máxima útil (N)',
              requerido: true,
              medio: true,
            },
            { tipo: 'area', nombre: 'exito', etiqueta: 'Resultado correcto', requerido: true },
            {
              tipo: 'area',
              nombre: 'insuficiente',
              etiqueta: 'Si la fuerza es insuficiente',
              requerido: true,
            },
            {
              tipo: 'area',
              nombre: 'excesivo',
              etiqueta: 'Si la fuerza es excesiva',
              requerido: true,
            },
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
  titulo: 'nombre',
  descripcion: 'Ordenan la biblioteca y el mapa corporal del examen físico.',
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
      descripcion: 'Recuadro sensible del mapa del examen físico.',
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
    ayuda: 'Imagen (PNG, JPG, WEBP, SVG) o video (MP4, WEBM). Máximo 50 MB.',
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
    ayuda: 'Archivo .glb de hasta 5 MB. Se comprueba el contenido, no la extensión.',
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

export const ESQUEMAS: EsquemaDeColeccion[] = [
  Patologias,
  Maniobras,
  CasosAO,
  Cirugias,
  EstudiosIA,
  Segmentos,
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
