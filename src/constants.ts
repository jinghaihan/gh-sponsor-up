import type { Options } from './types'
import pkg from '../package.json'

export const NAME = pkg.name

export const VERSION = pkg.version

export const GITHUB_API_URL = 'https://api.github.com'

export const PACKAGE_JSON_PATH = 'package.json'

export const FUNDING_CONFIG_PATH = '.github/FUNDING.yml'

export const DEFAULT_OPTIONS: Partial<Options> = {
  commit: true,
  push: true,
  message: 'chore: update funding metadata',
  project: true,
}
