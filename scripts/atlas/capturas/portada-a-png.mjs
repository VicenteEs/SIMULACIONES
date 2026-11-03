// Dibuja capturas-del-modelo/portada/portada.html con Chrome real y la deja como PNG de 1920 × 1080 (y otra al doble de tamaño, para pantallas densas).
import { createRequire } from 'node:module'
const require = createRequire('D:/simulaciones/package.json')
const { chromium } = require('playwright-core')
const carpeta = 'D:/simulaciones/capturas-del-modelo/portada'

const navegador = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
for (const [escala, nombre] of [[1, 'portada.png'], [2, 'portada@2x.png']]) {
  const pagina = await (await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: escala })).newPage()
  await pagina.goto(`file:///${carpeta}/portada.html`, { waitUntil: 'networkidle' })
  await pagina.evaluate(() => document.fonts.ready)
  await pagina.waitForTimeout(500)
  await pagina.screenshot({ path: `${carpeta}/${nombre}` })
  console.log('guardada', nombre)
}
await navegador.close()
