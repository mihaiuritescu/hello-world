#!/usr/bin/env bash
# Deploys one image to the demo from GitHub Actions, as the runbook's step 7 does by hand. It signs
# in to AWS with the job's OpenID Connect token, so GitHub stores no AWS key. The role it assumes
# may only read the stack's outputs, send the stack's deploy document to its instance, and read
# the status of commands.
#
# Usage: ci-deploy.sh <ghcr.io/owner/name@sha256:digest>
# Environment: AWS_REGION, AWS_DEPLOY_ROLE_ARN and STACK. GitHub sets the rest when the job has the
# id-token: write permission. Writes the site's URL to the step output site-url.
set -euo pipefail

image=$1
: "${AWS_REGION:?}" "${AWS_DEPLOY_ROLE_ARN:?}" "${STACK:?}" "${GITHUB_OUTPUT:?}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?needs the job permission id-token: write}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?needs the job permission id-token: write}"

# The token names this repository and the tag, which the role's trust policy checks. The
# credentials live only in this script's environment, never in a later step's.
token=$(curl --fail --silent --show-error \
  --header "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | jq --raw-output .value)
echo "::add-mask::$token"
if ! credentials=$(aws sts assume-role-with-web-identity --role-arn "$AWS_DEPLOY_ROLE_ARN" \
  --role-session-name "github-run-${GITHUB_RUN_ID:-local}" --web-identity-token "$token" \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text); then
  # The token's subject is what the role's trust checks. Unlike the token, its claims aren't secret.
  subject=$(jq --raw-input --raw-output 'split(".")[1] | gsub("-"; "+") | gsub("_"; "/")
    | . + (("=" * ((4 - length % 4) % 4)) // "") | @base64d | fromjson | .sub' <<< "$token" || true)
  echo "Couldn't sign in as $AWS_DEPLOY_ROLE_ARN with the subject $subject. Check that" \
    "AWS_DEPLOY_ROLE_ARN matches the stack's DeployRoleArn output (a new stack gets a new role)," \
    "and that the subject starts with repo:, then the stack's GitHubOidcRepository." >&2
  exit 1
fi
read -r AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN <<< "$credentials"
echo "::add-mask::$AWS_SECRET_ACCESS_KEY"
echo "::add-mask::$AWS_SESSION_TOKEN"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
site_url=$(output SiteUrl)
instance_id=$(output InstanceId)
document=$(output DeployDocument)
for value in "$site_url" "$instance_id" "$document"; do
  if [[ -z $value || $value == None ]]; then
    echo "The stack $STACK lacks the SiteUrl, InstanceId or DeployDocument output." >&2
    exit 1
  fi
done

# SendCommand takes a comment of at most 100 characters. A command that hasn't started on the
# instance within 5 minutes never runs, so a late one can't overwrite a newer deploy.
comment="Deploy ${GITHUB_REF_NAME:-an image} from GitHub Actions"
# $LATEST is SSM's own name for the newest version of the document, not a shell variable.
# shellcheck disable=SC2016
command_id=$(aws ssm send-command --document-name "$document" --document-version '$LATEST' \
  --instance-ids "$instance_id" --comment "${comment:0:100}" --timeout-seconds 300 \
  --parameters "$(jq --null-input --compact-output --arg image "$image" '{ImageDigest: [$image]}')" \
  --query Command.CommandId --output text)
echo "Sent command $command_id to $instance_id"

invocation() {
  aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" \
    --query "$1" --output text
}

# Right after send-command, the invocation may not exist yet. The document stops a deploy that
# runs for 15 minutes, so every command ends; the job's timeout covers the rest.
last=''
while true; do
  if ! state=$(invocation '[Status,StatusDetails]' 2>&1); then
    case "$state" in
      *InvocationDoesNotExist*)
        sleep 5
        continue
        ;;
      *)
        echo "Couldn't read the deploy's status, so it may still be running: $state" >&2
        exit 1
        ;;
    esac
  fi
  read -r status details <<< "$state"
  case "$status" in
    Success) break ;;
    Pending | InProgress | Delayed)
      [[ $details == "$last" ]] || echo "Deploy: $details"
      last=$details
      sleep 10
      ;;
    *)
      # Failed, TimedOut or Cancelled; the details say whether it ever started.
      echo "The deploy ended with: $status ($details)" >&2
      invocation StandardErrorContent >&2 || true
      exit 1
      ;;
  esac
done
invocation StandardOutputContent
echo "site-url=$site_url" >> "$GITHUB_OUTPUT"
