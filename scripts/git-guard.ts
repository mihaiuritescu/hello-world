// Claude Code's PreToolUse hook for shell commands. It blocks the git commands that can destroy
// work or published history, or run other commands past the permission rules, however they are
// spelled. Permission rules only match the start of a command: a deny on "git push --force" can't
// see "git push origin main --force", "--force-w" or "--f\orce". Exit code 2 blocks the call and
// gives Claude the reason; a person can still run any of these by hand.
//
// It reads commands as plain words, so it's a safety net rather than a sandbox: a command hidden
// in a double-quoted substitution gets through, and no shell guard stops a plain read such as
// `cat .env`. GitHub's protection of main is the guard that nothing here can talk around.
//
// Usage (Claude Code runs it): node scripts/git-guard.ts < hook-input.json
import { readFileSync } from 'node:fs'

const SEPARATORS = new Set([';', '&', '|', '(', ')', '`'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'pwsh', 'powershell'])
/** Words that run the command after them, as in `env git push`. */
const WRAPPERS = new Set(['env', 'command', 'exec', 'nohup', 'sudo', 'time'])
/** Git options, before the subcommand, that take the next word as their value. */
const VALUED_OPTIONS = new Set(['-C', '--git-dir', '--work-tree', '--namespace'])
/** Long options that make git run a program of the caller's choosing, in any subcommand. */
const COMMAND_OPTIONS = [
  'config-env',
  'exec',
  'exec-path',
  'extcmd',
  'open-files-in-pager',
  'receive-pack',
  'upload-pack',
]
/** Long options that let `git push` rewrite or delete what's published. */
const PUSH_DANGERS = ['force', 'force-with-lease', 'force-if-includes', 'mirror', 'delete', 'prune']

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
  const program = words[index] ?? ''
  const args = words.slice(index + 1)
  if (SHELLS.has(programName(program))) {
    // In `bash -c "..."` and `pwsh -Command "..."`, the string is a command line of its own.
    const flag = args.findIndex((arg) => /^-(c|command)$/i.test(arg))
    return flag === -1 ? null : blockedReason(args[flag + 1] ?? '')
  }
  return isGit(program) ? gitProblem(args.map(unescape)) : null
}

/** A program's name, from a bare name or a full path, without `.exe`. */
function programName(word: string): string {
  return (word.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '').toLowerCase()
}

/** Whether a program word runs git: `git`, `git.exe`, a path to either, or an escaped `g\it`. */
function isGit(word: string): boolean {
  return programName(word) === 'git' || programName(unescape(word)) === 'git'
}

/** A word as git gets it: the shell drops its escape characters, `\` in bash, ` in PowerShell. */
function unescape(word: string): string {
  return word.replace(/[\\`]/g, '')
}

/** Whether `arg` names one of these long options, or a prefix of one, which git accepts too. */
function longOption(arg: string, names: string[]): boolean {
  if (!arg.startsWith('--')) return false
  const name = arg.slice(2).split('=')[0] ?? ''
  return name !== '' && names.some((full) => full.startsWith(name))
}

/** Whether `arg` is a group of short options, such as -uf, that holds one of these letters. */
function shortOption(arg: string, letters: string): boolean {
  return /^-[a-zA-Z]/.test(arg) && [...arg.slice(1)].some((letter) => letters.includes(letter))
}

function gitProblem(args: string[]): string | null {
  // A variable could expand to any option, so git words that start with one, or options that
  // hold one, are refused.
  const variable = args.find(
    (arg) => arg.startsWith('$') || (arg.startsWith('-') && arg.includes('$')),
  )
  if (variable) return `${variable} could expand to any git option`
  const runner = args.find((arg) => longOption(arg, COMMAND_OPTIONS))
  if (runner) return `git ${runner} can run any command`

  let index = 0
  for (; (args[index] ?? '').startsWith('-'); index += 1) {
    const option = args[index] ?? ''
    if (option.startsWith('-c')) return `git ${option} can define an alias that runs any command`
    if (VALUED_OPTIONS.has(option)) index += 1
  }
  const rest = args.slice(index + 1)
  if (rest.some((arg) => longOption(arg, ['no-index']))) {
    return '--no-index reaches files outside the repository'
  }
  return SUBCOMMAND_RULES.get(args[index] ?? '')?.(rest) ?? null
}

/** What makes each subcommand dangerous, given the words after it. */
const SUBCOMMAND_RULES = new Map<string, (args: string[]) => string | null>([
  ['push', pushProblem],
  [
    'reset',
    (args) =>
      args.some((arg) => longOption(arg, ['hard']))
        ? 'git reset --hard throws away uncommitted work'
        : null,
  ],
  [
    'clean',
    (args) => (isDryRun(args) ? null : 'git clean deletes untracked files, .env among them'),
  ],
  [
    'config',
    (args) =>
      readsOnly(args) ? null : 'git config can set an alias or a hook that runs any command',
  ],
  [
    'add',
    (args) =>
      args.some((arg) => longOption(arg, ['force']) || shortOption(arg, 'f'))
        ? 'git add --force adds ignored files, such as .env'
        : null,
  ],
  [
    'rebase',
    (args) => (args.some((arg) => shortOption(arg, 'x')) ? 'git rebase -x runs any command' : null),
  ],
  [
    'difftool',
    (args) =>
      args.some((arg) => shortOption(arg, 'x')) ? 'git difftool -x runs any command' : null,
  ],
  [
    'grep',
    (args) => (args.some((arg) => shortOption(arg, 'O')) ? 'git grep -O runs any command' : null),
  ],
  ['bisect', (args) => (args[0] === 'run' ? 'git bisect run runs any command' : null)],
  [
    'submodule',
    (args) => (args.includes('foreach') ? 'git submodule foreach runs any command' : null),
  ],
  ['filter-branch', () => 'git filter-branch rewrites history and runs any command'],
])

function pushProblem(args: string[]): string | null {
  for (const arg of args) {
    if (longOption(arg, PUSH_DANGERS))
      return `git push ${arg} can rewrite or delete published history`
    // Short flags, alone or together: -f forces, -d deletes.
    if (shortOption(arg, 'fd')) return `git push ${arg} can force or delete a branch`
    if (/^[+:]/.test(arg)) return `the refspec ${arg} forces or deletes a branch`
  }
  return null
}

function isDryRun(args: string[]): boolean {
  return args.some((arg) => longOption(arg, ['dry-run']) || shortOption(arg, 'n'))
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
