import type { CommandInfo } from 'claude-code'

export type Alias = { name: string; target: string }
export type Plan = { aliases: Alias[]; errors: string[] }

// CommandSpec names are limited to these characters and 64 characters.
const SHORT_NAME = /^[a-zA-Z0-9_-]{1,64}$/
const TARGET_NAME = /^[a-zA-Z0-9_:-]+$/
const RESERVED = 'slash-alias'

export function parseAliases(text: string): Plan {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { aliases: [], errors: ['Alias map must be valid JSON.'] }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { aliases: [], errors: ['Alias map must be a JSON object: { "a1": "long-namespace:long-command-name" }.'] }
  }
  const aliases: Alias[] = []
  const errors: string[] = []
  const names = new Set(Object.keys(value).map((name) => name.toLowerCase()))
  const seen = new Set<string>()
  for (const [name, target] of Object.entries(value)) {
    const key = name.toLowerCase()
    if (!SHORT_NAME.test(name) || key === RESERVED) {
      errors.push(`Invalid or reserved alias: ${name}.`)
    } else if (seen.has(key)) {
      errors.push(`Duplicate alias ignoring case: ${name}.`)
    } else if (typeof target !== 'string' || !TARGET_NAME.test(target)) {
      errors.push(`/${name}: target must be one command name without / or arguments.`)
    } else if (names.has(target.toLowerCase()) || target.toLowerCase() === RESERVED) {
      errors.push(`/${name}: alias chains and self references are not supported (${target}).`)
    } else {
      aliases.push({ name, target })
    }
    seen.add(key)
  }
  return { aliases, errors }
}

export function planAliases(parsed: Plan, commands: readonly CommandInfo[]): Plan {
  const names = new Set(commands.map((command) => command.name.toLowerCase()))
  const aliases: Alias[] = []
  const errors = [...parsed.errors]
  for (const alias of parsed.aliases) {
    if (names.has(alias.name.toLowerCase())) {
      errors.push(`/${alias.name}: an existing command already uses this name.`)
    } else if (!commands.some((command) => command.name === alias.target)) {
      errors.push(`/${alias.name}: target /${alias.target} is unavailable.`)
    } else {
      aliases.push(alias)
    }
  }
  return { aliases, errors }
}

export function suggestionsFor(aliases: readonly Alias[], token: string) {
  const prefix = token.slice(1)
  return aliases.filter(({ name }) => name.startsWith(prefix))
    .sort((a, b) => Number(b.name === prefix) - Number(a.name === prefix) || a.name.localeCompare(b.name))
    .map(({ name, target }) => ({
      text: `/${target} `,
      label: `/${name} → /${target}`,
      description: 'Tab to expand alias',
    }))
}
