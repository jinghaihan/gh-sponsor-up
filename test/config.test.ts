import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'

const tempDirs: string[] = []

afterEach(() => {
  delete process.env.GH_TOKEN
  delete process.env.GITHUB_TOKEN
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async dir => rm(dir, { recursive: true, force: true })))
})

describe('config', () => {
  it('falls back to GH_TOKEN when token is not provided', async () => {
    process.env.GH_TOKEN = 'gh-token'

    const config = await resolveConfig()

    expect(config.token).toBe('gh-token')
  })

  it('falls back to GITHUB_TOKEN when GH_TOKEN is not set', async () => {
    process.env.GITHUB_TOKEN = 'github-token'

    const config = await resolveConfig()

    expect(config.token).toBe('github-token')
  })

  it('prefers an explicit token over environment variables', async () => {
    process.env.GH_TOKEN = 'gh-token'
    process.env.GITHUB_TOKEN = 'github-token'

    const config = await resolveConfig({ token: 'config-token' })

    expect(config.token).toBe('config-token')
  })

  it('resolves fundingTemplate to an absolute path', async () => {
    const cwd = await mkdtemp(join(process.cwd(), 'test/.tmp/config-'))
    tempDirs.push(cwd)
    await writeFile(join(cwd, 'funding-template.yml'), 'github: jinghaihan\n', 'utf-8')

    const previousCwd = process.cwd()
    process.chdir(cwd)

    try {
      const config = await resolveConfig({ fundingTemplate: './funding-template.yml' })

      expect(config.fundingTemplate).toBe(join(cwd, 'funding-template.yml'))
    }
    finally {
      process.chdir(previousCwd)
    }
  })
})
