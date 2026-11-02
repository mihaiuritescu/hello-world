// Claude Code's PreToolUse hook for shell commands. It blocks the git commands that can destroy
// work or published history, or reach past the other permission rules, wherever their flags sit.
// Permission rules only match the start of a command: a deny on "git push --force" can't see
// "git push origin main --force". Exit code 2 blocks the call and gives Claude the reason; a
// person can still run any of these by hand.
//
// It reads commands as plain words, so it's a safety net rather than a sandbox: a command hidden
// in a double-quoted substitution gets through. GitHub's protection of main is the real guard.
//
// Usage (Claude Code runs it): node scripts/git-guard.ts < hook-input.json
import { readFileSync } from 'node:fs'

const SEPARATORS = new Set([';', '&', '|', '(', ')', '`'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'pwsh', 'powershell'])
/** Words that run the command after them, as in `env git push`. */
const WRAPPERS = new Set(['env', 'command', 'exec', 'nohup', 'sudo', 'time'])
/** Git options, before the subcommand, that take the next word as their value. */
const VALUED_OPTIONS = new Set(['-C', '--git-dir', '--work-tree', '--namespace'])

/** Why `commandLine` must not run, or null when it may. */
export function blockedReason(commandLine: string): string | null {
  for (const words of simpleCommands(commandLine)) {
    const reason = problemWith(words)
    if (reason) return reason
  }
  return null
}

function problemWith(words: string[]): string | null {
  let index = 0
  // Variable assignments and wrappers come before the program itself.
  while (/^[A-Za-z_]\w*=/.test(words[index] ?? '') || WRAPPERS.has(words[index] ?? '')) index += 1
  const program = programName(words[index] ?? '')
  const args = words.slice(index + 1)
  if (SHELLS.has(program)) {
    // In `bash -c "..."` and `pwsh -Command "..."`, the string is a command line of its own.
    const flag = args.findIndex((arg) => /^-(c|command)$/i.test(arg))
    return flag === -1 ? null : blockedReason(args[flag + 1] ?? '')
  }
  return program === 'git' ? gitProblem(args) : null
}

/** "git", from `git`, `git.exe` or a full path to either. */
function programName(word: string): string {
  return (word.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '').toLowerCase()
}

function gitProblem(args: string[]): string | null {
  let index = 0
  for (; (args[index] ?? '').startsWith('-'); index += 1) {
    const option = args[index] ?? ''
    if (option.startsWith('-c') || option.startsWith('--config-env')) {
      return `git ${option} can define an alias that runs any command`
    }
    if (VALUED_OPTIONS.has(option)) index += 1
  }
  const rest = args.slice(index + 1)
  if (rest.includes('--no-index')) {
    return '--no-index reads files outside the repository, such as .env'
  }
  switch (args[index]) {
    case 'push':
      return pushProblem(rest)
    case 'reset':
      return rest.includes('--hard') ? 'git reset --hard throws away uncommitted work' : null
    case 'clean':
      return isDryRun(rest) ? null : 'git clean deletes untracked files, .env among them'
    case 'config':
      return readsOnly(rest) ? null : 'git config can set an alias or a hook that runs any command'
    default:
      return null
  }
}

function pushProblem(args: string[]): string | null {
  for (const arg of args) {
    if (/^--(force|force-with-lease|force-if-includes|mirror|delete|prune)(=|$)/.test(arg)) {
      return `git push ${arg} can rewrite or delete published history`
    }
    // Short flags, alone or together: -f forces, -d deletes.
    if (/^-[a-zA-Z]*[fd]/.test(arg)) return `git push ${arg} can force or delete a branch`
    if (/^[+:]/.test(arg)) return `the refspec ${arg} forces or deletes a branch`
  }
  return null
}

function isDryRun(args: string[]): boolean {
  return args.some((arg) => arg === '--dry-run' || /^-[a-zA-Z]*n/.test(arg))
}

function readsOnly(args: string[]): boolean {
  const reading = ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l']
  return args[0] === 'get' || args[0] === 'list' || args.some((arg) => reading.includes(arg))
}

/** The simple commands in a shell command line, each as its words, without their quotes. */
function simpleCommands(commandLine: string): string[][] {
  const commands: string[][] = []
  let words: string[] = []
  let lineWords: string[] = []
  let word = ''
  let inWord = false
  let quote: string | null = null
  let hereDocumentEnd: string | null = null

  const endWord = () => {
    if (inWord) {
      words.push(word)
      lineWords.push(word)
    }
    word = ''
    inWord = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) commands.push(words)
    words = []
  }

  for (const line of commandLine.split(/\r?\n/)) {
    if (hereDocumentEnd !== null) {
      // A here-document's body is text for its command, such as a commit message.
      if (line.trim() === hereDocumentEnd) hereDocumentEnd = null
      continue
    }
    for (const char of line) {
      if (quote) {
        if (char === quote) quote = null
        else word += char
      } else if (char === "'" || char === '"') {
        quote = char
        inWord = true
      } else if (/\s/.test(char)) {
        endWord()
      } else if (SEPARATORS.has(char)) {
        endCommand()
      } else {
        word += char
        inWord = true
      }
    }
    if (quote) {
      // The quoted text goes on to the next line.
      word += '\n'
      continue
    }
    endCommand()
    hereDocumentEnd = hereDocumentEndOf(lineWords)
    lineWords = []
  }
  endCommand()
  return commands
}

/** The word that ends a here-document started on this line, as in `<< 'EOF'`, if any. */
function hereDocumentEndOf(lineWords: string[]): string | null {
  const start = lineWords.findIndex((word) => word.startsWith('<<') && !word.startsWith('<<<'))
  if (start === -1) return null
  const attached = (lineWords[start] ?? '').slice(2).replace(/^-/, '')
  return attached || (lineWords[start + 1] ?? null)
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, 'utf8')) as { tool_input?: { command?: unknown } }
  const command = input.tool_input?.command
  const reason = typeof command === 'string' ? blockedReason(command) : null
  if (reason) {
    console.error(`Blocked by scripts/git-guard.ts: ${reason}. A person can run it by hand.`)
    process.exit(2)
  }
}
