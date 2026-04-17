import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'

afterEach(() => {
  delete process.env.GH_TOKEN
  delete process.env.GITHUB_TOKEN
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
})
