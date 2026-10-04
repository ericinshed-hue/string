import type { Skill } from './types'

const NAME = /^[A-Za-z][A-Za-z0-9-]*$/

export function coerceSkills(value: unknown): Skill[] {
  if (!Array.isArray(value)) return []
  const skills: Skill[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<Skill>
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const instructions = typeof raw.instructions === 'string' ? raw.instructions : ''
    const id = typeof raw.id === 'string' && raw.id ? raw.id : ''
    if (!id || !NAME.test(name) || seen.has(name)) continue
    seen.add(name)
    skills.push({ id, name, instructions })
  }
  return skills
}

export function prepareSkills(value: Skill[]): Skill[] {
  const skills = value.map((skill) => ({
    id: skill.id,
    name: skill.name.trim(),
    instructions: skill.instructions.trim()
  }))
  const seen = new Set<string>()
  for (const skill of skills) {
    if (!skill.name) throw new Error('Skill name cannot be empty')
    if (!NAME.test(skill.name)) throw new Error('Skill names start with a letter and use only letters, numbers, and hyphens')
    if (!skill.instructions) throw new Error('Skill instructions cannot be empty')
    if (seen.has(skill.name)) throw new Error('Skill names must be unique')
    seen.add(skill.name)
  }
  return skills
}

export function applySkills(text: string, skills: Skill[]): { display: string; content: string } {
  const byName = new Map(skills.map((skill) => [skill.name, skill.instructions.trim()]))
  const instructions: string[] = []
  const rest = text
    .replace(/\\([A-Za-z][A-Za-z0-9-]*)/g, (full, name: string) => {
      const instructionsForName = byName.get(name)
      if (instructionsForName === undefined) return full
      instructions.push(instructionsForName)
      return ''
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  const content = [...instructions.filter(Boolean), rest].filter(Boolean).join('\n\n')
  return { display: text, content: content || text }
}
