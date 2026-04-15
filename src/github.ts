import type { PackageJSON } from './types'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { $fetch } from 'ofetch'
import { join } from 'pathe'
import { GITHUB_API_URL, NAME, PACKAGE_JSON_PATH } from './constants'
import { getRemoteUrl } from './git'

export function parseGitHubRepositoryUrl(value?: string) {
  const input = normalizeRepositoryUrl(value)
  if (!input)
    return

  const match
    = input.match(/^git@github\.com:(?<owner>[^/\s]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/)
      || input.match(/^ssh:\/\/git@github\.com\/(?<owner>[^/\s]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/)
      || input.match(/^https:\/\/github\.com\/(?<owner>[^/\s]+)\/(?<repo>[^/\s]+?)(?:\.git)?\/?$/)

  if (!match?.groups)
    return

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
  }
}

export async function resolveGitHubRepository(cwd: string) {
  const remote = await getRemoteUrl(cwd)
  const fromRemote = parseGitHubRepositoryUrl(remote)
  if (fromRemote)
    return fromRemote

  return parseGitHubRepositoryUrl(await readPackageRepositoryUrl(cwd))
}

export async function enableProjectSponsorship(cwd: string, token?: string) {
  const repository = await resolveGitHubRepository(cwd)
  if (!repository)
    return false

  await $fetch(`${GITHUB_API_URL}/repos/${repository.owner}/${repository.repo}`, {
    method: 'PATCH',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${getGitHubToken(token)}`,
      'User-Agent': NAME,
    },
    body: {
      has_sponsorships_enabled: true,
    },
  })

  return true
}

function normalizeRepositoryUrl(value?: string) {
  if (!value)
    return

  return value.replace(/^git\+/, '').trim()
}

async function readPackageRepositoryUrl(cwd: string) {
  const filepath = join(cwd, PACKAGE_JSON_PATH)
  if (!existsSync(filepath))
    return

  const data = JSON.parse(await readFile(filepath, 'utf-8')) as PackageJSON
  if (typeof data.repository === 'string')
    return data.repository

  return data.repository?.url || data.homepage || undefined
}

function getGitHubToken(input?: string) {
  const token = input || process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (!token)
    throw new Error('missing GitHub token. set GH_TOKEN or GITHUB_TOKEN to enable project sponsorships.')

  return token
}
