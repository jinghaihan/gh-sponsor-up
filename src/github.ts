import type { GitHubGraphQLResponse, GitHubRepositorySponsorshipState, PackageJSON } from './types'
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

export function isRetryableProjectSponsorshipError(error: unknown) {
  const message = error instanceof Error ? error.message : `${error}`

  return message.startsWith('remote funding metadata is not available on GitHub for ')
    || message.startsWith('failed to enable project sponsorships for ')
}

export async function enableProjectSponsorship(cwd: string, token?: string) {
  const repository = await resolveGitHubRepository(cwd)
  if (!repository)
    return false

  const sponsorshipState = await getRepositorySponsorshipState(repository, token)
  if (!sponsorshipState.fundingLinks.length) {
    throw new Error(
      `remote funding metadata is not available on GitHub for ${repository.owner}/${repository.repo}. push your funding changes before enabling project sponsorships.`,
    )
  }

  if (sponsorshipState.hasSponsorshipsEnabled)
    return true

  await updateRepositorySponsorshipState(repository, token)

  const updatedSponsorshipState = await getRepositorySponsorshipState(repository, token)
  if (!updatedSponsorshipState.hasSponsorshipsEnabled)
    throw new Error(`failed to enable project sponsorships for ${repository.owner}/${repository.repo}.`)

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

async function getRepositorySponsorshipState(repository: { owner: string, repo: string }, token?: string) {
  const response = await $fetch<GitHubGraphQLResponse<{ repository: GitHubRepositorySponsorshipState }>>(`${GITHUB_API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${getGitHubToken(token)}`,
      'User-Agent': NAME,
    },
    body: {
      query: `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          hasSponsorshipsEnabled
          fundingLinks {
            platform
            url
          }
        }
      }`,
      variables: {
        owner: repository.owner,
        repo: repository.repo,
      },
    },
  })

  return response.data.repository
}

async function updateRepositorySponsorshipState(repository: { owner: string, repo: string }, token?: string) {
  const repositoryResponse = await $fetch<GitHubGraphQLResponse<{ repository: { id: string } }>>(`${GITHUB_API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${getGitHubToken(token)}`,
      'User-Agent': NAME,
    },
    body: {
      query: `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
        }
      }`,
      variables: {
        owner: repository.owner,
        repo: repository.repo,
      },
    },
  })

  await $fetch<GitHubGraphQLResponse<{ updateRepository: { repository: GitHubRepositorySponsorshipState } }>>(`${GITHUB_API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${getGitHubToken(token)}`,
      'User-Agent': NAME,
    },
    body: {
      query: `mutation($id: ID!) {
        updateRepository(input: { repositoryId: $id, hasSponsorshipsEnabled: true }) {
          repository {
            hasSponsorshipsEnabled
            fundingLinks {
              platform
              url
            }
          }
        }
      }`,
      variables: {
        id: repositoryResponse.data.repository.id,
      },
    },
  })
}
