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
    mockFetch.mockResolvedValue({})

    const enabled = await enableProjectSponsorship(cwd, 'test-token')

    expect(enabled).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/jinghaihan/pncat',
      expect.objectContaining({
        method: 'PATCH',
        body: {
          has_sponsorships_enabled: true,
        },
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })
})
