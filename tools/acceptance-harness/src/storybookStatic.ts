import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ACCEPTANCE_REPO_ROOT = path.resolve(__dirname, '../../..')
export const STORYBOOK_STATIC_DIR = path.join(ACCEPTANCE_REPO_ROOT, 'frontend/storybook-static')
export const STORYBOOK_ORIGIN = 'http://127.0.0.1:6006'

export const HUD_CAPTURE_STORY_IDS = [
  'boot-loading--default',
  'boot-loadfailure--network-failure',
  'chrome-searchbar--idle',
  'chrome-searchbar--movie-suggestions',
  'chrome-toptools--default',
  'chrome-toptools--info-dialog',
  'chrome-toptools--language-menu',
  'chrome-toptools--rtl',
  'chrome-focusexit--visible',
  'chrome-attribution--footer',
  'hover-movietooltip--default',
  'hover-hoverring--default',
  'drawer--default',
  'drawer--missing-details',
  'timeline--default',
  'timeline--horizontal',
] as const

export const VISUAL_GATE_CAPTURE_STORY_IDS = [
  'visual-gate--idle-particles',
  'visual-gate--focused-planet',
  'visual-gate--focused-bloom-debug',
] as const

type StorybookIndex = {
  entries?: Record<string, { id?: string; type?: string; title?: string }>
}

export async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`server did not become ready: ${url}`)
}

export async function ensureStorybookStatic(): Promise<void> {
  try {
    await fs.access(STORYBOOK_STATIC_DIR)
  } catch {
    const build = spawn('npm', ['run', 'build-storybook'], {
      cwd: ACCEPTANCE_REPO_ROOT,
      shell: true,
      stdio: 'inherit',
    })
    await new Promise<void>((resolve, reject) => {
      build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build-storybook exited ${code}`))))
    })
  }
}

export async function readStorybookStoryIds(): Promise<string[]> {
  const raw = await fs.readFile(path.join(STORYBOOK_STATIC_DIR, 'index.json'), 'utf8')
  const index = JSON.parse(raw) as StorybookIndex
  return Object.values(index.entries ?? {})
    .filter((entry) => entry.type === 'story' && typeof entry.id === 'string')
    .map((entry) => entry.id as string)
}

export function storyIframeUrl(storyId: string): string {
  return `${STORYBOOK_ORIGIN}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`
}

export async function waitForStoryReady(page: { locator: (selector: string) => { waitFor: (opts: { state: 'visible'; timeout: number }) => Promise<void> } }): Promise<void> {
  await page.locator('body.sb-show-main #storybook-root').waitFor({ state: 'visible', timeout: 30_000 })
}

export async function serveStorybookStatic(): Promise<ChildProcess> {
  const child = spawn(
    'python',
    ['-m', 'http.server', '6006', '--bind', '127.0.0.1', '--directory', STORYBOOK_STATIC_DIR],
    {
      cwd: ACCEPTANCE_REPO_ROOT,
      stdio: 'ignore',
    },
  )
  await waitForServer(STORYBOOK_ORIGIN, 120_000)
  return child
}

export function stopChild(child: ChildProcess | undefined): void {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(child.pid)
  } catch {
    // ignore
  }
}
