import type { Role } from './types.js'

/** Problems with the teams the organiser picked; Start refuses until there are none. */
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
