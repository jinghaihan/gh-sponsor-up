import type { Options } from './types'
import pkg from '../package.json'

export const NAME = pkg.name

export const VERSION = pkg.version

export const DEFAULT_OPTIONS: Partial<Options> = {
  commit: false,
  message: 'chore: update funding metadata',
  project: true,
}
