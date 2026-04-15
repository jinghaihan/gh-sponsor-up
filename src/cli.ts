import type { CAC } from 'cac'
import type { CommandOptions } from './types'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import c from 'ansis'
import { cac } from 'cac'
import { DEFAULT_OPTIONS, detectCodespaces } from 'code-finder'
import tildify from 'tildify'
import { resolveConfig } from './config'
import { NAME, VERSION } from './constants'
import { updateCodespace } from './handler'

const cli: CAC = cac(NAME)

cli
  .command('', 'Sync funding metadata and enable GitHub sponsorships in bulk')
  .option('--cwd <path>', 'Current working directory')
  .option('--funding <fundings>', 'Funding people or organizations of github sponsorships')
  .option('--token <token>', 'GitHub token for enabling project sponsorships')
  .option('--commit', 'Whether to commit the changes', { default: false })
  .option('--push', 'Whether to push the changes', { default: false })
  .option('--message <message>', 'Commit message', { default: 'chore: update funding metadata' })
  .option('--project', 'Whether to enable GitHub sponsorships for the project', { default: true })
  .allowUnknownOptions()
  .action((options: Partial<CommandOptions>) => runCliAction(options).catch((error) => {
    console.error(error)
    process.exit(1)
  }))

cli.help()
cli.version(VERSION)

async function runCliAction(options: Partial<CommandOptions>) {
  p.intro(`${c.yellow`${NAME} `}${c.dim`v${VERSION}`}`)

  const config = await resolveConfig(options)

  const codespaces = await detectCodespaces({
    ...DEFAULT_OPTIONS,
    cwd: config.cwd || process.cwd(),
  })

  const paths = codespaces.map(i => fileURLToPath(i.folderUri!))

  const result = await p.multiselect({
    message: 'select the repositories',
    options: paths.map(path => ({ value: path, label: tildify(path) })),
  })

  if (p.isCancel(result) || result.length === 0) {
    p.cancel(c.red('aborting'))
    process.exit(0)
  }

  const spinner = p.spinner()
  spinner.start(
    config.project
      ? 'updating funding metadata and enabling GitHub sponsorships'
      : 'syncing funding metadata',
  )

  for (const path of result)
    await updateCodespace(path, config)

  spinner.stop(`update ${c.yellow(result.length)} repositories`)

  p.outro(c.green('done'))
}

try {
  cli.parse()
}
catch (error) {
  console.error(error)
  process.exit(1)
}
