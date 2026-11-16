import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'

/**
 * Cada vez que una cuenta entra (D-374, D-388): cuándo, desde qué equipo, desde
 * qué IP y desde qué país, y cuándo y por qué se cerró esa sesión.
 *
 * Existe porque Payload guarda de cada sesión solo cuándo se abrió y cuándo
 * vence (`usuarios_sessions`), y porque al entrar se borran las demás: para
 * decirle al equipo que se quedó sin sesión qué pasó, y para ver que una cuenta
 * se turna entre dos equipos, hace falta acordarse de las sesiones que ya no
 * están. Por eso es una colección aparte y no tres columnas en la sesión.
 *
 * `sesion` no es el identificador de la sesión, sino su huella (SHA-256): ese
 * identificador es lo que Payload compara con el testigo, una llave más, y aquí
 * basta con poder reconocerlo (`huellaDeSesion`, `entradasServidor.ts`).
 *
 * La escribe solo el servidor, al entrar y al salir, con la API local. Nadie la
 * edita: lo que se lee aquí es lo que pasó. Se borra a los
 * `MESES_DE_LAS_ENTRADAS` y, con la cuenta, en el acto
 * (`conservacionServidor.ts`).
 */
export const Entradas: CollectionConfig = {
  slug: 'entradas',
  labels: { singular: 'Entrada', plural: 'Entradas' },
  admin: {
    useAsTitle: 'equipo',
    defaultColumns: ['fecha', 'usuario', 'equipo', 'pais', 'ip'],
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
    // Sin `required`: la base deja la columna a nulo si la cuenta se borra por
    // un camino que no pase por `anonimizarElRastroDeLaCuenta`, y con `NOT NULL`
    // ese borrado fallaría. La pasada diaria borra las que queden así.
    { name: 'usuario', type: 'relationship', relationTo: 'usuarios', index: true, label: 'Cuenta' },
    { name: 'sesion', type: 'text', index: true, label: 'Huella de la sesión' },
    { name: 'equipo', type: 'text', label: 'Equipo' },
    { name: 'ip', type: 'text', label: 'Dirección IP' },
    { name: 'pais', type: 'text', label: 'País' },
    {
      // Lo que cuentan las alertas (`motivosDeAlerta`): una entrada que echó a
      // otro equipo, no a una sesión vieja del mismo.
      name: 'cerroOtroEquipo',
      type: 'checkbox',
      defaultValue: false,
      label: 'Cerró la sesión de otro equipo',
    },
    { name: 'cerradaEn', type: 'date', label: 'Se cerró' },
    {
      name: 'motivoDelCierre',
      type: 'select',
      label: 'Por qué se cerró',
      options: [
        { label: 'Salió', value: 'salio' },
        { label: 'Se entró en otro equipo', value: 'otra-entrada' },
      ],
    },
  ],
}
