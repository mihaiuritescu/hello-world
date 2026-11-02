# Infrastructure and costs

Hello World runs as one container next to a managed MySQL database. The staging environment is the live demo: one CloudFormation stack, [`infra/aws/hello-world-demo.yaml`](../infra/aws/hello-world-demo.yaml), deployed with [the runbook](../infra/aws/RUNBOOK.md). Production is an estimate for the same app at a modest public scale.

## Cost estimate

In US dollars a month, at on-demand list prices for eu-central-1 (AWS Price List files of 2026-10-29), for 730 hours.

| Component | Service | Why | Staging (the demo) | Production |
|---|---|---|---:|---:|
| App server | EC2 t4g.small (Graviton: 2 vCPU, 2 GiB), running Docker Compose: Caddy and the app | Free-tier eligible, about 20% cheaper than x86, and 2 GiB leaves headroom | 14.02 | 14.02 |
| Root disk | EBS gp3: 16 GB for staging, 30 GB for production | | 1.52 | 2.86 |
| Public IP | One Elastic IP | A stable host name and certificate | 3.65 | 3.65 |
| Database | RDS MySQL 8.4. Staging: db.t4g.micro, Single-AZ. Production: db.t4g.small, Multi-AZ | Managed backups, patching and TLS; automatic failover in production | 13.87 | 54.02 |
| DB storage | RDS gp3, 20 GB (Single-AZ, then Multi-AZ) | | 2.74 | 5.48 |
| DB backups | Automated. Staging: 1 day. Production: 7 days, with point-in-time recovery | Within the free allowance, which equals the DB storage | 0.00 | 0.00 |
| Secret | Secrets Manager, one secret | A generated database password that never touches git | 0.40 | 0.40 |
| Logs | CloudWatch Logs through Docker's awslogs driver: 2 GB, then 10 GB ingested a month | Logs outlive the instance | 1.32 | 6.62 |
| Alarms | 5 CloudWatch alarms: EC2 status and CPU; RDS CPU, storage and connections | Someone hears when production is in trouble | – | 0.50 |
| Egress | Data out: 5 GB, then 50 GB, at $0.09/GB | | 0.45 | 4.50 |
| DNS and TLS | Staging: sslip.io and Let's Encrypt. Production: a Route 53 zone and a real domain | HTTPS for the demo without buying a domain | 0.00 | 0.54 |
| Images and CI | GHCR (a public package) and GitHub Actions (a public repository) | Free | 0.00 | 0.00 |
| Map tiles | OpenStreetMap's tile servers | No API key; Leaflet's default | 0.00 | 0.00* |
| **List total** | | | **37.97** | **92.59** |
| After the always-free offers (5 GB of logs, 100 GB of egress, 10 alarms) | | | 36.20 | 84.44 |
| **Nov–Dec 2026**, while the T4g trial makes t4g.small free until 2026-12-31 | | | **22.18** (about 0.73 a day) | 70.42 |

\* OpenStreetMap's tiles are best-effort, with no SLA, and heavy use can be blocked. At scale, the tile URL would point to a commercial OpenStreetMap-based provider, which is one setting.

**Notes**
- **Allowances are per account.** The always-free offers and the T4g trial's 750 hours a month apply once per account. Each column assumes its own account; in a shared account, count them once.
- **Production needs a Paid plan,** because db.t4g.small and Multi-AZ aren't eligible on the Free plan.
- **Excluded:** domain registration, VAT and AWS Support.

**Assumptions**
- **Production:** 5,000 monthly active users, about 300 concurrent sockets at peak, 50 GB of egress a month, and a database under 1 GB.
- **Staging:** the deployed demo, with traffic from the team only.

## Future improvement: high availability

An add-on to production, for when one instance is no longer enough:

| Item | $/month |
|---|---:|
| Application Load Balancer | 19.71 |
| 1 LCU | 5.84 |
| 2 public IPv4 addresses for the load balancer | 7.30 |
| A second EC2 t4g.small in another AZ, with its disk and IP | 20.53 |
| ElastiCache Serverless for Valkey (100 MB minimum), as the Socket.IO adapter | 7.37 |
| **Total** | **+60.75** (153.34 for production with HA) |

The same step moves the rate limits to Valkey, adds AWS WAF in front of the load balancer, and serves the static files through CloudFront and S3. Sticky sessions aren't needed, because the client uses WebSockets only.

## Architecture

```
browser ─HTTPS─► Elastic IP ─► Caddy :443 ─► app :3000 ─TLS─► RDS MySQL 8.4
                               └── one EC2 t4g.small ──┘       (private subnets)
                                   (public subnet)
Leaflet loads the map tiles straight from tile.openstreetmap.org.
```

## What the demo stack creates

| Resource | Notes |
|---|---|
| VPC: one public and two private subnets, an internet gateway, no NAT gateway | The database's subnets have no route to the internet |
| Two security groups | The instance: 80 and 443 from anywhere, no SSH. The database: 3306 from the instance only |
| EC2 instance, with an encrypted disk and an Elastic IP | IMDSv2 only, with a hop limit of 1. Reached through SSM, never SSH |
| RDS MySQL 8.4 | Private, encrypted, TLS required, one day of backups by default |
| Secrets Manager secret | The generated database credentials |
| IAM role and instance profile | SSM through AWS's managed policy, the one secret and the one log group. The managed policy also reads any SSM parameter in the account, so the demo account keeps no secrets in Parameter Store |
| CloudWatch log group | Seven days of container logs |
| SSM document | Deploys one image of this repository's GHCR package, pinned by digest |

**Teardown:** deleting the stack deletes all of it, with no final snapshot and no backups kept. [The runbook](../infra/aws/RUNBOOK.md#teardown-about-10-minutes) gives the steps, inside a signed-in session.

**Known limits of the demo:** the app connects as the database's master user, and the instance doesn't install OS updates by itself. Production would add a least-privilege database user and automatic patching.

## Deploying

- **Build:** CI tests every push. On `main`, its `publish` job builds the arm64 image, pushes it to GHCR, and prints the digest.
- **Deploy:** one `aws ssm send-command` runs the stack's deploy document on the instance.
  - The document pulls the image and takes the host files ([`deploy/aws/`](../deploy/aws)) out of it, so they always match the app.
  - It writes the settings from Secrets Manager into a file only root can read, runs the migrations and restarts the containers.
  - A deploy interrupts the app for a few seconds; Caddy holds the requests meanwhile, and clients reconnect by themselves.
- **Roll back:** deploy the previous image. Migrations only add, so the older version runs on the newer schema, and its migrate step leaves the database as it is.
- **Check:** `node scripts/smoke.ts <site URL> <commit>` checks the version, the database and the WebSocket from anywhere, without AWS access. It waits up to three minutes for a site that is still starting.

People run every AWS command, from the runbook; AI tools only write them ([AGENTS.md](../AGENTS.md), Cloud safety). The next step is a deploy from GitHub Actions through OIDC, which needs no long-lived AWS credentials.
