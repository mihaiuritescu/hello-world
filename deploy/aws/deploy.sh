#!/usr/bin/env bash
# Deploys one image to the demo host. The stack's SSM document copies this file, compose.yaml and
# the Caddyfile out of that image into /opt/hello-world, then runs it there as root.
#
# Usage: deploy.sh <ghcr.io/owner/name@sha256:digest>
# Environment: AWS_REGION, DB_SECRET_ID, SITE_ADDRESS, LOG_GROUP.
set -euo pipefail

image=$1
: "${AWS_REGION:?}" "${DB_SECRET_ID:?}" "${SITE_ADDRESS:?}" "${LOG_GROUP:?}"

# The app's settings, with the database credentials from Secrets Manager, in a file only root can
# read. Nothing here prints a secret. Generated passwords have no punctuation, so single quotes
# always hold.
secret=$(aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$DB_SECRET_ID" \
  --query SecretString --output text)
field() { jq --raw-output --arg key "$1" '.[$key]' <<< "$secret"; }

umask 077
cat > app.env.new << EOF
DB_HOST='$(field host)'
DB_PORT='$(field port)'
DB_USER='$(field username)'
DB_PASSWORD='$(field password)'
DB_NAME='hello_world'
DB_CA_FILE='/app/certs/rds-global-bundle.pem'
PUBLIC_URL='https://${SITE_ADDRESS}'
IMAGE_DIGEST='${image}'
EOF
mv app.env.new app.env

# Docker Compose reads .env by itself, so `docker compose ps` and `logs` also work in a shell on
# the host. A changed Caddyfile changes its checksum, which makes Compose recreate Caddy with it.
cat > .env.new << EOF
IMAGE='${image}'
SITE_ADDRESS='${SITE_ADDRESS}'
AWS_REGION='${AWS_REGION}'
LOG_GROUP='${LOG_GROUP}'
CADDYFILE_SHA256='$(sha256sum Caddyfile | cut --delimiter ' ' --fields 1)'
EOF
mv .env.new .env

docker compose pull --quiet
docker compose run --rm migrate
docker compose up --detach --wait --remove-orphans
# Only the running image stays; earlier ones would fill the small disk over many deploys.
docker image prune --all --force
echo "Deployed ${image} to https://${SITE_ADDRESS}"
