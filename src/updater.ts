import type { FundingConfig, Options, RepositoryUpdateResult } from './types'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import detectIndent from 'detect-indent'
import { dirname, join } from 'pathe'
import { x } from 'tinyexec'
import { DEFAULT_OPTIONS, FUNDING_CONFIG_PATH, PACKAGE_JSON_PATH } from './constants'
import { commitChanges, pushChanges } from './git'

export async function updateCodespace(path: string, options: Options) {
  const changedFiles: string[] = []

  const packageJSONPath = await updatePackageJSON(path, options)
  if (packageJSONPath)
    changedFiles.push(packageJSONPath)

  const fundingConfigPath = await updateFunding(path, options)
  if (fundingConfigPath)
    changedFiles.push(fundingConfigPath)

  let committed = false
  if (options.postRun)
    await x(options.postRun, [], { throwOnError: true, nodeOptions: { cwd: path, shell: true } })

  if (options.commit && changedFiles.length)
    committed = await commitChanges(path, options.message || DEFAULT_OPTIONS.message!, changedFiles)

  let pushed = false
  if (committed && options.push && changedFiles.length)
    pushed = await pushChanges(path)

  const result: RepositoryUpdateResult = {
    path,
    changedFiles,
    committed,
    pushed,
  }

  return result
}

async function updatePackageJSON(path: string, options: Options) {
  if (!options.funding.length)
    return

  const filepath = join(path, PACKAGE_JSON_PATH)
  if (!existsSync(filepath))
    throw new Error(`package.json not found in ${path}`)

  const content = await readFile(filepath, 'utf-8')
  const indent = detectIndent(content).indent || '  '
  const data = JSON.parse(content)
  if (data.funding)
    return

  const write = async () => {
    await writeFile(filepath, `${JSON.stringify(data, null, indent)}\n`, 'utf-8')
  }

  if (options.funding.length === 1) {
    data.funding = `https://github.com/sponsors/${options.funding[0]}`
    await write()
    return PACKAGE_JSON_PATH
  }

  const fundings: FundingConfig[] = options.funding.map((person) => {
    return {
      type: 'individual',
      url: `https://github.com/sponsors/${person}`,
    }
  })
  data.funding = fundings
  await write()

  return PACKAGE_JSON_PATH
}

async function updateFunding(path: string, options: Options) {
  if (!options.funding.length)
    return

  const filepath = join(path, FUNDING_CONFIG_PATH)
  if (existsSync(filepath))
    return

  await mkdir(dirname(filepath), { recursive: true })

  const content = options.funding.length === 1
    ? `github: ${options.funding[0]}\n`
    : `github: [${options.funding.join(', ')}]\n`

  await writeFile(filepath, content, 'utf-8')
  return FUNDING_CONFIG_PATH
}
