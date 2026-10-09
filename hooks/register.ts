import type { EngineInterface, PluginOptions, Register } from 'claude-code'
import { parseAliases, planAliases, suggestionsFor, type Plan } from './aliases'
import { configOf, SOURCES } from './config'

type Loaded = Plan & { enabled: boolean }

async function load($: EngineInterface, declared: PluginOptions): Promise<Loaded> {
  const sources: unknown[] = []
  const errors: string[] = []
  for (const source of SOURCES) {
    try {
      sources.push(await $.settings.read({ source }))
    } catch {
      errors.push(`Cannot read ${source} settings.`)
    }
  }
  const cfg = configOf(declared, sources)
  const parsed = parseAliases(JSON.stringify(cfg.aliases))
  return { enabled: cfg.enabled, aliases: parsed.aliases, errors: [...errors, ...cfg.errors, ...parsed.errors] }
}

export const register: Register = (on, declared) => {
  let loaded: Promise<Loaded> | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'slash-alias',
      description: 'Slash aliases: doctor, reload',
      argumentHint: 'doctor | reload',
    })
    loaded = load($, declared)
    await loaded
    return next(e)
  })

  on('prompt.autocomplete', async ($, e, next) => {
    const result = await next(e)
    if (e.start !== 0 || !/^\/[A-Za-z0-9_-]+$/.test(e.token)) return result
    loaded ??= load($, declared)
    const cfg = await loaded
    if (!cfg.enabled) return result
    const plan = planAliases(cfg, await $.command.list())
    const suggestions = suggestionsFor(plan.aliases, e.token)
    return { suggestions: [...result.suggestions, ...suggestions] }
  })

  on('command.run', { command: 'slash-alias' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub && sub !== 'doctor' && sub !== 'reload') {
      return { text: 'Usage: /slash-alias doctor | reload' }
    }
    if (sub === 'reload') loaded = undefined
    loaded ??= load($, declared)
    const cfg = await loaded
    const plan = planAliases(cfg, await $.command.list())
    return { text: [
      `slash-alias: ${cfg.enabled ? 'enabled' : 'disabled'}`,
      ...plan.aliases.map(({ name, target }) => `/${name} → /${target} (Tab to expand)`),
      ...(plan.aliases.length ? [] : ['No available aliases.']),
      ...plan.errors.map((error) => `Error: ${error}`),
      'Configuration: pluginConfigs.slash-alias.options["alias.<name>"].',
    ].join('\n') }
  })
}
