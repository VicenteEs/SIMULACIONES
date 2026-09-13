import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // La medida es solo de `.ts`, y no por descuido: el entorno de estas
      // pruebas es `node` y el proyecto no tiene jsdom ni biblioteca de
      // componentes, así que los 69 componentes de `src/` no se pueden
      // ejercitar hoy. Medirlos los pondría a cero y arrastraría el umbral a un
      // número que no significaría nada. Ponerlos dentro es una decisión que
      // empieza por añadir el entorno, no por tocar estas líneas.
      //
      // Ojo con dónde se hace esa exclusión: quien la hace es el `exclude` de
      // abajo, NO este `include`. Ver el comentario de `src/**/*.tsx`.
      include: ['src/**/*.ts'],
      exclude: [
        // Se genera con `payload generate:types`.
        'src/payload-types.ts',
        // Se generan con `payload migrate:create`. Quien las vigila es
        // `tests/unit/migraciones.test.ts`, comparándolas con el esquema; su
        // contenido no se prueba línea a línea.
        'src/migrations/**',
        // Esta línea, y no el `include`, es la que deja fuera los componentes.
        // El filtro de cobertura (`BaseCoverageProvider.isIncluded`) casa con
        // picomatch y `contains: true`, es decir sin anclar el final, así que
        // `src/**/*.ts` casa TAMBIÉN con un `.tsx`. Sin esta entrada la
        // exclusión salía justo del revés de lo que se pretendía: el `.tsx` con
        // prueba entraba en la cifra —`Rico.tsx` figuraba al 50 %— y el `.tsx`
        // sin ninguna prueba quedaba invisible, porque el barrido de no
        // probados (`getUntestedFilesByRoot`) usa tinyglobby, que sí ancla el
        // patrón. Con eso el umbral escondía exactamente el hueco que tenía que
        // enseñar. El día que se midan los componentes hay que hacer las dos
        // cosas: quitar esta línea Y ampliar el `include` a `{ts,tsx}`. Sin lo
        // primero no entra ninguno; sin lo segundo entrarían solo los que ya
        // tienen prueba, que es de nuevo la cifra mentirosa.
        'src/**/*.tsx',
      ],
      // `src/app/**` estaba excluido entero, y con él las siete acciones de
      // servidor, que son TODA la superficie de escritura del panel: lo que no
      // se mide no se echa de menos, y así se pudo quedar sin una sola prueba
      // el único sitio donde se comprueban los permisos por módulo. Los
      // `page.tsx` y `layout.tsx` de ahí dentro siguen fuera, pero por el
      // `exclude` de `src/**/*.tsx`, que es lo que de verdad se quería excluir.
      //
      // El umbral es la cifra real de hoy, no una aspiración. Estaba en 80 con
      // la suite en 70: `npm run test:coverage` fallaba siempre, así que no
      // estaba en «Antes de subir» ni en ninguna integración continua, y una
      // puerta por la que nadie pasa no guarda nada.
      //
      // 58 y no 70 porque al dejar de esconder `src/app/**` la medida honesta
      // bajó a ~60 (líneas 60.5 %, ramas 60.0 %, funciones 62.0 %). Se deja
      // dos puntos por debajo a propósito: es el suelo medido sin base de
      // datos levantada, que es cuando la suite de integración se omite y la
      // cifra es la más baja posible. Este número solo sube: cada hueco que se
      // cierra —`acciones/atlas.ts`, `acciones/comentarios.ts`,
      // `atlas/cargador.ts` y `atlas/picking.ts` siguen a cero— se sube detrás.
      thresholds: { branches: 58, functions: 58, lines: 58, statements: 58 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      '@payload-config': path.resolve(process.cwd(), 'src/payload.config.ts'),
    },
  },
})
