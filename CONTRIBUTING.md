# Contributing

Changes must preserve the package family's trust chain and keep platform
behavior explicit.

## Local setup

Node.js 22.14 or newer and npm 11.5.1 or newer are required for development.
The staged release workflow pins a newer npm CLI with staged-publishing support.

```sh
npm ci --ignore-scripts --workspaces=false
npm run import
npm run verify
npm run smoke
```

The import command downloads only the archive already selected by the committed
source lock. Generated payloads and `.cache/` are intentionally untracked.

## Change boundaries

- Do not hand-edit or commit `binaries/*/pg/`.
- Do not add package lifecycle scripts or runtime downloads.
- Do not broaden `runtime-v1` exclusions without a separately reviewed payload
  policy change and full native validation.
- Keep package SemVer independent from the contained PostgreSQL version.
- Update PostgreSQL only with `npm run source:update -- --version <version>`;
  review every URL and digest before importing.
- Keep the platform package pins exact and publish platform packages before a
  loader that references them.
- Do not guess repository, npm organization, or trusted-publisher identities.

For an API change, update runtime tests, declarations, and both READMEs. For a
payload or packaging change, run the full platform matrix and verify the exact
packed candidate. See [RELEASING.md](./RELEASING.md).
