export interface CommandOptions {
  cwd?: string
  funding?: string | string[]
  token?: string
  commit?: boolean
  push?: boolean
  message?: string
  project?: boolean
  postRun?: string
  retries?: number | string
  retryInterval?: number | string
}

export interface ConfigOptions extends CommandOptions {}

export interface Options extends Omit<CommandOptions, 'funding' | 'retries'> {
  funding: string[]
  retries: number
  retryInterval: number
}

export interface RepositoryUpdateResult {
  path: string
  changedFiles: string[]
  committed: boolean
  pushed: boolean
}

export interface RepositoryFailure {
  path: string
  stage: 'update' | 'project'
  error: Error
}

export interface UpdatePhaseResult {
  results: RepositoryUpdateResult[]
  failures: RepositoryFailure[]
}

export interface ProjectPhaseResult {
  enabledCount: number
  failures: RepositoryFailure[]
  skippedCount: number
}

export interface FundingConfig {
  type: 'individual' | 'organization'
  url: string
}

export interface GitHubRepository {
  owner: string
  repo: string
}

export interface GitHubFundingLink {
  platform: string
  url: string
}

export interface GitHubRepositorySponsorshipState {
  hasSponsorshipsEnabled: boolean
  fundingLinks: GitHubFundingLink[]
}

export interface GitHubGraphQLResponse<T> {
  data: T
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
