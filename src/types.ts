export interface CommandOptions {
  cwd?: string
  funding?: string | string[]
  commit?: boolean
  message?: string
  project?: boolean
}

export interface ConfigOptions extends CommandOptions {}

export interface Options extends CommandOptions, ConfigOptions {
  funding: string[]
}
