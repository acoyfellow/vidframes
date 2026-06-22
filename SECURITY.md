# Security Policy

## Reporting a Vulnerability

Email jcoeyman@cloudflare.com. Do not open public issues for security bugs.

## Access Before Deploy

This tool calls the Cloudflare Workers AI REST API using an API token. Never
commit tokens to the repo. Use environment variables (`CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`) or pass them at runtime.

No public Worker URLs with bindings. This is a local CLI/library, not a
deployed Worker.
