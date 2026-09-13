/**
 * Bloques de contenido (decisión D-011).
 *
 * El traumatólogo compone cada pestaña apilando y reordenando estos bloques sin
 * límite de cantidad. Lo que no puede es elegir colores ni tipografías: el
 * aspecto de cada bloque vive en el código, de modo que la plataforma se ve
 * igual en todas las fichas y él dedica su tiempo a escribir.
 */
import type { Block } from 'payload'
import {
  lexicalEditor,
  HeadingFeature,
  FixedToolbarFeature,
} from '@payloadcms/richtext-lexical'

/** Editor de texto acotado: estructura sí, decoración no. */
export const editorClinico = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures,
    FixedToolbarFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
  ],
})

export const BloqueTexto: Block = {
  slug: 'texto',
  labels: { singular: 'Texto', plural: 'Bloques de texto' },
  fields: [
    { name: 'titulo', type: 'text', label: 'Título de la sección (opcional)' },
    {
      name: 'cuerpo',
      type: 'richText',
      required: true,
      editor: editorClinico,
      label: 'Contenido',
    },
  ],
}

export const BloqueLista: Block = {
  slug: 'lista-clinica',
  labels: { singular: 'Lista clínica', plural: 'Listas clínicas' },
  fields: [
    { name: 'titulo', type: 'text', label: 'Encabezado de la lista' },
    {
      name: 'puntos',
      type: 'array',
      minRows: 1,
      label: 'Puntos',
      fields: [
        { name: 'destacado', type: 'text', label: 'Idea en negrita (opcional)' },
        { name: 'texto', type: 'textarea', required: true, label: 'Desarrollo' },
      ],
    },
  ],
}

export const BloqueClasificacion: Block = {
  slug: 'tabla-clasificacion',
  labels: { singular: 'Tabla de clasificación', plural: 'Tablas de clasificación' },
  fields: [
    { name: 'titulo', type: 'text', required: true, label: 'Nombre de la clasificación' },
    {
      name: 'filas',
      type: 'array',
      minRows: 1,
      label: 'Filas',
      fields: [
        { name: 'clave', type: 'text', required: true, label: 'Código o tipo' },
        { name: 'descripcion', type: 'textarea', required: true, label: 'Descripción' },
      ],
    },
  ],
}

export const BloqueAdvertencia: Block = {
  slug: 'advertencia',
  labels: { singular: 'Advertencia', plural: 'Advertencias' },
  fields: [
    {
      name: 'tono',
      type: 'select',
      required: true,
      defaultValue: 'atencion',
      label: 'Tipo',
      options: [
        { label: 'Atención', value: 'atencion' },
        { label: 'Error frecuente', value: 'error-frecuente' },
        { label: 'Perla clínica', value: 'perla' },
      ],
    },
    { name: 'texto', type: 'textarea', required: true, label: 'Texto' },
  ],
}

export const BloqueImagen: Block = {
  slug: 'imagen',
  labels: { singular: 'Imagen', plural: 'Imágenes' },
  fields: [
    { name: 'imagen', type: 'upload', relationTo: 'medios', required: true, label: 'Archivo' },
    { name: 'pie', type: 'text', label: 'Pie de imagen' },
    {
      name: 'ancho',
      type: 'select',
      defaultValue: 'completo',
      label: 'Ancho',
      options: [
        { label: 'Ancho completo', value: 'completo' },
        { label: 'Media columna', value: 'media' },
        { label: 'Pequeña, alineada a la derecha', value: 'pequena' },
      ],
    },
  ],
}

export const BloqueVideo: Block = {
  slug: 'video',
  labels: { singular: 'Video', plural: 'Videos' },
  fields: [
    { name: 'video', type: 'upload', relationTo: 'medios', required: true, label: 'Archivo de video' },
    { name: 'pie', type: 'text', label: 'Pie del video' },
  ],
}

export const BloqueModelo3D: Block = {
  slug: 'modelo-3d',
  labels: { singular: 'Modelo 3D', plural: 'Modelos 3D' },
  fields: [
    {
      name: 'modelo',
      type: 'relationship',
      relationTo: 'modelos-3d',
      required: true,
      label: 'Modelo',
    },
    { name: 'pie', type: 'text', label: 'Pie del visor' },
    {
      name: 'encuadre',
      type: 'group',
      label: 'Encuadre inicial',
      admin: {
        // Esta descripción solo la leería la interfaz de administración de
        // Payload, que se retiró (D-038). Se deja escueta y verdadera: quien
        // edita de verdad lo hace en el panel propio, con el visor.
        description:
          'Con qué ángulo y a qué distancia abre el modelo el residente. Vacío: la del catálogo.',
      },
      fields: [
        // **Sin `defaultValue`, igual que el encuadre del catálogo**
        // (`src/collections/Modelos3D.ts`), y esa igualdad es el campo entero.
        //
        // Aquí hubo `escala 1, giros 0, distancia 3`, y con eso la pose del
        // catálogo no llegaba nunca al residente. La cadena: `tieneEncuadre`
        // (`src/lib/aritmeticaDelEncuadre.ts`) decide por `distanciaCamara`,
        // que es la única de las cinco sin valor neutro; con un 3 por omisión,
        // todo bloque contestaba «sí, tengo encuadre» sin que nadie hubiera
        // capturado nada; y `encuadreVigente` respeta al bloque por encima del
        // modelo. Resultado: el traumatólogo capturaba la pose en la ficha del
        // modelo, guardaba, abría una ficha que ya existía y no había cambiado
        // nada, sin un solo error que lo explicara. La regla de precedencia
        // quedaba escrita, probada y muerta.
        //
        // Vacío significa «hereda la del modelo, y si el modelo tampoco dice
        // nada, encuádralo tú». Es lo mismo que ya significaba en la colección
        // y ahora significa en los dos sitios: un lector puede caer de uno al
        // otro sin traducir nada.
        //
        // Lo que esto NO arregla, y son dos cosas, no una.
        //
        // **Las filas ya guardadas.** Quitar un `defaultValue` no reescribe lo
        // escrito: las creadas mientras estuvo puesto siguen con su
        // `encuadre_distancia_camara = 3` y siguen ganándole al catálogo hasta
        // que una migración las vacíe. Las que nacen en el panel ya nacían
        // limpias —`depurarCampos` (`src/admin/depurar.ts`) escribe las cinco
        // claves a nulo y Payload solo aplica su `defaultValue` cuando el valor
        // llega `undefined`—; las que entran por la API local o por un guion
        // son las que lo cogían.
        //
        // **Y el valor por omisión de la columna, que es donde de verdad manda
        // en producción.** Payload traduce este `defaultValue` a un DEFAULT de
        // columna, y ese DEFAULT está en la base desde la migración inicial
        // (`src/migrations/20260906_150718_inicial.ts`: `encuadre_escala
        // numeric DEFAULT 1 … encuadre_distancia_camara numeric DEFAULT 3`).
        // Borrarlo de aquí no lo borra de allí: la última instantánea
        // (`…_pose_del_modelo_complicaciones_y_fuera_el_mapa.json`) sigue
        // registrando `default: 3` en las diez tablas `*_blocks_modelo_3d`
        // —las cinco colecciones con bloques y sus `_v` de versiones—, así que
        // el esquema declarado y la base ya no dicen lo mismo, y
        // `tests/unit/migraciones.test.ts` no lo ve: su cabecera avisa de que
        // compara nombres de columna y no «el tipo, el valor por defecto, los
        // índices». O sea que la divergencia viaja en verde. Y mientras siga
        // ahí, toda inserción que omita la columna vuelve a recibir 3 —drizzle
        // emite `DEFAULT` para un valor `undefined`—, de modo que un bloque
        // creado por la API local o por un guion nace otra vez «con encuadre»
        // y la pose del catálogo vuelve a no aplicarse. Esto de arriba salva el
        // camino del panel, que escribe `null` explícito; el otro camino no.
        //
        // Las dos se arreglan en la misma migración y en este orden: primero
        // `DROP DEFAULT` en las cinco columnas de las diez tablas, después el
        // `UPDATE` que vacía las filas que valen exactamente (1, 0, 0, 0, 3).
        // Se genera con `npx payload migrate:create` y no se escribe el SQL a
        // mano, para que la instantánea nueva quede al día y el esquema y la
        // base vuelvan a decir lo mismo.
        //
        // El `UPDATE` tiene además una condición que no es de base de datos:
        // el botón «Reiniciar» de `src/components/admin/formulario/EditorDeEncuadre.tsx`
        // escribe hoy ese mismo tuple de un clic, así que hasta que ese botón
        // vacíe en vez de escribir, vaciar por valor borraría poses que el
        // traumatólogo puso a propósito. Lo que sí está comprobado es el otro
        // flanco: «Ajustar al modelo» no puede producir un 3 exacto —da 3,01,
        // y lo fija `tests/unit/poseEnLasTresPantallas.test.ts`—.
        //
        // El suelo de la escala es 0,0001 y no el 0,01 que hubo aquí, por la
        // misma razón que en la colección: `encuadreQueLoAbarca`
        // (`src/lib/aritmeticaDelEncuadre.ts`) devuelve `1/radio`, y un fémur
        // de 250 mm de radio da 0,004. El recorrido entero está contado en
        // `src/collections/Modelos3D.ts` (el comentario del campo `escala`) y
        // no se repite.
        //
        // Lo que sí es propio de aquí: este `min` era el único tope que
        // actuaba. `src/admin/bloques.ts` declara la escala del bloque **sin**
        // `min` ni `max`, así que `depurarCampo` (`src/admin/depurar.ts`) la
        // deja pasar tal cual y quien rechazaba era Payload, con su mensaje en
        // inglés que `accion()` no desenvuelve. Es decir: el traumatólogo
        // insertaba un bloque «Modelo 3D» con un fémur en milímetros, pulsaba
        // «Ajustar al modelo» —el botón de `EditorDeEncuadre.tsx`, que existe
        // precisamente para hacer visible el modelo—, pulsaba Guardar y no
        // podía guardar lo que el botón acababa de capturar.
        //
        // Este suelo y el de `modelos-3d` se cambian a la vez: los ata
        // `tests/unit/encuadreDelModelo.test.ts`, porque son la misma captura
        // guardada en dos sitios y basta con que uno se mueva para que la pose
        // del bloque y la del catálogo dejen de admitir lo mismo.
        { name: 'escala', type: 'number', min: 0.0001, max: 100, label: 'Escala' },
        { name: 'giroX', type: 'number', label: 'Giro en X (grados)' },
        { name: 'giroY', type: 'number', label: 'Giro en Y (grados)' },
        { name: 'giroZ', type: 'number', label: 'Giro en Z (grados)' },
        {
          name: 'distanciaCamara',
          type: 'number',
          min: 0.1,
          label: 'Distancia de la cámara',
        },
      ],
    },
  ],
}

/** Los bloques disponibles en cualquier pestaña de contenido. */
/**
 * Una preparación anatómica del atlas dentro de una ficha.
 *
 * Es el hueco por el que el trabajo del taller llega al residente. A diferencia
 * del bloque de Modelo 3D, no apunta a un archivo subido sino a una selección
 * de piezas del atlas compartido: el navegador descarga el atlas una vez y esa
 * descarga sirve para todas las preparaciones de todas las fichas.
 */
const BloqueInstanciaAtlas: Block = {
  slug: 'instancia-atlas',
  labels: { singular: 'Preparación anatómica', plural: 'Preparaciones anatómicas' },
  fields: [
    {
      name: 'preparacion',
      type: 'relationship',
      relationTo: 'instancias-atlas',
      required: true,
      label: 'Preparación',
      admin: { description: 'Se arman en el taller anatómico del panel.' },
    },
    { name: 'pie', type: 'text', label: 'Pie del visor' },
  ],
}

export const BLOQUES: Block[] = [
  BloqueTexto,
  BloqueLista,
  BloqueClasificacion,
  BloqueAdvertencia,
  BloqueImagen,
  BloqueVideo,
  BloqueModelo3D,
  BloqueInstanciaAtlas,
]

/**
 * Campo reutilizable: una pestaña es una pila libre de bloques.
 * Las pestañas son fijas; su contenido, no.
 */
export const pilaDeBloques = (nombre: string, etiqueta: string) => ({
  name: nombre,
  type: 'blocks' as const,
  label: etiqueta,
  blocks: BLOQUES,
  admin: {
    initCollapsed: false,
    description: 'Agregue los bloques que necesite y arrástrelos para reordenarlos.',
  },
})
