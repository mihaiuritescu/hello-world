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
  ])('lets %j run', (command) => {
    expect(blockedReason(command)).toBeNull()
  })

  it('says why it blocks a command', () => {
    expect(blockedReason('git push origin main --force')).toMatch(/force/i)
  })
})
