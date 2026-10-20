import type { Role } from './types.js'

/** Marshals keep their role; of everyone else about 1 in 4 becomes a chaser (at least 1). */
export function shuffleRoles(playerIds: string[], marshalIds: string[], rng: () => number): Record<string, Role> {
  const roles: Record<string, Role> = {}
  const others = playerIds.filter((id) => !marshalIds.includes(id))
  for (const id of marshalIds) if (playerIds.includes(id)) roles[id] = 'marshal'
  const shuffled = [...others]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const chasers = Math.max(1, Math.round(others.length / 4))
  shuffled.forEach((id, i) => {
    roles[id] = i < chasers ? 'chaser' : 'runner'
  })
  return roles
}

export function validateTeams(roles: Record<string, Role>): string[] {
  const all = Object.values(roles)
  const chasers = all.filter((r) => r === 'chaser').length
  const runners = all.filter((r) => r === 'runner').length
  const problems: string[] = []
  if (chasers < 1) problems.push('Need at least 1 chaser')
  if (runners < 2) problems.push('Need at least 2 runners')
  if (chasers > runners) problems.push('More chasers than runners')
  return problems
}
