// Builds the mockup and inlines it into one self-contained page: new-deck-cards.html.
// Run from app/: node mockups/e1/build.mjs
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
execSync('npx vite build --config mockups/e1/vite.config.ts', { stdio: 'inherit', cwd: path.join(here, '../..') })
const dist = path.join(here, 'dist')
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const jsFile = fs.readdirSync(path.join(dist, 'assets')).find((f) => f.endsWith('.js'))
const js = fs.readFileSync(path.join(dist, 'assets', jsFile), 'utf8').split('</script').join('<\\/script')
const head = html.slice(0, html.indexOf('</head>'))
const styles = [...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n')
const top = `<title>New Deck Cards</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;600;700;800&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
<style>:root{color-scheme:dark;--page:#050505} body{background:var(--page);margin:0} .mk{padding-left:max(16px,env(safe-area-inset-left,0px))!important;padding-right:max(16px,env(safe-area-inset-right,0px))!important}</style>
`
// String concatenation only: replace() would treat $ sequences in the bundle as patterns.
fs.writeFileSync(path.join(here, 'new-deck-cards.html'), top + styles + '\n<div id="root"></div>\n<script>' + js + '</script>\n')
console.log('wrote new-deck-cards.html')
