import { BarrasVerticales, Dona, NoSePudoLeer } from '@/components/admin/Graficos'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { cifra } from '@/lib/graficos'
import type { TableroDeCuentas } from './tablero'

/**
 * La columna de al lado de la tabla de cuentas: el reparto por rol, las altas
 * de cada mes y qué permite cada rol (P-007 E5, D-238).
 *
 * Es de servidor y llega a `TablaUsuarios` ya pintada, como una propiedad. La
 * tabla es de cliente —filtros, modales, valores optimistas— y si las cifras
 * se calcularan allí saldrían de sus filas, que tienen tope; además, las
 * fechas de alta caerían en el mes de la zona del navegador y no en el del
 * servidor, que es el que usan todas las demás series del panel (`series.ts`).
 */
export function LateralDeCuentas({ datos }: { datos: TableroDeCuentas | null }) {
  return (
    <>
      <TarjetaDeGrafico
        titulo="Por rol"
        bajada={
          datos
            ? `${cifra(datos.activas)} ${datos.activas === 1 ? 'cuenta activa' : 'cuentas activas'}${
                datos.sinAcceso > 0 ? ` · ${cifra(datos.sinAcceso)} sin acceso` : ''
              }`
            : 'Las cuentas activas'
        }
        ilegible={datos === null}
      >
        {datos === null ? (
          <NoSePudoLeer que="la tabla de cuentas" />
        ) : (
          // Los colores y las etiquetas del Resumen, que dibuja la misma dona:
          // el mismo rol en dos colores según la pestaña obliga a releer la
          // leyenda cada vez.
          <Dona
            titulo="Cuentas activas por rol"
            rotuloDelTotal="activas"
            partes={[
              { etiqueta: 'Lectores', valor: datos.porRol.lector, color: 'var(--marca)' },
              { etiqueta: 'Editores', valor: datos.porRol.editor, color: 'var(--mod-2)' },
              { etiqueta: 'Administradores', valor: datos.porRol.admin, color: 'var(--mod-3)' },
            ]}
          />
        )}
      </TarjetaDeGrafico>

      <TarjetaDeGrafico
        titulo="Altas por mes"
        // Penpot dice «cuentas aprobadas», y la aprobación no deja fecha: lo
        // que se guarda es cuándo se creó la fila. Se dice lo que se cuenta.
        bajada="Cuentas creadas cada mes; una solicitud aprobada cuenta en el mes en que se pidió"
        ilegible={datos === null}
      >
        {datos === null ? (
          <NoSePudoLeer que="la tabla de cuentas" />
        ) : (
          <BarrasVerticales
            titulo="Cuentas creadas en cada uno de los últimos seis meses"
            altura={120}
            datos={datos.meses.map((mes, i) => ({ etiqueta: mes.etiqueta, detalle: mes.detalle, valor: datos.altas[i] }))}
          />
        )}
      </TarjetaDeGrafico>

      <TarjetaDeGrafico titulo="Qué puede cada rol">
        {/* Lo que de verdad comprueban las guardias, no lo que suena bien:
            leer y comentar van por `modulosVisibles`, escribir y validar por
            `puedeEditar` con `modulosEditables`, y las pestañas de
            administración, por `exigirPanel('admin')`. Si una de esas reglas
            cambia, este texto se queda mintiendo hasta que alguien lo corrija
            aquí. */}
        <dl className="usuarios-roles">
          <dt>Lector</dt>
          <dd>Lee los módulos que tenga abiertos y comenta en sus fichas.</dd>
          <dt>Editor</dt>
          <dd>Además escribe y valida fichas en los módulos que tenga asignados.</dd>
          <dt>Administrador</dt>
          <dd>Todo, más las cuentas, la difusión, los respaldos y el sistema.</dd>
        </dl>
      </TarjetaDeGrafico>
    </>
  )
}
