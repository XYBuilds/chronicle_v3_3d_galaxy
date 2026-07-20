import { describe, expect, it } from 'vitest'

import { formatContactSheetCommand, quoteCommandArgument } from './contactSheetCommand.js'

describe('contact-sheet command', () => {
  it('quotes every argument for PowerShell paths containing whitespace and quotes', () => {
    expect(formatContactSheetCommand({
      input: 'fixtures/ratings "final".json',
      outputDirectory: 'results/contact sheet',
      workingDirectory: '../work dir',
    }, 'powershell')).toBe('npm run contact-sheet -- --input "fixtures/ratings `"final`".json" --output-dir "results/contact sheet" --working-dir "../work dir"')
  })

  it('quotes every argument for POSIX paths containing whitespace and quotes', () => {
    expect(formatContactSheetCommand({
      input: 'fixtures/ratings "final".json',
      outputDirectory: 'results/contact sheet',
      workingDirectory: '../work dir',
    }, 'posix')).toBe('npm run contact-sheet -- --input "fixtures/ratings \\"final\\".json" --output-dir "results/contact sheet" --working-dir "../work dir"')
    expect(quoteCommandArgument('$(unsafe) `value`', 'posix')).toBe('"\\$(unsafe) \\`value\\`"')
  })
})