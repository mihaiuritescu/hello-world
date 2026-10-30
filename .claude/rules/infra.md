---
paths:
  - "infra/**"
  - "deploy/**"
  - "Dockerfile"
  - "compose.yaml"
  - ".github/**"
---

# Infrastructure rules

## Cloud safety (non-negotiable)
- Never run `aws` or `gh` commands, and never read `~/.aws`. Never print, store or commit credentials or secret values.
- Write every AWS step into `infra/aws/RUNBOOK.md`, with exact parameters and expected output. A human runs it, with no agent session active while signed in to AWS.
- Before a resource can be deployed, it must appear in `docs/INFRASTRUCTURE.md`, with its monthly cost and how to tear it down.

## CloudFormation
- **Parameters:** anything account-, region- or repository-specific is a parameter. The Region comes from `AWS::Region`.
- **IAM:** least privilege. Scope every statement to concrete ARNs unless the action has no resource type.
- **Demo resources:**
  - `DeletionPolicy: Delete`, and nothing left behind after `delete-stack`;
  - IMDSv2 required;
  - storage encrypted;
  - RDS not publicly accessible.

## Docker
- `docker compose up --build` must work on amd64 and arm64 with nothing installed but Docker.
- No secrets in images or in `compose.yaml`; the local credentials there are fixed, test-only values.
- Use exec-form `CMD`, so `docker stop` delivers SIGTERM to Node.

## GitHub Actions
- Pin every action to a commit SHA, with the version in a comment.
- Default to `permissions: contents: read`, and grant more per job only when needed.
