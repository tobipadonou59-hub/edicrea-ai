// Génère les icônes de l'application (PWA, iOS, favicon) à partir d'un logo de public/brand.
// Usage : node scripts/make-icons.cjs 03
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const n = (process.argv[2] || '03').padStart(2, '0')
const root = path.join(__dirname, '..', 'public')
const svg = fs.readFileSync(path.join(root, 'brand', `logo-${n}.svg`), 'utf8')
const bg = (svg.match(/<rect width="512" height="512" rx="116" fill="(#[0-9a-fA-F]{3,6})"/) || [])[1] || '#c99a49'
const square = svg.replace(/(<rect width="512" height="512") rx="116"/, '$1')
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  const shot = async (markup, size, file, transparent) => {
    await p.setViewportSize({ width: size, height: size })
    await p.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : bg}">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
    await p.screenshot({ path: path.join(root, file), omitBackground: !!transparent })
  }
  fs.mkdirSync(path.join(root, 'icons'), { recursive: true })
  await shot(svg, 192, 'icons/icon-192.png', true)
  await shot(svg, 512, 'icons/icon-512.png', true)
  // version « maskable » : fond plein bord à bord, motif dans la zone sûre (80 %)
  const inner = square.replace('<svg ', '<svg style="display:block" ')
  await p.setViewportSize({ width: 512, height: 512 })
  await p.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:512px">${square.replace('<svg ', '<svg width="400" height="400" ')}</body></html>`)
  await p.screenshot({ path: path.join(root, 'icons/maskable-512.png') })
  await p.setViewportSize({ width: 180, height: 180 })
  await p.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:180px">${square.replace('<svg ', '<svg width="160" height="160" ')}</body></html>`)
  await p.screenshot({ path: path.join(root, 'icons/apple-touch-icon.png') })
  await shot(svg, 64, 'icons/favicon-64.png', true)
  fs.writeFileSync(path.join(root, 'favicon.svg'), svg)
  void inner
  await b.close()
  console.log('Icônes générées depuis logo-' + n)
})()
