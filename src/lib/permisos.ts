/**
 * Qué puede hacer cada rol, dicho en una tabla (D-145).
 *
 * La política vive en `src/access/reglas.ts` y en las guardias de las acciones
 * del panel (`src/lib/guardias.ts`); esto no la repite, la **pregunta**: cada
 * fila llama a las mismas funciones con una cuenta de ejemplo de cada rol, sin
 * restricción de módulos. Si mañana cambia una regla, la tabla del panel cambia
 * sola. Las filas que no son una función de `reglas.ts` sino una guardia de
 * acción (publicar, validar, el panel de administración) están escritas aquí,
 * con la acción que las hace cumplir, y `tests/unit/permisos.test.ts` las ata a
 * lo que dicen las reglas en lo que sí se puede comparar.
 */
import {
  puedeAdministrarUsuarios,
  puedeEditarContenido,
  puedeLeerContenido,
  puedeVerModulo,
  type Rol,
  type UsuarioSesion,
} from '@/access/reglas'

export const ROLES: readonly { value: Rol; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'editor', label: 'Editor de contenido' },
  { value: 'lector', label: 'Lector' },
]

export const etiquetaDeRolEnRegistro = (rol: unknown): string =>
  ROLES.find((r) => r.value === rol)?.label ?? (typeof rol === 'string' && rol ? rol : '—')

const cuentaDeEjemplo = (rol: Rol): UsuarioSesion => ({ id: 'ejemplo', rol, activo: true })

export interface CapacidadDeRol {
  clave: string
  etiqueta: string
  /** De dónde sale, para quien quiera comprobarlo en el código. */
  fuente: string
  admin: boolean
  editor: boolean
  lector: boolean
}

const porRol = (f: (u: UsuarioSesion) => boolean) => ({
  admin: f(cuentaDeEjemplo('admin')),
  editor: f(cuentaDeEjemplo('editor')),
  lector: f(cuentaDeEjemplo('lector')),
})

/** Un rol que, por construcción, solo tiene el administrador. */
const soloAdmin = { admin: true, editor: false, lector: false }

export function capacidadesPorRol(): CapacidadDeRol[] {
  return [
    {
      clave: 'leer',
      etiqueta: 'Leer el contenido publicado',
      fuente: 'puedeLeerContenido',
      ...porRol(puedeLeerContenido),
    },
    {
      clave: 'modulos',
      etiqueta: 'Ver los cinco módulos (salvo los que se le restrinjan)',
      fuente: 'puedeVerModulo',
      ...porRol((u) => puedeVerModulo(u, 'patologias')),
    },
    {
      clave: 'editar',
      etiqueta: 'Redactar y editar fichas, y leer borradores',
      fuente: 'puedeEditarContenido',
      ...porRol(puedeEditarContenido),
    },
    {
      clave: 'publicar',
      etiqueta: 'Publicar o retirar una ficha que no está en revisión',
      fuente: 'guardarDocumento / cambiarPublicacion (exigirEdicionDe)',
      ...porRol(puedeEditarContenido),
    },
    {
      clave: 'validar',
      etiqueta: 'Dar una ficha en revisión por «Lista para publicar»',
      fuente: 'marcarListaParaPublicar (exigirEdicionDe)',
      ...porRol(puedeEditarContenido),
    },
    {
      clave: 'publicar-revision',
      etiqueta: 'Publicar una ficha en revisión, devolverla o asignarla',
      fuente: 'publicarValidadas, devolverAlRevisor, asignarRevisor (exigirAdmin)',
      ...soloAdmin,
    },
    {
      clave: 'panel',
      etiqueta: 'Entrar al panel de administración (contenido, taller, comentarios)',
      fuente: "exigirPanel('editor')",
      ...porRol(puedeEditarContenido),
    },
    {
      clave: 'cuentas',
      etiqueta: 'Crear, activar, desactivar cuentas y cambiar roles y módulos',
      fuente: 'puedeAdministrarUsuarios',
      ...porRol(puedeAdministrarUsuarios),
    },
    {
      clave: 'mantencion',
      etiqueta: 'Poner un módulo en mantención: los residentes no lo ven, los editores sí',
      fuente: 'cambiarMantencionDeModulo (exigirAdmin)',
      ...soloAdmin,
    },
    {
      clave: 'seguimiento',
      etiqueta: 'Ver estadísticas, actividad, auditoría y este registro',
      fuente: "exigirPanel('admin')",
      ...soloAdmin,
    },
    {
      clave: 'sistema',
      etiqueta: 'Difusiones, respaldos y sistema',
      fuente: "exigirPanel('admin')",
      ...soloAdmin,
    },
  ]
}
