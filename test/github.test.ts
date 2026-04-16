import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { enableProjectSponsorship, parseGitHubRepositoryUrl } from '../src/github'

const mockFetch = vi.hoisted(() => vi.fn())

vi.mock('ofetch', () => ({
  $fetch: mockFetch,
}))

const tempDirs: string[] = []
const testRoot = join(process.cwd(), 'test/.tmp')

function git(args: string[], cwd?: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
  }).trim()
}

async function createRepository() {
  await mkdir(testRoot, { recursive: true })
  const cwd = await mkdtemp(join(testRoot, 'gh-sponsor-up-'))
  tempDirs.push(cwd)

  git(['init', '-q'], cwd)
  git(['checkout', '-qb', 'main'], cwd)
  git(['config', 'user.email', 'test@example.com'], cwd)
  git(['config', 'user.name', 'Test User'], cwd)

  await writeFile(join(cwd, 'package.json'), `${JSON.stringify({ name: 'repo' }, null, 2)}\n`, 'utf-8')
  git(['add', 'package.json'], cwd)
  git(['commit', '-qm', 'init'], cwd)

  return cwd
}

afterEach(async () => {
  delete process.env.GH_TOKEN
  delete process.env.GITHUB_TOKEN
  mockFetch.mockReset()
  await Promise.all(tempDirs.splice(0).map(async dir => rm(dir, { recursive: true, force: true })))
})

describe('github helpers', () => {
  it('parses GitHub repository urls', () => {
    expect(parseGitHubRepositoryUrl('git@github.com:jinghaihan/pncat.git')).toEqual({
      owner: 'jinghaihan',
      repo: 'pncat',
    })
    expect(parseGitHubRepositoryUrl('ssh://git@github.com/jinghaihan/pncat.git')).toEqual({
      owner: 'jinghaihan',
      repo: 'pncat',
    })
    expect(parseGitHubRepositoryUrl('https://github.com/jinghaihan/pncat.git')).toEqual({
      owner: 'jinghaihan',
      repo: 'pncat',
    })
    expect(parseGitHubRepositoryUrl('https://gitlab.com/jinghaihan/pncat.git')).toBeUndefined()
  })

  it('enables sponsorships for the resolved GitHub repository', async () => {
    const cwd = await createRepository()
    git(['remote', 'add', 'origin', 'git@github.com:jinghaihan/pncat.git'], cwd)
    mockFetch
      .mockResolvedValueOnce({
        data: {
          repository: {
            hasSponsorshipsEnabled: false,
            fundingLinks: [
              {
                platform: 'GITHUB',
                url: 'https://github.com/jinghaihan',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          repository: {
            id: 'repo-id',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          updateRepository: {
            repository: {
              hasSponsorshipsEnabled: true,
              fundingLinks: [
                {
                  platform: 'GITHUB',
                  url: 'https://github.com/jinghaihan',
                },
              ],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          repository: {
            hasSponsorshipsEnabled: true,
            fundingLinks: [
              {
                platform: 'GITHUB',
                url: 'https://github.com/jinghaihan',
              },
            ],
          },
        },
      })

    const enabled = await enableProjectSponsorship(cwd, 'test-token')

    expect(enabled).toBe(true)
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer test-token',
        }),
      }),
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/graphql',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://api.github.com/graphql',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'https://api.github.com/graphql',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('throws when remote funding metadata is not available on GitHub', async () => {
    const cwd = await createRepository()
    git(['remote', 'add', 'origin', 'git@github.com:jinghaihan/pncat.git'], cwd)
    mockFetch.mockResolvedValueOnce({
      data: {
        repository: {
          hasSponsorshipsEnabled: false,
          fundingLinks: [],
        },
      },
    })

    await expect(enableProjectSponsorship(cwd, 'test-token')).rejects.toThrow(
      'remote funding metadata is not available on GitHub for jinghaihan/pncat. push your funding changes before enabling project sponsorships.',
    )
  })
})
