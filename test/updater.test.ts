import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
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
  await Promise.all(tempDirs.splice(0).map(async dir => rm(dir, { recursive: true, force: true })))
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

    await updateCodespace(cwd, {
      funding: [],
      commit: false,
      push: false,
      project: false,
      postRun: `node -e "require('node:fs').writeFileSync('post-run.txt', process.cwd())"`,
      retries: 5,
      retryInterval: 120000,
    })

    expect(await readFile(join(cwd, 'post-run.txt'), 'utf-8')).toBe(cwd)
  })
})
