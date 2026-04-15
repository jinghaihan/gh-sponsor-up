import type { CommandOptions, ConfigOptions, Options } from './types'
import process from 'node:process'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_OPTIONS } from './constants'

function normalizeConfig(options: Partial<CommandOptions>) {
  // interop
  if ('default' in options)
    options = options.default as Partial<CommandOptions>

  return options
}

export async function readConfig(options: Partial<CommandOptions>) {
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

export async function resolveConfig(options: Partial<CommandOptions>): Promise<Options> {
  const defaults = structuredClone(DEFAULT_OPTIONS)
  options = normalizeConfig(options)

  const configOptions = await readConfig(options)
  const merged = { ...defaults, ...configOptions, ...options }

  if (merged.funding)
    merged.funding = Array.isArray(merged.funding) ? merged.funding : [merged.funding]
  else
    merged.funding = []

  return merged as Options
}
