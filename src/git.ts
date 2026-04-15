import type { ExecFileException } from 'node:child_process'
import type { GitCommandOptions, GitCommandResult } from './types'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function getRemoteUrl(cwd: string, remote = 'origin') {
  const result = await runGit(['config', '--get', `remote.${remote}.url`], cwd, { allowFailure: true })
  return result.code === 0 ? result.stdout.trim() || undefined : undefined
}

export async function commitChanges(cwd: string, message: string, files: string[]) {
  const pathspecs = [...new Set(files)]
  if (!pathspecs.length)
    return false

  await runGit(['add', '--', ...pathspecs], cwd)

  if (!await hasStagedChanges(cwd, pathspecs))
    return false

  await runGit(['commit', '-m', message, '--only', '--', ...pathspecs], cwd)
  return true
}

async function hasStagedChanges(cwd: string, files: string[]) {
  const result = await runGit(['diff', '--cached', '--name-only', '--', ...files], cwd)
  return Boolean(result.stdout.trim())
}

export async function pushChanges(cwd: string) {
  const upstream = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd, { allowFailure: true })
  if (upstream.code === 0) {
    await runGit(['push'], cwd)
  }
  else {
    const branch = await getCurrentBranch(cwd)
    const remote = await getBranchRemote(cwd, branch) || 'origin'
    await runGit(['push', '--set-upstream', remote, branch], cwd)
  }

  return true
}

async function getCurrentBranch(cwd: string) {
  const result = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return result.stdout.trim()
}

async function getBranchRemote(cwd: string, branch: string) {
  const result = await runGit(['config', '--get', `branch.${branch}.remote`], cwd, { allowFailure: true })
  return result.code === 0 ? result.stdout.trim() || undefined : undefined
}

async function runGit(args: string[], cwd: string, options: GitCommandOptions = {}): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd })
    return {
      code: 0,
      stdout: `${stdout}`,
      stderr: `${stderr}`,
    }
  }
  catch (error) {
    const gitError = error as ExecFileException & { stdout?: string, stderr?: string, code?: number }
    const result = {
      code: typeof gitError.code === 'number' ? gitError.code : 1,
      stdout: `${gitError.stdout ?? ''}`,
      stderr: `${gitError.stderr ?? ''}`,
    }

    if (options.allowFailure)
      return result

    throw formatGitError(cwd, args, result.stderr)
  }
}

function formatGitError(cwd: string, args: string[], stderr: string) {
  const lines = [
    `Git command failed in ${cwd}`,
    `Command: ${toCommandString(args)}`,
  ]

  if (stderr.trim())
    lines.push(stderr.trim())

  return new Error(lines.join('\n'))
}

function toCommandString(args: string[]) {
  return ['git', ...args].join(' ')
}
