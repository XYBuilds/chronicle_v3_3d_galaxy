import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { preparePagesDeployAssets, prepareSiteReleaseShellAssets } from './prepare-pages-deploy.mjs'

function makeDataDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-deploy-assets-'))
  fs.writeFileSync(
    path.join(directory, 'galaxy_assets_manifest.json'),
    JSON.stringify({
      galaxy_data_gzip_url: 'https://example.invalid/galaxy/galaxy_data.json.gz?v=test',
      galaxy_search_index_gzip_url: 'https://example.invalid/galaxy/galaxy_search_index.json.gz?v=test',
      data_version: 'test',
    }),
  )
  return directory
}

test('removes only R2-backed data copies after validating the manifest', (t) => {
  const directory = makeDataDirectory()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  for (const filename of ['galaxy_data.json', 'galaxy_data.json.gz', 'galaxy_search_index.json', 'galaxy_search_index.json.gz']) {
    fs.writeFileSync(path.join(directory, filename), filename)
  }
  fs.writeFileSync(path.join(directory, 'focus-emission-profile.json'), '{}')

  const result = preparePagesDeployAssets(directory)

  assert.deepEqual(result.removed.map(({ filename }) => filename), [
    'galaxy_data.json',
    'galaxy_data.json.gz',
    'galaxy_search_index.json',
    'galaxy_search_index.json.gz',
  ])
  assert.equal(fs.existsSync(path.join(directory, 'galaxy_assets_manifest.json')), true)
  assert.equal(fs.existsSync(path.join(directory, 'focus-emission-profile.json')), true)
  assert.equal(fs.existsSync(path.join(directory, 'galaxy_data.json.gz')), false)
})

test('fails closed when the R2 manifest is incomplete', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-deploy-assets-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(
    path.join(directory, 'galaxy_assets_manifest.json'),
    JSON.stringify({ galaxy_data_gzip_url: 'https://example.invalid/galaxy/galaxy_data.json.gz' }),
  )
  fs.writeFileSync(path.join(directory, 'galaxy_data.json.gz'), 'payload')

  assert.throws(
    () => preparePagesDeployAssets(directory),
    /galaxy_search_index_gzip_url is required/,
  )
  assert.equal(fs.existsSync(path.join(directory, 'galaxy_data.json.gz')), true)
})

test('site-release shell strips the production manifest without requiring R2 URLs', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-shell-assets-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'galaxy_assets_manifest.json'), '{"data_version":"stale"}')
  fs.writeFileSync(path.join(directory, 'galaxy_data.json.gz'), 'payload')

  const result = prepareSiteReleaseShellAssets(directory)

  assert.equal(result.manifestRemoved, true)
  assert.equal(fs.existsSync(path.join(directory, 'galaxy_assets_manifest.json')), false)
  assert.equal(fs.existsSync(path.join(directory, 'galaxy_data.json.gz')), false)
})