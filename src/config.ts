import type { CommandOptions, ConfigOptions, Options } from './types'
import { access } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_OPTIONS } from './constants'

export async function readConfig(options: Partial<CommandOptions> = {}) {
  const loader = createConfigLoader<ConfigOptions>({
    sources: [
      {
        files: ['gh-sponsor-up.config'],
        extensions: ['ts'],
      },
    ],
    cwd: options.cwd || process.cwd(),
    merge: false,
  })
  const config = await loader.load()
  return config.sources.length ? normalizeConfig(config.config) : {}
}

export async function resolveConfig(options: Partial<CommandOptions> = {}): Promise<Options> {
  const defaults = structuredClone(DEFAULT_OPTIONS)
  options = normalizeConfig(options)

  const configOptions = await readConfig(options)
  const merged = { ...defaults, ...configOptions, ...options }
  merged.token ||= process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  merged.fundingTemplate = normalizeFundingTemplate(merged.fundingTemplate)

  if (merged.funding)
    merged.funding = Array.isArray(merged.funding) ? merged.funding : [merged.funding]
  else
    merged.funding = []

  merged.retries = normalizeRetries(merged.retries)
  merged.retryInterval = normalizeRetryInterval(merged.retryInterval)

  if (merged.fundingTemplate)
    await ensureFileExists(merged.fundingTemplate)

  return merged as Options
}

function normalizeConfig(options?: Partial<CommandOptions>) {
  if (!options)
    return {}

  // interop
  if ('default' in options)
    options = options.default as Partial<CommandOptions>

  return options
}

function normalizeRetries(value?: number | string) {
  const retries = Number(value ?? DEFAULT_OPTIONS.retries ?? 0)
  if (!Number.isInteger(retries) || retries < 0)
    throw new Error('retries must be a non-negative integer.')

  return retries
}

function normalizeRetryInterval(value?: number | string) {
  const retryInterval = Number(value ?? DEFAULT_OPTIONS.retryInterval ?? 0)
  if (!Number.isInteger(retryInterval) || retryInterval < 0)
    throw new Error('retryInterval must be a non-negative integer.')

  return retryInterval
}

function normalizeFundingTemplate(value?: string) {
  if (!value)
    return

  return resolve(process.cwd(), value)
}

async function ensureFileExists(path: string) {
  try {
    await access(path)
  }
  catch {
    throw new Error(`funding template not found: ${path}`)
  }
}
