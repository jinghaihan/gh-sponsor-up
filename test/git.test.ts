import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { commitChanges, pushChanges } from '../src/git'

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

  return cwd
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async dir => rm(dir, { recursive: true, force: true })))
})

describe('git helpers', () => {
  it('commits only the target paths', async () => {
    const cwd = await createRepository()

    await writeFile(join(cwd, 'package.json'), `${JSON.stringify({ name: 'repo' }, null, 2)}\n`, 'utf-8')
    await writeFile(join(cwd, 'README.md'), '# repo\n', 'utf-8')
    git(['add', 'package.json', 'README.md'], cwd)
    git(['commit', '-qm', 'init'], cwd)

    await writeFile(join(cwd, 'package.json'), `${JSON.stringify({ name: 'repo', funding: 'https://github.com/sponsors/jinghaihan' }, null, 2)}\n`, 'utf-8')
    await writeFile(join(cwd, 'README.md'), '# changed\n', 'utf-8')
    git(['add', 'README.md'], cwd)

    const committed = await commitChanges(cwd, 'chore: update funding metadata', ['package.json'])

    expect(committed).toBe(true)
    expect(git(['show', '--name-only', '--pretty=format:%s', 'HEAD'], cwd).split('\n')).toEqual([
      'chore: update funding metadata',
      'package.json',
    ])
    expect(git(['diff', '--cached', '--name-only'], cwd)).toBe('README.md')
  })

  it('pushes the current branch and sets upstream when missing', async () => {
    const cwd = await createRepository()
    await mkdir(testRoot, { recursive: true })
    const remote = await mkdtemp(join(testRoot, 'gh-sponsor-up-remote-'))
    tempDirs.push(remote)

    git(['init', '--bare', '-q', remote])

    await writeFile(join(cwd, 'package.json'), `${JSON.stringify({ name: 'repo' }, null, 2)}\n`, 'utf-8')
    git(['add', 'package.json'], cwd)
    git(['commit', '-qm', 'init'], cwd)
    git(['remote', 'add', 'origin', remote], cwd)

    const pushed = await pushChanges(cwd)

    expect(pushed).toBe(true)
    expect(git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd)).toBe('origin/main')
    expect(git(['--git-dir', remote, 'rev-parse', '--verify', 'refs/heads/main'])).toMatch(/^[0-9a-f]{40}$/)
  })
})
