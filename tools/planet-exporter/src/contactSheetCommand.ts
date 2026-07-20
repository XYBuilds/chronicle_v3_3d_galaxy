export type ContactSheetCommandArguments = {
  input: string
  outputDirectory: string
  workingDirectory: string
}

export type CommandShell = 'posix' | 'powershell'

export function quoteCommandArgument(value: string, shell: CommandShell): string {
  const escaped = shell === 'powershell'
    ? value.replaceAll('`', '``').replaceAll('"', '`"').replaceAll('$', '`$')
    : value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')
  return `"${escaped}"`
}

export function formatContactSheetCommand(args: ContactSheetCommandArguments, shell: CommandShell): string {
  return [
    'npm run contact-sheet --',
    '--input', quoteCommandArgument(args.input, shell),
    '--output-dir', quoteCommandArgument(args.outputDirectory, shell),
    '--working-dir', quoteCommandArgument(args.workingDirectory, shell),
  ].join(' ')
}