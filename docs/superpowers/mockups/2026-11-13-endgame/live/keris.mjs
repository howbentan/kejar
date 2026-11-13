// One-off: draw Hang Jebat's logo with a real keris (wavy blade, guard, bird-head hilt). Run from app/.
import fs from 'node:fs'

const f = (n) => n.toFixed(1)
const top = 6
const base = 80
const L = []
const R = []
for (let i = 0; i <= 28; i++) {
  const t = i / 28
  const y = base - (base - top) * t
  const w = 6 * (1 - t * 0.85) + 0.6
  const off = 4.2 * Math.sin(t * Math.PI * 7) * (1 - t * 0.6) // seven luk, easing towards the tip
  L.push([50 + off - w, y])
  R.push([50 + off + w, y])
}
const blade = 'M' + L.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + ` L50 ${f(top - 2)} L` + R.reverse().map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + ' Z'

const O = 'stroke="#141414" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'
const parts = [
  `<path d="M18 8 L84 6 L88 94 L14 96 Z" fill="#F1E3C3" ${O}/>`,
  `<path d="M26 20 h50 M32 28 h38" stroke="#5A3A1A" stroke-width="5" stroke-linecap="round"/>`,
  `<path d="M26 84 h48" stroke="#5A3A1A" stroke-width="4" stroke-linecap="round"/>`,
  `<g transform="rotate(38 50 55)">`,
  `<path d="${blade}" fill="#B8BCC4" ${O}/>`,
  `<path d="M50 74 Q49 50 51 20" fill="none" stroke="#8A9099" stroke-width="1.6" stroke-linecap="round"/>`,
  `<path d="M36 80 Q50 76 62 79 L60 85 Q48 84 38 86 Z" fill="#C9A227" ${O}/>`,
  `<path d="M46 85 Q44 96 47 104 Q50 110 57 108 Q62 106 60 100 Q55 102 54 96 Q55 90 54 85 Z" fill="#7A4A1E" ${O}/>`,
  `<circle cx="57.5" cy="103" r="1.4" fill="#141414"/>`,
  `</g>`,
]

const file = 'mockups/endgame/main.tsx'
let s = fs.readFileSync(file, 'utf8')
const start = s.indexOf('  jebat: [')
const endMark = "].join(' '),"
const end = s.indexOf(endMark, start) + endMark.length
if (start < 0 || end < start) throw new Error('jebat entry not found')
const entry = '  // A WANTED poster with a keris across it: wavy blade (luk), the guard (ganja) and a bird-head hilt (hulu).\n  jebat: ' + JSON.stringify(parts.join(' ')) + ','
s = s.slice(0, start) + entry + s.slice(end)
s = s.replace('  // A WANTED poster with a keris across it.\n  // A WANTED', '  // A WANTED')
fs.writeFileSync(file, s)
console.log('keris drawn')
