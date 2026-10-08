/**
 * El instrumental del simulador: categorías, catálogo base y las funciones
 * puras que lo leen (P-001, E5, D-165).
 *
 * El catálogo vive en la colección `instrumental` (`src/collections/catalogos.ts`)
 * y lo edita el traumatólogo desde el panel. Esta lista es el **punto de
 * partida**: los instrumentos del documento de Cristóbal con sus medidas, cada
 * uno con un `slug` que es también el nombre de su modelo 3D
 * (`scripts/instrumental/<slug>.py` escribe `<slug>.glb`). Con ese nombre en
 * común, subir los cuarenta y siete archivos de una vez los enlaza solos, sin que
 * nadie tenga que elegir cuál va con cuál.
 *
 * Sin imports: lo leen la colección (servidor), el taller (navegador) y las
 * pruebas, y ninguno debe arrastrar a Payload ni a three por esto.
 */

export const CATEGORIAS_DE_INSTRUMENTAL = [
  { value: 'corte', label: 'Corte y disección' },
  { value: 'suturas', label: 'Suturas y cierre' },
  { value: 'exposicion', label: 'Separadores y exposición' },
  { value: 'periostio', label: 'Periostótomos y elevadores' },
  { value: 'reduccion', label: 'Pinzas de reducción' },
  { value: 'fijacion', label: 'Perforación y fijación' },
  { value: 'modelado', label: 'Modelado de placas' },
  { value: 'enclavado', label: 'Enclavado endomedular' },
] as const

export type CategoriaDeInstrumental = (typeof CATEGORIAS_DE_INSTRUMENTAL)[number]['value']

export const ETIQUETA_DE_CATEGORIA: Readonly<Record<string, string>> = Object.fromEntries(
  CATEGORIAS_DE_INSTRUMENTAL.map((c) => [c.value, c.label]),
)

export interface InstrumentoBase {
  slug: string
  nombre: string
  categoria: CategoriaDeInstrumental
  icono: string
  descripcion: string
  especificaciones: string
}

/** «Tijera de Mayo» → `tijera-de-mayo`: sin tildes, en minúsculas y con guiones. */
export function slugDeInstrumento(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** El `slug` que corresponde al nombre de un archivo subido: `tijera-mayo.glb` → `tijera-mayo`. */
export function slugDeArchivo(nombreDeArchivo: string): string {
  return slugDeInstrumento(nombreDeArchivo.replace(/\.[a-z0-9]+$/i, ''))
}

export const INSTRUMENTAL_BASE: readonly InstrumentoBase[] = [
  // ------------------------------------------------------------ corte
  { slug: 'bisturi-piel-n22', nombre: 'Bisturí de piel (mango 4, hoja 22)', categoria: 'corte', icono: 'bisturi', descripcion: 'Hace la incisión de la piel.', especificaciones: 'Mango n.º 4 · hoja n.º 22 (la 20 a la 22 son de piel) · largo total 171 mm.' },
  { slug: 'bisturi-profundo-n15', nombre: 'Bisturí profundo (mango 3, hoja 15)', categoria: 'corte', icono: 'bisturi', descripcion: 'Corta fascia, periostio y planos profundos.', especificaciones: 'Mango n.º 3 · hoja n.º 15 (de la 10 a la 15 son de plano profundo) · largo total 153 mm.' },
  { slug: 'electrobisturi', nombre: 'Electrobisturí de dos botones', categoria: 'corte', icono: 'generico', descripcion: 'Corta y coagula. Amarillo = corte (CUT), azul = coagulación (COAG).', especificaciones: 'Lápiz de 176 mm con electrodo de hoja de 20 mm, cable y conector de tres clavijas.' },
  { slug: 'tijera-mayo', nombre: 'Tijera de Mayo recta', categoria: 'corte', icono: 'tijera', descripcion: 'Corta hilos y tejido grueso.', especificaciones: 'Largo 170 mm · hojas de 62 mm.' },
  { slug: 'tijera-metzenbaum', nombre: 'Tijera de Metzenbaum', categoria: 'corte', icono: 'tijera', descripcion: 'Disecciona planos profundos con punta roma.', especificaciones: 'Largo 180 mm · hojas de 70 mm.' },
  { slug: 'pinza-diseccion-con-dientes', nombre: 'Pinza de disección con dientes (Adson 1×2)', categoria: 'corte', icono: 'pinza', descripcion: 'Toma piel y fascia sin resbalar.', especificaciones: 'Largo 120 mm · puntas con dientes 1×2.' },
  { slug: 'pinza-diseccion-sin-dientes', nombre: 'Pinza de disección sin dientes', categoria: 'corte', icono: 'pinza', descripcion: 'Toma tejidos delicados sin lesionarlos.', especificaciones: 'Largo 120 mm · puntas estriadas.' },
  { slug: 'portaagujas-mayo-hegar', nombre: 'Portaagujas de Mayo-Hegar', categoria: 'suturas', icono: 'pinza', descripcion: 'Sostiene la aguja al suturar.', especificaciones: 'Largo 150 mm · mandíbulas de carburo de tungsteno · trinquete.' },
  // ------------------------------------------------------------ suturas
  { slug: 'sutura-vicryl-3-0', nombre: 'Sutura Vicryl 3-0', categoria: 'suturas', icono: 'aguja', descripcion: 'Absorbible trenzada, violeta. Planos profundos.', especificaciones: 'Poliglactina 910 · 3-0 · aguja curva de 3/8.' },
  { slug: 'sutura-vicryl-2-0', nombre: 'Sutura Vicryl 2-0', categoria: 'suturas', icono: 'aguja', descripcion: 'Absorbible trenzada, violeta. Fascia y planos profundos.', especificaciones: 'Poliglactina 910 · 2-0 · aguja curva de 3/8.' },
  { slug: 'sutura-nylon-3-0', nombre: 'Sutura Nylon 3-0', categoria: 'suturas', icono: 'aguja', descripcion: 'No absorbible, negra. Cierre de piel.', especificaciones: 'Nailon monofilamento · 3-0 · aguja curva de 3/8.' },
  { slug: 'sutura-monocryl-5-0', nombre: 'Sutura Monocryl 5-0', categoria: 'suturas', icono: 'aguja', descripcion: 'Absorbible monofilamento, incolora. Sutura subcuticular.', especificaciones: 'Poliglecaprona 25 · 5-0 · aguja curva de 3/8.' },
  // ------------------------------------------------------------ exposición
  { slug: 'separador-senn-miller', nombre: 'Separador de Senn-Miller', categoria: 'exposicion', icono: 'separador', descripcion: 'Separa en espacios chicos, justo al abrir la piel.', especificaciones: 'Largo 160 mm · rastrillo de 3 garras romas y pala de 17 × 26 mm.' },
  { slug: 'separador-farabeuf', nombre: 'Separador de Farabeuf', categoria: 'exposicion', icono: 'separador', descripcion: 'Abre la piel y el plano subcutáneo. Se usa en pareja.', especificaciones: 'Largo 120–150 mm · palas de 10 × 25 y 12 × 30 mm.' },
  { slug: 'separador-hohmann', nombre: 'Separador de Hohmann', categoria: 'exposicion', icono: 'separador', descripcion: 'Retrae partes blandas y pasa por detrás del hueso.', especificaciones: 'Largo 240 mm · pala de 18 mm (6–8 mm los mini, 18–24 mm los de palanca) · punta en gancho.' },
  { slug: 'separador-gelpi', nombre: 'Separador autoestático de Gelpi', categoria: 'exposicion', icono: 'separador', descripcion: 'Se queda abierto solo, con puntas que se clavan en el borde de la herida.', especificaciones: 'Largo 120–180 mm · puntas afiladas · trinquete.' },
  { slug: 'separador-weitlaner', nombre: 'Separador autoestático de Weitlaner', categoria: 'exposicion', icono: 'separador', descripcion: 'Abre la herida y la mantiene abierta.', especificaciones: 'Largo 130–200 mm · rastrillos de 3 y 4 dientes · trinquete.' },
  { slug: 'separador-beckman-adson', nombre: 'Separador autoestático de Beckman-Adson', categoria: 'exposicion', icono: 'separador', descripcion: 'Como el de Weitlaner, más largo, para planos profundos.', especificaciones: 'Largo 200 mm · rastrillos 4 × 4 · trinquete.' },
  // ------------------------------------------------------------ periostio
  { slug: 'periostotomo-lambotte', nombre: 'Periostótomo AO / Lambotte', categoria: 'periostio', icono: 'punzon', descripcion: 'Despega el periostio respetando su irrigación.', especificaciones: 'Hojas planas de 6 mm (pequeño fragmento) y 14 mm (gran fragmento) · largo 200 mm.' },
  { slug: 'periostotomo-farabeuf', nombre: 'Periostótomo de Farabeuf (hoja curva)', categoria: 'periostio', icono: 'punzon', descripcion: 'Despega el periostio con una hoja acanalada.', especificaciones: 'Hoja curva o recta de 11 a 15 mm · largo 200 mm.' },
  { slug: 'elevador-freer', nombre: 'Elevador de Freer', categoria: 'periostio', icono: 'punzon', descripcion: 'Elevador fino de doble punta para abordajes periarticulares y minifragmentos.', especificaciones: 'Largo 180 mm · doble punta, afilada y roma.' },
  // ------------------------------------------------------------ reducción
  { slug: 'pinza-reduccion-verbrugge', nombre: 'Pinza de reducción de Verbrugge', categoria: 'reduccion', icono: 'pinza', descripcion: 'Sostiene el hueso con cremallera: ideal para fracturas espiroideas u oblicuas.', especificaciones: 'Longitudes de 140, 200 y 260 mm · ramas con trinquete · mandíbulas de garra.' },
  { slug: 'pinza-reduccion-puntas', nombre: 'Pinza de reducción con puntas (camarón / Weber)', categoria: 'reduccion', icono: 'pinza', descripcion: 'Tira de un fragmento con dos puntas que se clavan en el hueso.', especificaciones: 'Largo 180 mm · cremallera · dos puntas por mandíbula.' },
  { slug: 'pinza-reduccion-bola', nombre: 'Pinza de reducción de punta de bola', categoria: 'reduccion', icono: 'pinza', descripcion: 'Reduce fragmentos de pelvis y acetábulo sin dañar el hueso.', especificaciones: 'Largo 250 mm · cremallera · esferas de 4,6 mm.' },
  // ------------------------------------------------------------ perforación y fijación
  { slug: 'broca-2-5', nombre: 'Broca AO 2,5 mm', categoria: 'fijacion', icono: 'fresa', descripcion: 'Túnel piloto del tornillo cortical de 3,5 mm y del bloqueado LCP.', especificaciones: 'Ø 2,5 × 110 mm (110–150 mm en pequeño fragmento) · acople rápido AO.' },
  { slug: 'broca-3-2', nombre: 'Broca AO 3,2 mm', categoria: 'fijacion', icono: 'fresa', descripcion: 'Túnel piloto del tornillo cortical de 4,5 mm y del de esponjosa de 6,5 mm.', especificaciones: 'Ø 3,2 × 145 mm (145–195 mm en gran fragmento) · acople rápido AO.' },
  { slug: 'guia-broca-doble-dcp', nombre: 'Guía de broca doble DCP 2,5 / 3,5', categoria: 'fijacion', icono: 'guia', descripcion: 'Centra la broca (extremo neutro, verde) o la desplaza para comprimir (excéntrico, dorado).', especificaciones: 'Largo 78 mm · para broca de 2,5 mm (también 3,2/4,5 en gran fragmento).' },
  { slug: 'guia-broca-roscada-lcp', nombre: 'Guía de broca roscada LCP 2,5', categoria: 'fijacion', icono: 'guia', descripcion: 'Se enrosca en la placa bloqueada y fija la trayectoria a 90°.', especificaciones: 'Largo 92 mm · para tornillos bloqueados de 2,4, 3,5 y 5,0 mm.' },
  { slug: 'camisa-proteccion-trocar', nombre: 'Camisa de protección con guía y trocar', categoria: 'fijacion', icono: 'guia', descripcion: 'Protege las partes blandas y deja la guía concéntrica sobre el hueso.', especificaciones: 'Camisa Ø 8 mm · guía interna Ø 6 mm · trocar de tres facetas · largo 96 mm.' },
  { slug: 'medidor-profundidad', nombre: 'Medidor de profundidad AO', categoria: 'fijacion', icono: 'generico', descripcion: 'Da el largo del tornillo tras perforar.', especificaciones: 'Escala de 0 a 60 mm (pequeño fragmento) o a 110 mm (gran fragmento) · gancho en la punta.' },
  { slug: 'avellanador', nombre: 'Avellanador 6,0 mm', categoria: 'fijacion', icono: 'fresa', descripcion: 'Talla el lecho de la cabeza del tornillo para no fisurar el hueso.', especificaciones: 'Cabeza Ø 6,0 mm (tornillos 2,7 y 3,5) u 8,0 mm (tornillos 4,5).' },
  { slug: 'machuelo-3-5', nombre: 'Machuelo 3,5 mm', categoria: 'fijacion', icono: 'fresa', descripcion: 'Abre la rosca en hueso cortical denso antes del tornillo.', especificaciones: 'Núcleo 2,5 mm · paso 1,25 mm (4,5 mm: núcleo 3,2 y paso 1,75; 6,5 mm: paso 2,75).' },
  { slug: 'aguja-kirschner', nombre: 'Aguja de Kirschner 1,6 mm', categoria: 'fijacion', icono: 'aguja', descripcion: 'Fija la reducción de forma transitoria o guía un tornillo canulado.', especificaciones: 'Ø 1,6 × 150 mm (1,0 a 2,5 mm) · punta trocar o lanceta.' },
  { slug: 'destornillador-hexagonal', nombre: 'Destornillador hexagonal 2,5 con mango en T', categoria: 'fijacion', icono: 'atornillador', descripcion: 'Coloca a mano los tornillos corticales de 3,5 y 4,0 mm.', especificaciones: 'Hexágono 2,5 mm (1,5 mini; 3,5 gran fragmento) · largo 190 mm.' },
  { slug: 'destornillador-stardrive', nombre: 'Destornillador Stardrive T15', categoria: 'fijacion', icono: 'atornillador', descripcion: 'Coloca los tornillos bloqueados LCP de 3,5 mm sin resbalar.', especificaciones: 'Stardrive T15 (T8 en 2,0/2,4; T25 en 5,0) · largo 210 mm.' },
  { slug: 'limitador-torque', nombre: 'Limitador de torque 1,5 N·m', categoria: 'fijacion', icono: 'atornillador', descripcion: 'Evita barrer la rosca de una placa bloqueada.', especificaciones: '0,8 N·m (2,4 mm), 1,5 N·m (3,5 mm) y 4,0 N·m (5,0 mm) · acople AO.' },
  { slug: 'motor-quirurgico', nombre: 'Motor quirúrgico a batería', categoria: 'fijacion', icono: 'generico', descripcion: 'Mueve la broca, la fresa y el destornillador a motor.', especificaciones: 'Cuerpo de pistola · mandril AO / Hudson · gatillo.' },
  { slug: 'martillo', nombre: 'Martillo con caras de nailon', categoria: 'fijacion', icono: 'martillo', descripcion: 'Golpea el clavo, el separador de Hohmann y los impactores.', especificaciones: 'Cabeza Ø 40 mm con dos caras de nailon · mango de 260 mm.' },
  // ------------------------------------------------------------ modelado
  { slug: 'grifas-torsion', nombre: 'Grifa de torsión (bending iron)', categoria: 'modelado', icono: 'generico', descripcion: 'Dobla y tuerce la placa en los tres planos. Se usan en pareja.', especificaciones: 'Largo 250 mm · ranuras de 2,7/3,5 y 4,5 mm.' },
  { slug: 'alicate-doblado', nombre: 'Alicate de doblado de tres puntos', categoria: 'modelado', icono: 'pinza', descripcion: 'Dobla placas de reconstrucción de 3,5 y 4,5 mm.', especificaciones: 'Largo 215 mm · tres clavijas · empuñaduras de goma.' },
  { slug: 'plantilla-aluminio', nombre: 'Plantilla maleable de aluminio', categoria: 'modelado', icono: 'generico', descripcion: 'Copia el contorno del hueso para moldear la placa antes de colocarla.', especificaciones: 'Aluminio maleable · 12 orificios a 13 mm · 11 × 1,6 mm.' },
  // ------------------------------------------------------------ enclavado
  { slug: 'punzon-iniciador', nombre: 'Punzón iniciador curvo (awl)', categoria: 'enclavado', icono: 'punzon', descripcion: 'Marca el punto de entrada del clavo: vértice del trocánter mayor, tubérculo anterior de la tibia.', especificaciones: 'Largo 250 mm · vástago curvo · punta de tres filos.' },
  { slug: 'guia-punta-oliva', nombre: 'Guía de punta de oliva', categoria: 'enclavado', icono: 'aguja', descripcion: 'Pasa el canal medular y guía las fresas canuladas.', especificaciones: 'Ø 3,0 o 3,2 mm × 950–1.000 mm · esfera en la punta.' },
  { slug: 'tubo-intercambio', nombre: 'Tubo de intercambio', categoria: 'enclavado', icono: 'guia', descripcion: 'Permite retirar la guía de punta de oliva y pasar una guía lisa.', especificaciones: 'Largo 330 mm · Ø 8,6 / 6,6 mm.' },
  { slug: 'dedo-reductor', nombre: 'Dedo reductor endomedular', categoria: 'enclavado', icono: 'punzon', descripcion: 'Reduce indirectamente fragmentos dentro del canal sin abrir el foco.', especificaciones: 'Ø 9 mm · largo 420 mm · punta curva · empuñadura en T.' },
  { slug: 'fresa-flexible', nombre: 'Fresa flexible canulada', categoria: 'enclavado', icono: 'fresa', descripcion: 'Prepara el canal medular antes del clavo.', especificaciones: 'Cabezas de 8,5 a 12,0 mm de 0,5 en 0,5 · eje flexible · acople AO/Hudson.' },
  { slug: 'arco-insercion', nombre: 'Arco de inserción del clavo (guía proximal)', categoria: 'enclavado', icono: 'guia', descripcion: 'Guía los tornillos de bloqueo proximales del clavo.', especificaciones: 'Específico de cada clavo · perno de conexión · camisas de bloqueo.' },
]
