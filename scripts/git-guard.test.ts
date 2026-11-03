import { describe, expect, it } from 'vitest'
import { blockedReason } from './git-guard.ts'

describe('git guard', () => {
  it.each([
    'git push --force',
    'git push origin main --force',
    'git push origin main --force-with-lease',
    'git push -f origin main',
    'git push -uf origin main',
    'git push origin +main',
    'git push origin :old-branch',
    'git push --mirror',
    'git push --delete origin old-branch',
    'git -C . push -f',
    'git reset --hard',
    'git reset HEAD~3 --hard',
    'git clean -fdx',
    'git diff --no-index -- /dev/null .env',
    'git grep --no-index secret',
    'git -c "alias.x=!aws sts get-caller-identity" x',
    'git --config-env=core.pager=PAGER log',
    'git config alias.x "!aws sts get-caller-identity"',
    'git.exe push --force',
    '"C:\\Program Files\\Git\\cmd\\git.exe" push -f',
    'GIT_TRACE=1 git push --force',
    'env git push --force',
    'cd repo && git push --force',
    'echo ok; git reset --hard',
    'git status | git clean -f',
    'bash -c "git push --force"',
    'echo $(git reset --hard)',
    // git accepts any unambiguous prefix of a long option.
    'git push --force-w origin main',
    'git push --mirro origin',
    'git push --dele origin main',
    'git reset --ha',
    // Escapes that the shell removes before git sees the word.
    'git push origin main --f\\orce',
    'git push origin main --f`orce',
    'g\\it push -f',
    'git push origin main --f$X',
    'git push origin $FLAGS',
    // git's own ways to run another command.
    'git rebase -x "aws sts get-caller-identity" HEAD~1',
    'git rebase --exec "aws sts get-caller-identity" HEAD~1',
    'git bisect run aws sts get-caller-identity',
    'git difftool -x "aws sts get-caller-identity"',
    'git submodule foreach "aws sts get-caller-identity"',
    'git filter-branch --tree-filter "rm -rf ." HEAD',
    'git grep --open-files-in-pager=aws secret',
    'git grep -Oaws secret',
    // Ignored files, such as .env, must never be committed.
    'git add -f .env',
    'git add --force .env',
  ])('blocks %j', (command) => {
    expect(blockedReason(command)).not.toBeNull()
  })

  it.each([
    'git status',
    'git push',
    'git push origin main',
    'git push origin HEAD:main',
    'git log --oneline -5',
    'git diff --stat a2f53a2..HEAD',
    'git stash push --keep-index --include-untracked -q -m s5-commit-1',
    'git update-index --cacheinfo 100644,abc,Dockerfile',
    'git clean -n',
    'git config --get user.name',
    'git commit -m "explain why git push --force is blocked"',
    "git commit -q -F - << 'EOF'\nfix: a subject\n\ngit push --force stays blocked\nEOF",
    'echo git push --force',
    'grep -n "git reset --hard" README.md',
    'git push --follow-tags origin main',
    'git push --dry-run origin main',
    'git rebase main',
    'git bisect start',
    'git add .env.example src/server/app.ts',
    'git grep -n rateLimit',
  ])('lets %j run', (command) => {
    expect(blockedReason(command)).toBeNull()
  })

  it('says why it blocks a command', () => {
    expect(blockedReason('git push origin main --force')).toMatch(/force/i)
  })
})
