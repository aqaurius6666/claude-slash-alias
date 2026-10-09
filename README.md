# slash-alias

Give Claude Code slash commands a short alias. Type the alias and press **Tab** to expand it:

```text
/a1 + Tab → /long-namespace:long-command-name <cursor>
```

The original command's argument hints and completions continue from there. Press Enter when you're ready to run it.

Tested on Claude Code **2.1.295**.

## Load

```sh
claude --plugin-dir /absolute/path/to/slash-alias
```

## Configure

Add this to your user or project `settings.json`:

```json
{
  "pluginConfigs": {
    "slash-alias": {
      "options": {
        "alias.a1": "long-namespace:long-command-name"
      }
    }
  }
}
```

Each `alias.<name>` option maps a short name to an existing command, without the leading `/`. Keep options flat; Claude Code rejects nested objects here. Set `"enabled": false` to turn aliases off.

After editing settings, run `/slash-alias reload`.

| Command | Purpose |
|---|---|
| `/slash-alias doctor` | List available aliases and configuration errors |
| `/slash-alias reload` | Apply settings changes |

Settings merge per alias: user < project < local < flag < policy. Qualified plugin keys such as `slash-alias@my-marketplace` also work.

## Behavior

- Type `/a1`, wait for the alias row, then press Tab. Submitting `/a1` without expanding it does not invoke the target.
- Claude Code places its own suggestions above mod rows. If another suggestion matches, select the alias row with the arrow keys before pressing Tab.
- Aliases apply to the first token only. Existing command names take priority; unavailable targets and invalid aliases are reported by `doctor`.
- Alias chains and preset arguments are not supported. Parameter suggestions come from the original command.

## Development

Claude Code loads the TypeScript directly. The mod uses `prompt.autocomplete` and requires no bundle patch or wrapper skill.

```sh
claude plugin validate . --strict
claude plugin test .
```

Loading the mod generates types in `.claude-plugin/types/`. Run `tsc -p tsconfig.json` to check the source and tests.

## Releases

PR titles and commit subjects must follow Conventional Commits. Pushes to `main` automatically bump the plugin version and create a `vX.Y.Z` tag:

| Commit | Bump |
|---|---|
| `feat!:` or `BREAKING CHANGE` | Major |
| `feat:` | Minor |
| `fix:`, `perf:`, `refactor:` | Patch |
| `docs:`, `test:`, `chore:`, `ci:`, `build:`, `style:`, `revert:` | None |

For a manual bump, run the `bump-version` workflow on `main` and choose patch, minor, or major. GitHub Actions needs permission to write contents and push the version commit to `main`.
