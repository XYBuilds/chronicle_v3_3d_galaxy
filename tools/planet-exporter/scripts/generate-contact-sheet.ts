import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { generateContactSheet, validateContactSheetInput, type ContactSheetInput } from '../src/contactSheet.js'
import { formatContactSheetCommand, type CommandShell } from '../src/contactSheetCommand.js'

const execFileAsync = promisify(execFile)
const usage = 'usage: npm run contact-sheet -- --input FILE.json --output-dir DIRECTORY [--working-dir DIRECTORY]'

type CommandArgs = {
  input: string
  outputDirectory: string
  workingDirectory: string
}

function parseArgs(argv: readonly string[]): CommandArgs {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--') || !['input', 'output-dir', 'working-dir'].includes(flag.slice(2)) || values.has(flag)) {
      throw new Error(usage)
    }
    values.set(flag, value)
    index += 1
  }
  const input = values.get('--input')
  const outputDirectory = values.get('--output-dir')
  if (!input || !outputDirectory) throw new Error(usage)
  const workingDirectory = values.get('--working-dir') ?? process.cwd()
  return {
    input: path.resolve(workingDirectory, input),
    outputDirectory: path.resolve(workingDirectory, outputDirectory),
    workingDirectory: path.resolve(workingDirectory),
  }
}

async function gitCommit(workingDirectory: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workingDirectory })
    const commit = stdout.trim()
    if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('unexpected git commit')
    return commit
  } catch (error) {
    throw new Error(`contact-sheet: unable to resolve git commit: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function commandPath(root: string, target: string): string {
  return path.relative(root, target).replaceAll('\\', '/') || '.'
}

function commandShell(): CommandShell {
  return process.platform === 'win32' ? 'powershell' : 'posix'
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv)
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(args.input, 'utf8')) as unknown
  } catch (error) {
    throw new Error(`contact-sheet: unable to read input manifest: ${error instanceof Error ? error.message : String(error)}`)
  }
  validateContactSheetInput(parsed as ContactSheetInput)
  const command = formatContactSheetCommand({
    input: commandPath(args.workingDirectory, args.input),
    outputDirectory: commandPath(args.workingDirectory, args.outputDirectory),
    workingDirectory: commandPath(process.cwd(), args.workingDirectory),
  }, commandShell())
  const result = await generateContactSheet(parsed as ContactSheetInput, {
    inputRoot: path.dirname(args.input),
    outputDirectory: args.outputDirectory,
    workingDirectory: args.workingDirectory,
    gitCommit: await gitCommit(args.workingDirectory),
    command,
  })
  console.log(JSON.stringify({ png: path.relative(args.workingDirectory, result.pngPath).replaceAll('\\', '/'), manifest: path.relative(args.workingDirectory, result.manifestPath).replaceAll('\\', '/'), png_sha256: result.manifest.output.png_sha256 }))
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})