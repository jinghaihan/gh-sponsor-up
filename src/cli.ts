import type { CAC } from 'cac'
import type { CommandOptions, ProjectPhaseResult, RepositoryFailure, RepositoryUpdateResult, UpdatePhaseResult } from './types'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import c from 'ansis'
import { cac } from 'cac'
import { DEFAULT_OPTIONS, detectCodespaces } from 'code-finder'
import pRetry, { AbortError } from 'p-retry'
import tildify from 'tildify'
import { resolveConfig } from './config'
import { NAME, VERSION } from './constants'
import { enableProjectSponsorship, isRetryableProjectSponsorshipError } from './github'
import { updateCodespace } from './updater'

const cli: CAC = cac(NAME)

cli
  .command('', 'Sync funding metadata and enable GitHub sponsorships in bulk')
  .option('--cwd <path>', 'Current working directory')
  .option('--funding <fundings>', 'Funding people or organizations of github sponsorships')
  .option('--token <token>', 'GitHub token for enabling project sponsorships')
  .option('--commit', 'Whether to commit the changes', { default: true })
  .option('--push', 'Whether to push the changes', { default: true })
  .option('--message <message>', 'Commit message', { default: 'chore: update funding metadata' })
  .option('--project', 'Whether to enable GitHub sponsorships for the project', { default: true })
  .option('--post-run <command>', 'A command to run after updating the repository')
  .option('--retries <count>', 'How many times to retry enabling GitHub sponsorships')
  .option('--retry-interval <ms>', 'How long to wait between sponsorship retry attempts in milliseconds')
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

  p.log.step(`selected ${c.yellow(result.length)} repositories`)

  const updatePhase = await runUpdatePhase(result, config)
  const projectPhase = config.project
    ? await runProjectPhase(updatePhase.results, config)
    : {
        enabledCount: 0,
        failures: [],
        skippedCount: 0,
      }

  reportFailures([...updatePhase.failures, ...projectPhase.failures])
  reportSkippedProjectTargets(config.project, projectPhase.skippedCount)
  renderSummary(result.length, updatePhase.results.length, projectPhase.enabledCount, updatePhase.failures.length + projectPhase.failures.length)

  if (updatePhase.failures.length || projectPhase.failures.length) {
    process.exitCode = 1
    p.outro(c.yellow('done with issues'))
    return
  }

  p.outro(c.green('done'))
}

async function runUpdatePhase(paths: string[], config: Awaited<ReturnType<typeof resolveConfig>>): Promise<UpdatePhaseResult> {
  const results: RepositoryUpdateResult[] = []
  const failures: RepositoryFailure[] = []
  const spinner = p.spinner()
  spinner.start(`syncing funding metadata for ${c.yellow(paths.length)} repositories`)

  for (const [index, path] of paths.entries()) {
    spinner.message(`syncing ${tildify(path)} ${formatProgress(index + 1, paths.length)}`)

    try {
      results.push(await updateCodespace(path, config))
    }
    catch (error) {
      failures.push({
        path,
        stage: 'update',
        error: toError(error),
      })
    }
  }

  spinner.stop(`updated ${c.yellow(results.length)} of ${c.yellow(paths.length)} repositories`)

  return {
    results,
    failures,
  }
}

async function runProjectPhase(results: RepositoryUpdateResult[], config: Awaited<ReturnType<typeof resolveConfig>>): Promise<ProjectPhaseResult> {
  const projectTargets = results.filter(result => canEnableProjectSponsorship(result))
  const failures: RepositoryFailure[] = []
  const spinner = p.spinner()
  let enabledCount = 0

  spinner.start(`enabling GitHub sponsorships for ${c.yellow(projectTargets.length)} repositories`)

  for (const [index, path] of projectTargets.map(result => result.path).entries()) {
    spinner.message(`enabling ${tildify(path)} ${formatProgress(index + 1, projectTargets.length)}`)

    try {
      const enabled = await pRetry(async () => {
        try {
          return await enableProjectSponsorship(path, config.token)
        }
        catch (error) {
          const retryError = toError(error)
          if (!isRetryableProjectSponsorshipError(retryError))
            throw new AbortError(retryError)

          throw retryError
        }
      }, {
        retries: config.retries,
        minTimeout: config.retryInterval,
        maxTimeout: config.retryInterval,
        factor: 1,
        randomize: false,
        onFailedAttempt(context) {
          spinner.message(
            `waiting for GitHub funding metadata in ${tildify(path)} ${formatAttempt(context.attemptNumber, config.retries + 1, context.retryDelay)}`,
          )
        },
      })

      if (enabled) {
        enabledCount++
        continue
      }

      failures.push({
        path,
        stage: 'project',
        error: new Error('GitHub repository could not be resolved.'),
      })
    }
    catch (error) {
      failures.push({
        path,
        stage: 'project',
        error: toError(error),
      })
    }
  }

  spinner.stop(`enabled GitHub sponsorships for ${c.yellow(enabledCount)} of ${c.yellow(projectTargets.length)} repositories`)

  return {
    enabledCount,
    failures,
    skippedCount: results.length - projectTargets.length,
  }
}

function canEnableProjectSponsorship(result: RepositoryUpdateResult) {
  return result.changedFiles.length === 0 || (result.committed && result.pushed)
}

function formatAttempt(attemptNumber: number, totalAttempts: number, retryDelay: number) {
  return `(attempt ${c.yellow(attemptNumber)}/${c.yellow(totalAttempts)}, retry in ${c.yellow(retryDelay)}ms)`
}

function formatFailure(failure: RepositoryFailure) {
  return `${tildify(failure.path)} [${failure.stage}]: ${failure.error.message}`
}

function formatProgress(current: number, total: number) {
  return `(${c.yellow(current)}/${c.yellow(total)})`
}

function renderSummary(selectedCount: number, updatedCount: number, enabledCount: number, failedCount: number) {
  p.note([
    `selected: ${c.yellow(selectedCount)}`,
    `updated: ${c.yellow(updatedCount)}`,
    `enabled: ${c.yellow(enabledCount)}`,
    `failed: ${c.yellow(failedCount)}`,
  ].join('\n'), 'summary')
}

function reportFailures(failures: RepositoryFailure[]) {
  for (const failure of failures)
    p.log.error(formatFailure(failure))
}

function reportSkippedProjectTargets(project: boolean | undefined, skippedCount: number) {
  if (!project || skippedCount === 0)
    return

  p.log.warn(
    `skipped GitHub sponsorships for ${c.yellow(skippedCount)} repositories until funding changes are committed and pushed`,
  )
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(`${error}`)
}

try {
  cli.parse()
}
catch (error) {
  console.error(error)
  process.exit(1)
}
