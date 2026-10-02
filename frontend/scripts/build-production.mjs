import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { preparePagesDeployAssets, prepareSiteReleaseShellAssets } from './prepare-pages-deploy.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const publicDirectory = path.resolve(scriptDirectory, '..', 'public')
const frontendDirectory = path.resolve(scriptDirectory, '..')
const workspaceDirectory = path.resolve(frontendDirectory, '..')

function resolveViteEntry() {
  const candidates = [
    path.join(frontendDirectory, 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(workspaceDirectory, 'node_modules', 'vite', 'bin', 'vite.js'),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    throw new Error('vite binary not found in workspace node_modules')
  }
  return found
}

function isCiBuild(environment) {
  return environment.CF_PAGES === '1' || environment.CI === 'true' || environment.GITHUB_ACTIONS === 'true'
}

function runVite(environment) {
  const result = spawnSync(process.execPath, [resolveViteEntry(), 'build'], {
    cwd: path.resolve(scriptDirectory, '..'),
    env: environment,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function buildWithStagedPublicAssets() {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'movie-cosmos-pages-'))
  const stagedPublicDirectory = path.join(stagingRoot, 'public')

  try {
    fs.cpSync(publicDirectory, stagedPublicDirectory, { recursive: true })
    if (process.env.SITE_RELEASE_SHELL === '1') {
      prepareSiteReleaseShellAssets(path.join(stagedPublicDirectory, 'data'))
    } else {
      preparePagesDeployAssets(path.join(stagedPublicDirectory, 'data'))
    }
    runVite({ ...process.env, PAGES_PUBLIC_DIR: stagedPublicDirectory })
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true })
  }
}

if (isCiBuild(process.env)) buildWithStagedPublicAssets()
else runVite(process.env)