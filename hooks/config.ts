export const SOURCES = ['user', 'project', 'local', 'flag', 'policy'] as const

type Config = { enabled: boolean; aliases: Record<string, unknown>; errors: string[] }

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

// Dynamic options are read directly: the engine passes only
// manifest-declared fields to register. Settings options must stay flat.
export function configOf(declared: Record<string, unknown>, sources: readonly unknown[]): Config {
  const cfg: Config = { enabled: declared.enabled !== false, aliases: {}, errors: [] }
  for (const source of sources) {
    const configs = object(object(source)?.pluginConfigs)
    for (const [id, config] of Object.entries(configs ?? {})) {
      if (id !== 'slash-alias' && !id.startsWith('slash-alias@')) continue
      const options = object(object(config)?.options)
      if (!options) continue
      if (typeof options.enabled === 'boolean') cfg.enabled = options.enabled
      for (const [key, value] of Object.entries(options)) {
        if (key.startsWith('alias.')) cfg.aliases[key.slice(6)] = value
        else if (key !== 'enabled') cfg.errors.push(`Unknown option: ${key}. Use alias.<name> keys.`)
      }
    }
  }
  return cfg
}
