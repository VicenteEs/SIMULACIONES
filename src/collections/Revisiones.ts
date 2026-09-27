import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'
import {
  ACCIONES_DE_REVISION,
  ESTADOS_DE_REVISION,
  MODULOS_EN_REVISION,
  ORIGENES_DE_CONTENIDO,
} from '@/lib/revision'

/**
 * La revisión de una ficha: de dónde salió, cómo era al llegar y quién la dio
 * por buena (D-142).
 *
 * El contenido va a llegar en bloque, redactado por un modelo de lenguaje a
 * partir de los libros de traumatología del dueño, y lo tienen que revisar
 * traumatólogos con cuenta de editor antes de que lo lea un residente. Lo que
 * el dueño pidió saber es si lo revisan de verdad —«no quiero que validen por
 * validar»—, y eso se mide aquí contra dos cosas que ninguna otra colección
 * guarda: el texto tal como llegó (`original`) y el momento, con sus números,
 * en que alguien pulsó «Listo para publicar».
 *
 * Una fila por ficha, y solo para las fichas que entran en revisión: las que
 * trae la ingesta, y las que un administrador manda a revisar desde el editor.
 * Lo escrito a mano antes de esto no tiene fila y se publica como siempre.
 *
 * Se lee y se escribe solo desde el servidor: las acciones del panel pasan por
 * `exigirEdicionDe` y escriben con la API local. Por REST solo entra el
 * administrador, como en `difusiones`: el editor no tiene por qué ver cuánto
 * tardó un colega en revisar, ni poder tocar su propio registro.
 */
export const Revisiones: CollectionConfig = {
  slug: 'revisiones',
  labels: { singular: 'Revisión', plural: 'Revisiones' },
  admin: {
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'coleccion', 'estado', 'porcentajeEditado'],
    group: 'Administración',
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  /**
   * Una revisión por ficha, y que lo garantice la base: dos filas para la misma
   * ficha partirían en dos su historial y su tiempo, y la tabla de auditoría la
   * contaría dos veces.
   */
  indexes: [{ fields: ['coleccion', 'documentoId'], unique: true }],
  fields: [
    {
      name: 'coleccion',
      type: 'select',
      required: true,
      index: true,
      label: 'Módulo',
      // De `src/lib/revision.ts` y no de `SLUGS_DE_MODULOS`: aquel vive en
      // `collections/index.ts`, que importa este archivo, y el ciclo dejaría la
      // lista sin definir al cargar. `tests/unit/revision.test.ts` comprueba
      // que las dos digan lo mismo.
      options: MODULOS_EN_REVISION.map((slug) => ({ label: slug, value: slug })),
    },
    { name: 'documentoId', type: 'text', required: true, index: true, label: 'Ficha' },
    {
      // Copia del título de la ficha, puesta al día en cada guardado: la
      // pantalla de auditoría lista cientos de fichas de cinco colecciones y no
      // puede ir a buscar cada título a su tabla.
      name: 'titulo',
      type: 'text',
      label: 'Título de la ficha',
    },
    {
      name: 'origen',
      type: 'select',
      required: true,
      defaultValue: 'ia',
      label: 'Origen del contenido',
      options: ORIGENES_DE_CONTENIDO.map((o) => ({ ...o })),
    },
    // De qué libro salió, para poder comprobarlo contra la página. Texto libre:
    // los libros no son un catálogo que alguien mantenga.
    { name: 'libro', type: 'text', label: 'Libro de origen' },
    { name: 'capitulo', type: 'text', label: 'Capítulo' },
    { name: 'paginas', type: 'text', label: 'Páginas' },
    // La tanda de ingesta y el modelo que redactó: si un lote sale mal, se
    // encuentra entero por aquí.
    { name: 'lote', type: 'text', index: true, label: 'Lote de ingesta' },
    { name: 'modelo', type: 'text', label: 'Modelo que lo redactó' },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'pendiente',
      index: true,
      label: 'Estado de la revisión',
      options: ESTADOS_DE_REVISION.map((e) => ({ ...e })),
    },
    {
      // A quién le toca. Vacío: a cualquiera con el módulo. Al borrar la cuenta
      // queda a nulo y la ficha vuelve a la cola de todos.
      name: 'asignadaA',
      type: 'relationship',
      relationTo: 'usuarios',
      label: 'Asignada a',
    },
    {
      /**
       * La ficha tal como llegó, depurada con el esquema del panel
       * (`depurarDocumento`): es la referencia contra la que se mide cuánto se
       * editó. No se vuelve a escribir nunca después de crearla; si alguien la
       * pisara, el porcentaje pasaría a medir contra otra cosa sin avisar.
       */
      name: 'original',
      type: 'json',
      label: 'Versión original',
    },
    {
      /**
       * Palabras por sección de la versión original, para no recalcularlas en
       * cada guardado.
       */
      name: 'palabrasOriginales',
      type: 'number',
      min: 0,
      defaultValue: 0,
      label: 'Palabras de la versión original',
    },
    // Lo que se mide en cada guardado (`medirEdicion`, `src/lib/revision.ts`).
    { name: 'palabrasActuales', type: 'number', min: 0, defaultValue: 0, label: 'Palabras ahora' },
    {
      name: 'palabrasQuitadas',
      type: 'number',
      min: 0,
      defaultValue: 0,
      label: 'Palabras quitadas o reemplazadas',
    },
    { name: 'palabrasNuevas', type: 'number', min: 0, defaultValue: 0, label: 'Palabras nuevas' },
    {
      name: 'porcentajeEditado',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 0,
      label: '% del texto editado',
    },
    {
      // `[{ seccion, original, actual, porcentaje }]`, en el orden de las
      // pestañas del editor.
      name: 'porSeccion',
      type: 'json',
      label: 'Edición por sección',
    },
    { name: 'ultimaEdicion', type: 'date', label: 'Última edición' },
    { name: 'ultimoEditor', type: 'relationship', relationTo: 'usuarios', label: 'Editada por última vez por' },
    // La validación: quién pulsó «Listo para publicar», cuándo y con qué
    // números en ese instante. Se conservan tal cual aunque después se siga
    // editando: son la foto del momento en que alguien firmó.
    { name: 'listaPor', type: 'relationship', relationTo: 'usuarios', label: 'Validada por' },
    { name: 'listaEn', type: 'date', index: true, label: 'Validada el' },
    { name: 'segundosActivosAlValidar', type: 'number', min: 0, label: 'Segundos de revisión activa del validador' },
    { name: 'segundosAbiertosAlValidar', type: 'number', min: 0, label: 'Segundos con la ficha abierta del validador' },
    { name: 'porcentajeAlValidar', type: 'number', min: 0, max: 100, label: '% editado al validar' },
    { name: 'ritmoAlValidar', type: 'number', min: 0, label: 'Palabras por minuto de revisión al validar' },
    { name: 'seccionesVistasAlValidar', type: 'number', min: 0, label: 'Secciones revisadas al validar' },
    { name: 'seccionesConContenido', type: 'number', min: 0, label: 'Secciones con contenido' },
    {
      // Validó más deprisa de lo que se puede leer, o sin abrir alguna sección
      // con contenido (`evaluarValidacion`). No impide nada: lo señala.
      name: 'validacionRapida',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: 'Validación sospechosamente rápida',
    },
    { name: 'motivosDeAlerta', type: 'textarea', label: 'Por qué se señaló' },
    { name: 'notaDeRevision', type: 'textarea', label: 'Nota del revisor al validar' },
    { name: 'motivoDeDevolucion', type: 'textarea', label: 'Por qué se devolvió' },
    { name: 'devoluciones', type: 'number', min: 0, defaultValue: 0, label: 'Veces devuelta' },
    { name: 'publicadaEn', type: 'date', label: 'Publicada el' },
    { name: 'publicadaPor', type: 'relationship', relationTo: 'usuarios', label: 'Publicada por' },
    {
      // Un administrador puede publicar sin que nadie la haya validado; se
      // deja, porque es su plataforma, pero queda a la vista.
      name: 'publicadaSinValidar',
      type: 'checkbox',
      defaultValue: false,
      label: 'Publicada sin validar',
    },
    {
      /**
       * Lo que le pasó a la ficha, en orden: llegó, se asignó, se validó, se
       * devolvió, se publicó. Cada fila con los números del momento. No se
       * edita: se añade.
       */
      name: 'historial',
      type: 'array',
      label: 'Historial',
      // Una ficha que va y vuelve cien veces entre revisor y administrador ya
      // no necesita más historial: necesita una conversación.
      maxRows: 200,
      fields: [
        {
          name: 'accion',
          type: 'select',
          required: true,
          options: ACCIONES_DE_REVISION.map((a) => ({ ...a })),
        },
        { name: 'usuario', type: 'relationship', relationTo: 'usuarios' },
        { name: 'fecha', type: 'date', required: true },
        { name: 'detalle', type: 'textarea' },
        { name: 'porcentaje', type: 'number' },
        { name: 'segundosActivos', type: 'number' },
      ],
    },
  ],
}
