import { useId } from 'react'
import type { EndgameKind } from '../../shared/types.js'
import type { View } from '../../shared/views.js'

const O = 'stroke="#141414" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'

/**
 * The four endgame logos (endgame design §6.4), drawn like the power-up stickers: wobbly ink outline, flat real-life
 * fills, white sticker edge. Copied from the approved mockup (`docs/superpowers/mockups/2026-11-13-endgame`).
 */
const LOGO: Record<EndgameKind, string> = {
  // A blue wave rising, with a lightning bolt ("kilat") striking through it.
  banjir: [
    `<path d="M6 70 Q20 52 34 64 Q48 76 62 60 Q76 44 94 58 L94 96 L6 96 Z" fill="#3D8BFD" ${O}/>`,
    `<path d="M6 82 Q22 70 36 80 Q50 90 64 78 Q78 66 94 76" fill="none" stroke="#9CC8FF" stroke-width="4" stroke-linecap="round"/>`,
    `<path d="M14 56 Q20 40 34 46 Q30 56 22 58" fill="#BFDBFF" ${O}/>`,
    `<path d="M58 4 L40 44 L54 44 L42 80 L72 34 L58 34 L68 4 Z" fill="#FFD60A" ${O}/>`,
    `<path d="M80 18 l4 -6 M88 26 l7 -2 M76 10 l-1 -7" stroke="#141414" stroke-width="3" stroke-linecap="round"/>`,
  ].join(' '),
  // A red fire helmet with a spinning siren on top and alarm lines.
  bomba: [
    `<path d="M12 74 Q12 34 50 30 Q88 34 88 74 Z" fill="#E63946" ${O}/>`,
    `<path d="M4 76 Q50 66 96 76 Q96 86 50 88 Q4 86 4 76 Z" fill="#C1121F" ${O}/>`,
    `<path d="M50 30 L50 72" stroke="#141414" stroke-width="3"/>`,
    `<path d="M40 52 Q50 46 60 52 L58 64 Q50 60 42 64 Z" fill="#FFD60A" ${O}/>`,
    `<path d="M40 30 Q40 14 50 14 Q60 14 60 30 Z" fill="#4DA3FF" ${O}/>`,
    `<path d="M24 16 l-8 -8 M76 16 l8 -8 M18 30 l-12 -2 M82 30 l12 -2" stroke="#141414" stroke-width="3" stroke-linecap="round"/>`,
  ].join(' '),
  // A WANTED poster with a keris across it: wavy blade (luk), the guard (ganja) and a bird-head hilt (hulu).
  hebat:
    '<path d="M18 8 L84 6 L88 94 L14 96 Z" fill="#F1E3C3" stroke="#141414" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/> <path d="M26 20 h50 M32 28 h38" stroke="#5A3A1A" stroke-width="5" stroke-linecap="round"/> <path d="M26 84 h48" stroke="#5A3A1A" stroke-width="4" stroke-linecap="round"/> <g transform="rotate(38 50 55)"> <path d="M43.4 80.0 L46.5 77.4 L47.8 74.7 L46.7 72.1 L44.1 69.4 L41.7 66.8 L40.8 64.1 L42.2 61.5 L44.9 58.9 L47.4 56.2 L48.5 53.6 L47.7 50.9 L45.6 48.3 L43.6 45.6 L43.0 43.0 L44.1 40.4 L46.3 37.7 L48.4 35.1 L49.3 32.4 L48.6 29.8 L47.0 27.1 L45.6 24.5 L45.2 21.9 L46.1 19.2 L47.8 16.6 L49.3 13.9 L50.0 11.3 L49.6 8.6 L48.5 6.0 L50 4.0 L51.5 6.0 L52.9 8.6 L53.7 11.3 L53.4 13.9 L52.2 16.6 L50.9 19.2 L50.4 21.9 L51.1 24.5 L53.0 27.1 L54.9 29.8 L55.9 32.4 L55.4 35.1 L53.7 37.7 L51.9 40.4 L51.1 43.0 L52.1 45.6 L54.4 48.3 L56.9 50.9 L58.1 53.6 L57.4 56.2 L55.1 58.9 L52.8 61.5 L51.8 64.1 L53.0 66.8 L55.9 69.4 L58.8 72.1 L60.3 74.7 L59.3 77.4 L56.6 80.0 Z" fill="#B8BCC4" stroke="#141414" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/> <path d="M50 74 Q49 50 51 20" fill="none" stroke="#8A9099" stroke-width="1.6" stroke-linecap="round"/> <path d="M36 80 Q50 76 62 79 L60 85 Q48 84 38 86 Z" fill="#C9A227" stroke="#141414" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/> <path d="M46 85 Q44 96 47 104 Q50 110 57 108 Q62 106 60 100 Q55 102 54 96 Q55 90 54 85 Z" fill="#7A4A1E" stroke="#141414" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/> <circle cx="57.5" cy="103" r="1.4" fill="#141414"/> </g>',
  // A padlocked road barrier, red and white, like a lockdown roadblock.
  pkp: [
    `<rect x="4" y="44" width="92" height="22" rx="4" fill="#FFFFFF" ${O}/>`,
    `<path d="M16 44 L4 60 M34 44 L18 66 M54 44 L38 66 M74 44 L58 66 M94 44 L78 66" stroke="#E63946" stroke-width="8"/>`,
    `<rect x="4" y="44" width="92" height="22" rx="4" fill="none" ${O}/>`,
    `<path d="M14 66 L10 96 M86 66 L90 96" fill="none" ${O}/>`,
    `<path d="M38 30 Q38 12 50 12 Q62 12 62 30" fill="none" stroke="#141414" stroke-width="9" stroke-linecap="round"/>`,
    `<path d="M38 30 Q38 12 50 12 Q62 12 62 30" fill="none" stroke="#B8BCC4" stroke-width="5" stroke-linecap="round"/>`,
    `<rect x="32" y="28" width="36" height="30" rx="5" fill="#FFD60A" ${O}/>`,
    `<circle cx="50" cy="40" r="4" fill="#141414"/><path d="M50 42 L50 50" stroke="#141414" stroke-width="3"/>`,
  ].join(' '),
}

/**
 * Each endgame's words and colours (endgame design §6.4, §7 to §9). Colours are tokens.css names. Hang Hebat's rule
 * and line name the wanted runner: `{who}` is their armband and name, `{name}` their name (see `endgameText`).
 */
export const ENDGAME_COPY: Record<EndgameKind, { name: string; title: string; colour: string; ink: string; when: string; rule: string; line: string }> = {
  banjir: {
    name: 'Banjir Kilat',
    title: 'banjir kilat!',
    colour: 'var(--banjir)',
    ink: 'var(--black)',
    when: '10 MINUTES LEFT · ENDGAME',
    rule: 'The park floods inward every few minutes until only a small dry patch is left.',
    line: 'Caught in the water? You get 60 s to get back inside the line.',
  },
  bomba: {
    name: 'Bomba',
    title: 'bomba!',
    colour: 'var(--bomba)',
    ink: 'var(--black)',
    when: '10 MINUTES LEFT · ENDGAME',
    rule: 'Pings every 2 minutes now, then every minute from 5 minutes left.',
    line: 'At 1 minute left: every Dikejar shows exactly. No fuzz, no Ponteng.',
  },
  hebat: {
    name: 'Hang Hebat',
    title: 'hang hebat!',
    colour: 'var(--hebat)',
    ink: 'var(--hebat-ink)',
    when: '10 MINUTES LEFT · ENDGAME',
    // The spec's "#07 Aina survived the longest, so she's now wanted." with the real runner. Nothing records anyone's
    // pronouns, so "they're", and the line uses the name.
    rule: "{who} survived the longest, so they're now wanted.",
    line: 'Kejar catch {name}: Kejar win. {name} reaches the whistle: Dikejar win.',
  },
  pkp: {
    name: 'PKP',
    title: 'pkp!',
    colour: 'var(--pkp)',
    ink: 'var(--black)',
    when: '5 MINUTES LEFT · ENDGAME',
    rule: 'Penjara is closed for good. No more jailbreaks.',
    line: 'Every station now gives two goes of its card. Use them or lose them.',
  },
}

/** The wanted runner as the poster and chip say it: "#07 Aina", or just the name for a runner with no armband. */
export function wantedLabel(w: { label: string; name: string }): string {
  return w.label === w.name ? w.name : `${w.label} ${w.name}`
}

/** True when this phone is Hang Hebat's wanted runner. */
export const isWanted = (view: View) => !!view.endgame?.wanted && view.endgame.wanted.id === view.me.id

/** The rule card's two lines for this phone: Hang Hebat's name the wanted runner, and the wanted runner gets "You're wanted." */
export function endgameText(view: View): { rule: string; line: string } {
  const e = view.endgame
  if (!e) return { rule: '', line: '' }
  const copy = ENDGAME_COPY[e.kind]
  if (e.kind !== 'hebat' || !e.wanted) return { rule: copy.rule, line: copy.line }
  if (isWanted(view)) return { rule: "You're wanted.", line: 'Kejar catch you: Kejar win. You reach the whistle: Dikejar win.' }
  const w = e.wanted
  return { rule: copy.rule.replace('{who}', wantedLabel(w)), line: copy.line.replaceAll('{name}', w.name) }
}

/** An endgame's sticker logo. Each one defines its own filters, so several on one screen never share ids. */
export default function EndgameLogo({ kind, size = 120, tilt = -4 }: { kind: EndgameKind; size?: number; tilt?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg viewBox="-8 -6 116 120" width={size} height={size} role="img" aria-label={ENDGAME_COPY[kind].name} data-endgame-logo={kind}>
      <defs>
        <filter id={`egw-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={3.2} />
        </filter>
        <filter id={`egs-${id}`} x="-25%" y="-25%" width="150%" height="150%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={4.5} result="d" />
          <feFlood floodColor="#F5F5F3" />
          <feComposite in2="d" operator="in" result="w" />
          <feOffset in="w" dy={3.5} result="o" />
          <feFlood floodColor="#000" floodOpacity={0.55} />
          <feComposite in2="o" operator="in" result="sh" />
          <feMerge>
            <feMergeNode in="sh" />
            <feMergeNode in="w" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#egs-${id})`}>
        {/* Static drawing markup we made ourselves (above), never user input. */}
        <g filter={`url(#egw-${id})`} transform={`rotate(${tilt} 50 55)`} dangerouslySetInnerHTML={{ __html: LOGO[kind] }} />
      </g>
    </svg>
  )
}
