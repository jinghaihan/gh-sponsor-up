import type { RepositoryFailure, RepositoryUpdateResult } from './types'
import * as p from '@clack/prompts'
import c from 'ansis'
import tildify from 'tildify'

export function canEnableProjectSponsorship(result: RepositoryUpdateResult) {
  return result.changedFiles.length === 0 || (result.committed && result.pushed)
}

export function formatAttempt(attemptNumber: number, totalAttempts: number, retryDelay: number) {
  return `(attempt ${c.yellow(attemptNumber)}/${c.yellow(totalAttempts)}, retry in ${c.yellow(retryDelay)}ms)`
}

export function formatFailure(failure: RepositoryFailure) {
  return `${tildify(failure.path)} [${failure.stage}]: ${failure.error.message}`
}

export function formatProgress(current: number, total: number) {
  return `(${c.yellow(current)}/${c.yellow(total)})`
}

export function renderSummary(selectedCount: number, updatedCount: number, enabledCount: number, failedCount: number) {
  p.note([
    `selected: ${c.yellow(selectedCount)}`,
    `updated: ${c.yellow(updatedCount)}`,
    `enabled: ${c.yellow(enabledCount)}`,
    `failed: ${c.yellow(failedCount)}`,
  ].join('\n'), 'summary')
}

export function reportFailures(failures: RepositoryFailure[]) {
  for (const failure of failures)
    p.log.error(formatFailure(failure))
}

export function reportSkippedProjectTargets(project: boolean | undefined, skippedCount: number) {
  if (!project || skippedCount === 0)
    return

  p.log.warn(
    `skipped GitHub sponsorships for ${c.yellow(skippedCount)} repositories until funding changes are committed and pushed`,
  )
}

export function toError(error: unknown) {
  return error instanceof Error ? error : new Error(`${error}`)
}
