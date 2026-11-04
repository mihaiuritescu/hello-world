# AWS demo runbook

Every AWS step for the Hello World demo, in order. A person runs these commands. Claude wrote them, but never runs an AWS command or sees a credential ([AGENTS.md](../../AGENTS.md), Cloud safety).

**Before you start**
- **Quit Claude Code before step 1,** and open it again only after step 9 has signed you out. Leaving it idle isn't enough.
- **Sign in with short-lived credentials,** through `aws login` or `aws sso login`, never with long-lived access keys. Step 9 signs out with the matching command.
- **Use Git Bash** (or bash on macOS or Linux) in the repository root, with the AWS CLI v2, Docker and Node.js 24.
- **Afterwards, share with Claude only output that holds no secret:** stack outputs, command IDs and statuses.
- **The demo costs** about $0.73 a day in Nov–Dec 2026, and about $1.25 a day after that ([costs](../../docs/INFRASTRUCTURE.md)). Tear it down when you're done.

**Which steps to run.** Every session starts with steps 1 and 3 and ends with step 9, so it has the names and helpers it needs, and never stays signed in.

| Session | Steps |
|---|---|
| The first deploy | 1 to 9 |
| A redeploy or a rollback | 1, 2, 3, 7, 8, 9 ([details](#redeploy-or-roll-back)) |
| A stack update, or logs and troubleshooting | 1, 3, the section you need, 9 |
| Teardown | 1, 3, [Teardown](#teardown-about-10-minutes), 9 |

## 1. Settings and helpers for this shell

```bash
export AWS_REGION=eu-central-1            # or the Region your account is pinned to
export STACK=hello-world-demo
export REPO=mihaiuritescu/hello-world
export ALERT_EMAIL=you@example.com        # where budget alerts go
# Git Bash rewrites arguments that start with "/", such as SSM parameter names. Turn that off.
export MSYS_NO_PATHCONV=1

# Reads one output of the stack.
output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# Loads the stack outputs that steps 7 and 8 use.
stack_outputs() {
  export SITE_URL=$(output SiteUrl) INSTANCE_ID=$(output InstanceId) DOCUMENT=$(output DeployDocument)
  echo "$SITE_URL $INSTANCE_ID $DOCUMENT"
}

# Waits until the SSM command in COMMAND_ID ends, then prints its output.
wait_for_command() {
  : "${COMMAND_ID:?is empty, so send-command failed}" "${INSTANCE_ID:?is empty: run stack_outputs}"
  local status
  while true; do
    status=$(aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
      --query Status --output text 2>&1)
    case "$status" in
      Success)
        aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
          --query StandardOutputContent --output text
        return 0 ;;
      # Right after send-command, the invocation may not exist yet.
      Pending | InProgress | Delayed | *InvocationDoesNotExist*) sleep 10 ;;
      Failed | TimedOut | Cancelled | Cancelling)
        echo "The command ended with: $status" >&2
        aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
          --query StandardErrorContent --output text >&2
        return 1 ;;
      *)
        echo "$status" >&2                # an AWS CLI error, such as an expired sign-in
        return 1 ;;
    esac
  done
}
```

Expect no output.

## 2. The image (no AWS access needed)

The instance pulls the image from GHCR, pinned by its digest. The image also carries the host's deploy files ([`deploy/aws/`](../../deploy/aws)), so a deploy needs nothing else.

**From CI**, once GitHub Actions runs: push to `main`, wait for the CI run, and open the summary of the **Publish the arm64 image** job. It shows both values:

```bash
export IMAGE_DIGEST=ghcr.io/mihaiuritescu/hello-world@sha256:…   # from the summary
export GIT_SHA=…                                                  # the 40-character commit SHA
```

**Or from your machine**, while CI can't run. This takes about 10 minutes, because Docker Desktop builds arm64 through emulation. It builds a clean copy of what is on `main` on GitHub, never your working tree.

1. Create a token that can only publish packages, from [this link](https://github.com/settings/tokens/new?scopes=write:packages&description=hello-world%20image). Ticking `write:packages` by hand would also tick the broad `repo` scope; the link doesn't. Set **Expiration** to **Custom**, pick tomorrow, then generate the token and copy it.
2. Build and push. `read` keeps the token out of your shell history, and `docker logout` removes it from Docker's credential store.

   ```bash
   git push origin main
   export GIT_SHA=$(git rev-parse origin/main)
   git worktree add --detach ../hello-world-image "$GIT_SHA"
   read -rsp 'GitHub token: ' token && echo
   printf '%s' "$token" | docker login ghcr.io --username <your GitHub user name> --password-stdin
   unset token
   docker buildx build --platform linux/arm64 --build-arg "GIT_SHA=$GIT_SHA" \
     --label "org.opencontainers.image.source=https://github.com/$REPO" \
     --tag "ghcr.io/$REPO:$GIT_SHA" --push ../hello-world-image
   docker buildx imagetools inspect "ghcr.io/$REPO:$GIT_SHA" | grep -m1 '^Digest:'
   docker logout ghcr.io
   git worktree remove ../hello-world-image
   export IMAGE_DIGEST=ghcr.io/$REPO@sha256:…                        # the digest printed above
   ```

   If an earlier run left `../hello-world-image` behind, `git worktree remove --force ../hello-world-image` clears it.
3. Delete the token: on GitHub, open **Settings → Developer settings → Personal access tokens → Tokens (classic)**, then **Delete**.

**Make the package public, once.** On GitHub, go to your profile → **Packages** → **hello-world** → **Package settings** → **Change visibility** → **Public**. The instance then pulls without credentials. This can't be undone; the image holds no secrets.

## 3. Sign in

```bash
aws login                                 # or: aws sso login, with IAM Identity Center
export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "$ACCOUNT"
```

Expect your 12-digit account ID. Once the stack exists (after step 6), also load its outputs:

```bash
stack_outputs
```

Expect `https://<a-b-c-d>.nip.io i-… hello-world-demo-deploy`.

The first time, also note in the console:
- the account plan (Free or Paid), the date the account was created and, on a Free plan, its end date;
- under **Billing → Credits**, the balance and the expiry date.

## 4. Look up the stack's inputs (first time, read-only)

```bash
# Both instance types should be free-tier eligible.
aws ec2 describe-instance-types --instance-types t4g.micro t4g.small \
  --filters Name=free-tier-eligible,Values=true --query 'InstanceTypes[].InstanceType' --output text

# Today's Amazon Linux 2023 arm64 image, resolved once.
export IMAGE_ID=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
  --query Parameter.Value --output text)

# The newest MySQL 8.4 version in the Region, and whether db.t4g.micro offers it.
export DB_ENGINE_VERSION=$(aws rds describe-db-engine-versions --engine mysql \
  --query "DBEngineVersions[?starts_with(EngineVersion, '8.4.')].EngineVersion | [-1]" --output text)
aws rds describe-orderable-db-instance-options --engine mysql \
  --engine-version "$DB_ENGINE_VERSION" --db-instance-class db.t4g.micro \
  --query 'length(OrderableDBInstanceOptions)'

echo "$IMAGE_ID $DB_ENGINE_VERSION"
```

Expect `t4g.micro` and `t4g.small` in either order, then a number above 0, then `ami-…` and `8.4.…`. If only `t4g.micro` shows, add `ParameterKey=InstanceType,ParameterValue=t4g.micro` to the parameters in step 6.

## 5. Budgets (once per account)

```bash
aws budgets create-budget --account-id "$ACCOUNT" \
  --budget file://infra/aws/budgets/gross-cost.json \
  --notifications-with-subscribers "$(sed "s/ALERT_EMAIL/$ALERT_EMAIL/" infra/aws/budgets/gross-cost-alerts.json)"
aws budgets create-budget --account-id "$ACCOUNT" \
  --budget file://infra/aws/budgets/net-cost.json \
  --notifications-with-subscribers "$(sed "s/ALERT_EMAIL/$ALERT_EMAIL/" infra/aws/budgets/net-cost-alerts.json)"
```

Expect no output. The two budgets:
- `hello-world-gross-cost`: $30 a month before credits. It alerts at 80% forecast and at 100% actual.
- `hello-world-net-cost`: $1 a month after credits. It alerts as soon as anything is actually charged.

## 6. Create the stack (first time, about 15 minutes)

```bash
aws cloudformation create-change-set --stack-name "$STACK" --change-set-name create \
  --change-set-type CREATE --capabilities CAPABILITY_IAM \
  --template-body file://infra/aws/hello-world-demo.yaml \
  --parameters ParameterKey=ImageId,ParameterValue="$IMAGE_ID" \
               ParameterKey=DbEngineVersion,ParameterValue="$DB_ENGINE_VERSION"
aws cloudformation wait change-set-create-complete --stack-name "$STACK" --change-set-name create
aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name create \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType]' --output table
```

Expect 24 rows, all `Add`. Then create it:

```bash
aws cloudformation execute-change-set --stack-name "$STACK" --change-set-name create
aws cloudformation wait stack-create-complete --stack-name "$STACK"
stack_outputs
```

Expect `https://<a-b-c-d>.nip.io i-… hello-world-demo-deploy`. If the wait fails, this shows why:

```bash
aws cloudformation describe-stack-events --stack-name "$STACK" \
  --query "StackEvents[?contains(ResourceStatus, 'FAILED')].[LogicalResourceId,ResourceStatusReason]" \
  --output table
```

## 7. Deploy

Wait until the instance has registered with SSM. That takes a few minutes after the stack is complete.

```bash
aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --query 'InstanceInformationList[0].PingStatus' --output text
```

Expect `Online`. Then deploy, and wait for the result:

```bash
COMMAND_ID=$(aws ssm send-command --document-name "$DOCUMENT" --document-version '$LATEST' \
  --instance-ids "$INSTANCE_ID" --comment "Deploy $GIT_SHA" \
  --parameters "{\"ImageDigest\":[\"$IMAGE_DIGEST\"]}" \
  --query Command.CommandId --output text)
wait_for_command
```

Expect the output to end with `Deployed ghcr.io/…@sha256:… to https://<a-b-c-d>.nip.io`. The first deploy takes a few minutes, because it waits for the first boot to finish and then pulls the images. The document accepts only images of this repository's GHCR package; for any other, `send-command` fails.

## 8. Smoke test (no AWS access needed)

```bash
node scripts/smoke.ts "$SITE_URL" "$GIT_SHA"
```

Expect `OK: https://… runs <sha>, reaches its database, accepts WebSockets.` Right after the first deploy, it may print `Not up yet (…)` for a minute while Caddy gets the certificate. It gives up after three minutes.

## 9. Sign out

```bash
aws logout                                # after aws login
aws sso logout                            # after aws sso login
```

Then open Claude Code again. To have it check the demo too, paste `SITE_URL` and `GIT_SHA`.

## Redeploy or roll back

- **Redeploy:** steps 1, 2 for the new image, 3, 7, 8 and 9.
- **Roll back:** the same, but instead of step 2, export the previous `IMAGE_DIGEST` and `GIT_SHA`.

A deploy interrupts the app for a few seconds. Caddy holds the requests meanwhile, and clients reconnect by themselves. A rollback leaves the database as it is: migrations only add, so the older version runs on the newer schema.

## Update the stack

When the template changes, after steps 1 and 3:

```bash
aws cloudformation create-change-set --stack-name "$STACK" --change-set-name update \
  --change-set-type UPDATE --capabilities CAPABILITY_IAM \
  --template-body file://infra/aws/hello-world-demo.yaml \
  --parameters ParameterKey=ImageId,UsePreviousValue=true \
               ParameterKey=InstanceType,UsePreviousValue=true \
               ParameterKey=DbEngineVersion,UsePreviousValue=true \
               ParameterKey=DbBackupRetentionDays,UsePreviousValue=true \
               ParameterKey=SiteAddress,UsePreviousValue=true \
               ParameterKey=GitHubRepository,UsePreviousValue=true
aws cloudformation wait change-set-create-complete --stack-name "$STACK" --change-set-name update
aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name update \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,Replacement]' --output table
```

Every parameter keeps the value the stack has. To change one, give it `ParameterValue=…` instead of `UsePreviousValue=true`.

`DeployDocument` shows `Conditional` whenever its content changes, as it does when the site address changes: through a new `SiteAddress`, or through a new default in the template while `SiteAddress` is empty. This `Conditional` is safe: the template sets `UpdateMethod: NewVersion`, so the document gets a new version in place. The instance keeps the old settings until the next deploy, so after the update, run `stack_outputs`, then step 7 with the `IMAGE_DIGEST` and `GIT_SHA` of the version that runs now (step 2 shows where to find them). For a new address, such as a domain that already points at the Elastic IP, Caddy then gets its certificate.

Stop if `Instance`, `Database` or `ElasticIp` shows `True` or `Conditional` under Replacement: a new instance starts without the app until the next deploy, and a new database starts empty. Stop too if the wait fails because nothing changed. Either way, delete the change set:

```bash
aws cloudformation delete-change-set --stack-name "$STACK" --change-set-name update
```

Otherwise, apply it:

```bash
aws cloudformation execute-change-set --stack-name "$STACK" --change-set-name update
aws cloudformation wait stack-update-complete --stack-name "$STACK"
```

## Logs and troubleshooting

After steps 1 and 3, with `stack_outputs`:

```bash
aws logs tail "/$STACK" --since 30m --follow     # every container's logs

# The containers' state, and the app's last log lines, from the host
COMMAND_ID=$(aws ssm send-command --document-name AWS-RunShellScript --instance-ids "$INSTANCE_ID" \
  --parameters 'commands=["cd /opt/hello-world && docker compose ps && docker compose logs --tail 30 app"]' \
  --query Command.CommandId --output text)
wait_for_command
```

For a shell on the host, `aws ssm start-session --target "$INSTANCE_ID"` needs the Session Manager plugin. There, `sudo -i` and `cd /opt/hello-world`, and Docker Compose commands work.

- **The deploy says Docker Compose is missing:** the first boot failed, most often on a download; `/var/log/cloud-init-output.log` on the host says why. Run the first boot again, then step 7 with the `IMAGE_DIGEST` and `GIT_SHA` from step 2:

  ```bash
  COMMAND_ID=$(aws ssm send-command --document-name AWS-RunShellScript --instance-ids "$INSTANCE_ID" \
    --comment 'Run the first boot again' \
    --parameters 'commands=["bash /var/lib/cloud/instance/user-data.txt"]' \
    --query Command.CommandId --output text)
  wait_for_command
  ```
- **HTTPS doesn't come up:** Let's Encrypt must reach port 80, and the site address must resolve to the Elastic IP. Try `curl -I http://<elastic ip>`, and read Caddy's log stream.
- **The smoke test keeps reporting a self-signed certificate, or the browser shows a block page:** your network's DNS doesn't return the Elastic IP for the site address. Compare `nslookup "${SITE_URL#https://}"` with `nslookup "${SITE_URL#https://}" 1.1.1.1`: in both, the `Address:` line under `Name:` should show the stack's Elastic IP, which `output ElasticIp` prints. On at least one Romanian provider's network, every sslip.io name resolves to a block page that cites an order of the authorities, which is why the stack uses nip.io. If a network blocks nip.io too, give `SiteAddress` a name it resolves, such as a domain of your own ([Update the stack](#update-the-stack)).
- **The deploy fails at `migrate`:** if it can't reach MySQL, the database may still be starting, so run step 7 again. If it names migrations on both sides, the database and the image have diverged, for example after a reverted migration. Running step 7 again won't help: fix the migrations in the code, then deploy the new image.

## Teardown (about 10 minutes)

```bash
aws cloudformation delete-stack --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --stack-name "$STACK"
aws budgets delete-budget --account-id "$ACCOUNT" --budget-name hello-world-gross-cost
aws budgets delete-budget --account-id "$ACCOUNT" --budget-name hello-world-net-cost
```

Everything the stack created goes with it: the instance with its disk and Elastic IP, the database with its backups, the secret and the logs. The GHCR package stays on GitHub, where it's free; delete it there if you like. The Elastic IP goes back to AWS, so its nip.io address may later reach someone else's server: drop any links to it.

Prefer deleting to stopping. A stopped instance still pays for its Elastic IP, and RDS starts a stopped database again after 7 days.

## Notes for the account owner

- Credits pay only while they last. They expire 12 months after sign-up, sometimes sooner.
- A Free-plan account closes 6 months after sign-up. Plan the teardown, or the upgrade to a Paid plan, before then.
- The Free plan allows only eligible instance types, Single-AZ databases and about a day of backups. The stack's defaults stay within that.
