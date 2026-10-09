import type { On, PromptAutocompleteInput, PromptAutocompleteResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

const TARGET = 'long-namespace:long-command-name'
const settings = (aliases: Record<string, unknown>, enabled = true) => ({
  pluginConfigs: { 'slash-alias': { options: { ...Object.fromEntries(Object.entries(aliases).map(([name, target]) => [`alias.${name}`, target])), enabled } } },
})

// 2.1.295's test runtime exposes autocomplete but its Engine type omits this
// newly added event from EventCalls. Keep the accommodation in tests only.
function autocomplete($: Engine, input: PromptAutocompleteInput): Promise<PromptAutocompleteResult> {
  const prompt = $.prompt as typeof $.prompt & {
    autocomplete(input: PromptAutocompleteInput): Promise<PromptAutocompleteResult>
  }
  return prompt.autocomplete(input)
}

function world(on: On, source: () => Record<string, unknown>, names: () => string[] = () => [TARGET], extra: {
  suggestions?: { text: string; label: string }[]
  registered?: string[]
  local?: Record<string, unknown>
} = {}) {
  on('settings.read', ($, e) => ({ value: e.source === 'user' ? source() : e.source === 'local' ? extra.local ?? {} : {} }))
  on('command.list', () => ({ value: names().map((name) => ({ name, description: 'Original command', source: 'plugin' as const })) }))
  on('command.register', ($, e) => { extra.registered?.push(e.name); return { value: { command: e.name } } })
  on('prompt.autocomplete', () => ({ suggestions: extra.suggestions ?? [] }))
}

function at(text: string, cursor = text.length) {
  let start = cursor
  while (start > 0 && !/\s/.test(text[start - 1]!)) start--
  return { text, cursor, start, token: text.slice(start, cursor) }
}

function slash(args: string) {
  return { command: 'slash-alias', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
}

test('alias row inserts the original name and a space for native arguments', async ($, on) => {
  world(on, () => settings({ a1: TARGET }))
  const { suggestions } = await autocomplete($, at('/a1'))
  expect(suggestions).toEqual([{ text: `/${TARGET} `, label: `/a1 → /${TARGET}`, description: 'Tab to expand alias' }])
  // The host's Tab takes suggestion.text over [start, cursor), keeping the suffix.
  const input = at('/a1 existing args', 3)
  const row = (await autocomplete($, input)).suggestions[0]!
  const expanded = input.text.slice(0, input.start) + row.text + input.text.slice(input.cursor)
  expect(expanded).toBe(`/${TARGET}  existing args`)
})

test('canonical name and parameters produce no alias rows', async ($, on) => {
  world(on, () => settings({ a1: TARGET }))
  for (const text of [`/${TARGET} `, `/${TARGET} a1`, 'mention /a1', 'a1', '/unrelated']) {
    expect((await autocomplete($, at(text))).suggestions).toEqual([])
  }
})

test('exact alias wins over longer alias prefixes', async ($, on) => {
  world(on, () => settings({ a10: TARGET, a1: TARGET, a2: TARGET }))
  const { suggestions } = await autocomplete($, at('/a1'))
  expect(suggestions.map((s) => s.label)).toEqual([`/a1 → /${TARGET}`, `/a10 → /${TARGET}`])
})

test('existing command collisions and missing targets are reported and omitted', async ($, on) => {
  world(on, () => settings({ a1: TARGET, a2: 'missing' }), () => [TARGET, 'a1'])
  expect((await autocomplete($, at('/a1'))).suggestions).toEqual([])
  const { text } = await $.command.run(slash('doctor'))
  expect(text).toContain('existing command already uses this name')
  expect(text).toContain('target /missing is unavailable')
})

test('disabled mod returns other mods suggestions unchanged', async ($, on) => {
  world(on, () => settings({ a1: TARGET }, false), undefined, { suggestions: [{ text: '/other ', label: 'Other mod' }] })
  expect((await autocomplete($, at('/a1'))).suggestions).toEqual([{ text: '/other ', label: 'Other mod' }])
})

test('reload reads edited configuration without registering alias commands', async ($, on) => {
  let value = settings({ a1: TARGET })
  const registered: string[] = []
  world(on, () => value, undefined, { registered })
  on('session.start', ($, e) => e)
  await $.session.start({ cwd: '/tmp/example', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual(['slash-alias'])
  value = settings({ a2: TARGET })
  await $.command.run(slash('reload'))
  expect((await autocomplete($, at('/a1'))).suggestions).toEqual([])
  expect((await autocomplete($, at('/a2'))).suggestions[0]?.text).toBe(`/${TARGET} `)
})

test('disabling the target plugin removes its alias without reload', async ($, on) => {
  let names = [TARGET]
  world(on, () => settings({ a1: TARGET }), () => names)
  expect((await autocomplete($, at('/a1'))).suggestions).toHaveLength(1)
  names = []
  expect((await autocomplete($, at('/a1'))).suggestions).toEqual([])
})

test('invalid names, targets and chains fail clearly', async ($, on) => {
  world(on, () => settings({ 'bad name': TARGET, chain: 'a1', a1: TARGET, args: `${TARGET} param` }))
  const { text } = await $.command.run(slash('doctor'))
  expect(text).toContain('Invalid or reserved alias')
  expect(text).toContain('alias chains and self references')
  expect(text).toContain('without / or arguments')
  expect((await autocomplete($, at('/a1'))).suggestions).toHaveLength(1)
})

test('settings precedence merges aliases from qualified plugin configs and flat keys', async ($, on) => {
  world(on, () => settings({ a1: 'old:target', keep: TARGET }), undefined, {
    local: { pluginConfigs: { 'slash-alias@local': { options: { 'alias.a1': TARGET } } } },
  })
  const { text } = await $.command.run(slash('doctor'))
  expect(text).toContain(`/a1 → /${TARGET}`)
  expect(text).toContain(`/keep → /${TARGET}`)
  expect(text).not.toContain('unavailable')
})
