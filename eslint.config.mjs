import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

/**
 * Configuración de ESLint.
 *
 * Se añadió tarde y por un motivo concreto: `package.json` traía un guion
 * `lint` que ejecutaba `next lint`, orden que Next 16 retiró, de modo que
 * fallaba con «no such directory: lint». Y como `next build` tampoco pasa ya el
 * linter, la plataforma llevaba tiempo sin revisar una sola regla. Los
 * `eslint-disable` repartidos por el código no desactivaban nada porque no
 * había nadie a quien desactivar.
 *
 * Se usa el conjunto `core-web-vitals`, que es el recomendado, y las reglas se
 * dejan tal cual vienen: bajar el listón para que salga verde el primer día
 * convierte al linter en un adorno.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  {
    // `react-hooks/purity` prohíbe leer el reloj mientras se pinta, y tiene
    // razón en el navegador: dos pintados del mismo estado darían resultados
    // distintos. Pero en esta plataforma todas las `page.tsx` y `layout.tsx`
    // son componentes de servidor —los de cliente viven en archivos aparte, con
    // su 'use client'— y ahí se pintan una vez por petición: mirar la hora es
    // exactamente lo que se quiere hacer para decir «el último respaldo tiene
    // tres días». La regla no distingue unos de otros.
    //
    // Si alguna vez una `page.tsx` lleva 'use client', hay que sacarla de aquí.
    files: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
    rules: { 'react-hooks/purity': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Material ajeno descargado como referencia del atlas, y salida de las
    // pruebas de cobertura. Ni uno ni otra se editan aquí.
    '.vendor/**',
    'coverage/**',
    // Generado por Payload a partir de las colecciones: se reescribe entero con
    // `npm run generate:types` y corregirlo a mano no tiene sentido.
    'src/payload-types.ts',
    // Migraciones: son SQL dentro de plantillas, escritas una vez y nunca
    // retocadas. Reformatearlas rompería la correspondencia con lo aplicado.
    'src/migrations/**',
  ]),
])

export default eslintConfig
