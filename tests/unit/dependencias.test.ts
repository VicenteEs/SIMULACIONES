import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { builtinModules } from 'node:module'

/**
 * Vigilancia de las dependencias declaradas en `package.json`.
 *
 * Un paquete que se importa y nadie declara **funciona igual** en el portátil de
 * quien lo escribió: npm aplana `node_modules`, así que la dependencia de una
 * dependencia queda a la vista y el import la encuentra. Eso es lo que hacía a
 * esta avería invisible durante meses, y cuando se buscó había tres:
 * `src/components/Visor3D.tsx` importa `three-stdlib`, que la traía
 * `@react-three/drei`; `src/payload.config.ts` importa
 * `@payloadcms/translations`, que la traía `payload`; y
 * `scripts/migrar-a-texto-rico.ts` pide `pg`, que lo traía
 * `@payloadcms/db-postgres`. El día que cualquiera de las tres cambie de
 * versión —o que el instalador deje de aplanar— la construcción se cae con un
 * «Cannot find module» que no nombra por ninguna parte a quien de verdad la
 * traía, y nadie sabría de dónde salió.
 *
 * Se miran también los `import type`, aunque TypeScript los borre al compilar y
 * no pesen un byte en el paquete: uno de los que faltaban era justo de esos, y
 * quien se cae entonces no es `npm run build` sino `npm run typecheck`.
 *
 * Se recorren `src/` —lo que viaja al servidor y al navegador— y `scripts/`.
 * Lo de `scripts/` lo lanza un desarrollador con `npx tsx` y no viaja al
 * servidor, pero cuenta igual por dos razones: sus imports se resuelven contra
 * el mismo `node_modules` aplanado, y el `include` de `tsconfig.json` abarca
 * todos los `.ts` del repositorio sin excluir ese directorio, así que
 * `npm run typecheck` lo mira igual. `pg` estaba justo ahí, a un directorio del
 * barrido y sin declarar en ninguna parte. `tests/` sí queda fuera: solo pide
 * lo que ya está en `devDependencies`.
 *
 * Lo que esta prueba **no** puede ver son los tipos. `@types/pg` no aparece
 * escrito en ninguna línea —lo busca TypeScript por su cuenta al resolver `pg`,
 * que no trae los suyos— y venía aplanado desde el mismo
 * `@payloadcms/db-postgres`. Por eso va declarado al lado de `pg` en
 * `devDependencies`, y los dos se mueven juntos: aquí no hay barrera que lo
 * recuerde por nadie.
 */

const raiz = process.cwd()

const paquete = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const declaradas = new Set([
  ...Object.keys(paquete.dependencies ?? {}),
  ...Object.keys(paquete.devDependencies ?? {}),
])

const DEL_NODO = new Set(builtinModules)

/**
 * Los alias del proyecto, leídos de `tsconfig.json` y no escritos aquí a mano.
 * Son dos y ninguno es un paquete: `@/…` es `src/…` y `@payload-config` es el
 * nombre con el que Payload exige que se cite su configuración. Escribirlos a
 * mano dejaría esta prueba en rojo el día que se añada un tercero, señalando un
 * paquete inventado en vez del alias nuevo.
 */
const ALIAS = Object.keys(
  (
    JSON.parse(readFileSync(join(raiz, 'tsconfig.json'), 'utf8')) as {
      compilerOptions?: { paths?: Record<string, string[]> }
    }
  ).compilerOptions?.paths ?? {},
).map((patron) => patron.replace(/\*$/, ''))

const esAlias = (especificador: string) =>
  ALIAS.some((alias) =>
    alias.endsWith('/') ? especificador.startsWith(alias) : especificador === alias,
  )

/** Todos los `.ts` y `.tsx` del directorio, con su ruta relativa a la raíz. */
function fuentesDe(directorio: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(join(raiz, directorio), { withFileTypes: true })) {
    const camino = `${directorio}/${entrada.name}`
    if (entrada.isDirectory()) salida.push(...fuentesDe(camino))
    else if (/\.tsx?$/.test(entrada.name)) salida.push(camino)
  }
  return salida
}

/**
 * El nombre del paquete de un especificador: `next/navigation` es `next` y
 * `@payloadcms/db-postgres/migration` es `@payloadcms/db-postgres`. Lo que hay
 * detrás de esos primeros segmentos es un camino dentro del paquete y no se
 * declara nunca por separado.
 */
function nombreDelPaquete(especificador: string): string {
  const trozos = especificador.split('/')
  return especificador.startsWith('@') ? trozos.slice(0, 2).join('/') : trozos[0]
}

/**
 * Los comentarios se quitan antes de buscar. Este mismo repositorio tiene
 * comentarios que citan imports —`TallerDeAtlas.tsx` explica por qué pide el
 * cargador con `import()`— y sin esto la prueba los contaría como código.
 *
 * Solo la línea entera de `//`, no la de detrás del código: una dirección
 * `https://…` dentro de una cadena lleva dos barras y cortar ahí se llevaría
 * por delante el resto de una línea que sí es código.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/** Todo lo que este archivo pide a otro módulo, en cualquiera de las formas. */
function modulosQuePide(fuente: string): string[] {
  const limpia = sinComentarios(fuente)
  const patrones = [
    // `import … from '…'` y `export … from '…'`, en una línea o en varias.
    /\bfrom\s*['"]([^'"]+)['"]/g,
    // El dinámico, que es el que trae un trozo aparte.
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // De solo efecto: `import '…'`.
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  return patrones.flatMap((patron) => [...limpia.matchAll(patron)].map((casa) => casa[1]))
}

describe('lo que importan `src/` y `scripts/` está declarado en package.json', () => {
  const fuentes = [...fuentesDe('src'), ...fuentesDe('scripts')]

  it('hay fuentes que mirar', () => {
    // Si el recorrido se rompe, esta prueba entera pasaría a no comprobar nada
    // y seguiría en verde, que es la manera de perderla sin enterarse.
    expect(fuentes.length).toBeGreaterThan(50)
  })

  it('ningún módulo llega de arrastre por otra dependencia', () => {
    const fantasmas = new Map<string, string>()

    for (const archivo of fuentes) {
      for (const especificador of modulosQuePide(readFileSync(join(raiz, archivo), 'utf8'))) {
        // Relativos, los alias del proyecto y lo que trae Node: no se declaran.
        if (/^[./]/.test(especificador) || esAlias(especificador)) continue
        if (especificador.startsWith('node:')) continue
        const nombre = nombreDelPaquete(especificador)
        if (DEL_NODO.has(nombre) || declaradas.has(nombre)) continue
        if (!fantasmas.has(nombre)) fantasmas.set(nombre, archivo)
      }
    }

    const queja = [...fantasmas]
      .map(([nombre, archivo]) => `«${nombre}» (lo importa ${archivo})`)
      .join(', ')
    expect([...fantasmas.keys()], `sin declarar en package.json: ${queja}`).toEqual([])
  })
})
