import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, normalize } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { updateCodespace } from '../src/updater'

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
  await Promise.all(tempDirs.splice(0).map(async dir => removeDirectory(dir)))
})

describe('updater', () => {
  it('returns repository update details', async () => {
    const cwd = await createRepository()

    const result = await updateCodespace(cwd, {
      funding: ['jinghaihan'],
      commit: false,
      push: false,
      project: true,
      retries: 5,
      retryInterval: 120000,
    })

    expect(result).toEqual({
      path: cwd,
      changedFiles: ['package.json', '.github/FUNDING.yml'],
      committed: false,
      pushed: false,
    })
  })

  it('runs post-run commands inside the target repository', async () => {
    const cwd = await createRepository()
    await writeFile(join(cwd, 'post-run.js'), 'require(\'node:fs\').writeFileSync(\'post-run.txt\', process.cwd())\n', 'utf-8')

    await updateCodespace(cwd, {
      funding: [],
      commit: false,
      push: false,
      project: false,
      postRun: 'node ./post-run.js',
      retries: 5,
      retryInterval: 120000,
    })

    expect(normalize(await readFile(join(cwd, 'post-run.txt'), 'utf-8'))).toBe(normalize(cwd))
  }, 15000)

  it('copies a funding template when provided', async () => {
    const cwd = await createRepository()
    const fundingTemplate = join(cwd, 'funding-template.yml')
    await writeFile(fundingTemplate, 'github: [jinghaihan, octocat]\ncustom: [https://example.com/sponsor]\n', 'utf-8')

    const result = await updateCodespace(cwd, {
      funding: [],
      fundingTemplate,
      commit: false,
      push: false,
      project: true,
      retries: 5,
      retryInterval: 120000,
    })

    expect(result).toEqual({
      path: cwd,
      changedFiles: ['.github/FUNDING.yml'],
      committed: false,
      pushed: false,
    })
    expect(await readFile(join(cwd, '.github/FUNDING.yml'), 'utf-8')).toBe(
      'github: [jinghaihan, octocat]\ncustom: [https://example.com/sponsor]\n',
    )
  })
})

async function removeDirectory(dir: string) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true })
      return
    }
    catch (error) {
      if (!isRetryableWindowsCleanupError(error) || attempt === 5)
        throw error

      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
}

function isRetryableWindowsCleanupError(error: unknown) {
  return error instanceof Error
    && 'code' in error
    && ['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(`${error.code}`)
}
