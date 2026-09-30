import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'
import { ACCIONES_DEL_REGISTRO } from '@/lib/registro'

/**
 * Qué hizo cada cuenta y cuándo (D-145).
 *
 * Una fila por acto, con una **foto** de quién era la cuenta en ese momento:
 * nombre, correo, rol y módulos. El rol de hoy no explica lo que alguien pudo
 * hacer hace un mes —lo cambió un administrador—, y al borrar la cuenta la fila
 * no puede quedarse sin saber de quién era, así que `usuario` queda a nulo (la
 * clave foránea es `ON DELETE SET NULL`) y la foto sigue diciéndolo.
 *
 * Se escribe solo desde el servidor (`registrarAccion`, `src/lib/registroServidor.ts`)
 * y nunca por REST: de la API de Payload solo queda servir archivos (D-073), y
 * el acceso de aquí es el mismo de las demás colecciones de administración por
 * si algún día se reabre. Una bitácora que se puede reescribir no sirve de
 * bitácora: por eso no hay ninguna pantalla, ni acción, que edite o borre filas.
 *
 * Lo que **no** se guarda, a propósito: contraseñas, testigos ni el contenido de
 * las fichas. Se anota que alguien modificó «Fractura de diáfisis tibial», no
 * qué escribió; eso lo dicen las versiones de la ficha. Para los cambios de
 * permisos sí se guarda el antes y el después de los cinco campos que son
 * permisos (`cambiosDePermisos`), porque ahí el cambio es el acto.
 */
export const RegistroDeAcciones: CollectionConfig = {
  slug: 'registro-de-acciones',
  labels: { singular: 'Acción registrada', plural: 'Registro de acciones' },
  admin: {
    useAsTitle: 'titulo',
    defaultColumns: ['fecha', 'usuarioNombre', 'rol', 'accion', 'coleccion'],
    group: 'Administración',
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  fields: [
    { name: 'fecha', type: 'date', required: true, index: true, label: 'Cuándo' },
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      index: true,
      label: 'Cuenta',
    },
    // La foto de la cuenta en el momento del acto.
    { name: 'usuarioNombre', type: 'text', label: 'Nombre (entonces)' },
    { name: 'usuarioCorreo', type: 'text', index: true, label: 'Correo (entonces)' },
    { name: 'rol', type: 'text', index: true, label: 'Rol (entonces)' },
    { name: 'permisos', type: 'json', label: 'Permisos (entonces)' },
    {
      // Texto validado en código y no un `select`: un `select` es un tipo
      // enumerado de PostgreSQL y cada acción nueva exigiría su migración, y el
      // olvido solo se vería en el servidor, al anotar. Mismo razonamiento que
      // `complicaciones` en `Actividad.ts`. La lista es `ACCIONES_DEL_REGISTRO`.
      name: 'accion',
      type: 'text',
      required: true,
      index: true,
      label: 'Acción',
      validate: (valor: unknown) =>
        ACCIONES_DEL_REGISTRO.some((a) => a.value === valor) ||
        `«${String(valor)}» no es una acción del registro (src/lib/registro.ts).`,
    },
    { name: 'coleccion', type: 'text', index: true, label: 'Módulo o colección' },
    { name: 'documentoId', type: 'text', label: 'Documento' },
    { name: 'titulo', type: 'text', label: 'Título del documento' },
    { name: 'detalle', type: 'textarea', label: 'Detalle' },
    {
      // `[{ campo, antes, despues }]` de `cambiosDePermisos`.
      name: 'cambios',
      type: 'json',
      label: 'Cambios de permisos',
    },
    // Cuando el acto lo hace el sistema y no una cuenta —un script de
    // importación, una tarea programada—, aquí va quién: «importador», por ejemplo.
    { name: 'origen', type: 'text', label: 'Origen (si no fue una cuenta)' },
  ],
}
