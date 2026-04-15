export interface CommandOptions {
  cwd?: string
  funding?: string | string[]
  token?: string
  commit?: boolean
  push?: boolean
  message?: string
  project?: boolean
}

export interface ConfigOptions extends CommandOptions {}

export interface Options extends CommandOptions, ConfigOptions {
  funding: string[]
}

export interface FundingConfig {
  type: 'individual' | 'organization'
  url: string
}

export interface GitHubRepository {
  owner: string
  repo: string
}

export interface GitCommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface GitCommandOptions {
  allowFailure?: boolean
}

export interface PackageJSON {
  homepage?: string
  repository?: string | {
    url?: string
  }
}
