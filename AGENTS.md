# Repository guidance

## Mission and naming

This repository owns the production `@serve-tools/postgres` package family.
Serve Tools is the umbrella project, not a PostgreSQL-only brand. Other native
tools belong in sibling families; a dual distribution of `@http3-server/native`
may be named `@serve-tools/http3-native`.

The public source repository is `https://github.com/serve-tools/postgres`, the
`serve-tools` npm organization exists, and repository provenance metadata is
configured. The npm package identities have not been published. Never claim
that a package is published or weaken a check to work around remaining setup.
The protected `npm` GitHub environment is reserved for `publish.yml`.

## Three verified layers

Treat these as separate artifacts:

1. `postgresql-binaries.lock.json` selects complete upstream archives by exact
   URL and SHA-256. Only `source:update` may change it, and every change requires
   human review.
2. `import-binaries.js` safely extracts an archive, applies `runtime-v1`, checks
   executable architecture, and records a deterministic final-tree digest.
3. `pack-release.js` packs all npm tarballs once. Native CI and staging consume
   that immutable candidate; never rebuild between them.

Keep release metadata in `scripts/platform-matrix.js`. The published
`packages/postgres/platforms.js` owns runtime detection only; do not make
consumers install build triples or archive URL logic.

Generated `binaries/<platform>/pg/`, `.cache/`, and `release/` are ignored. Do
not hand-edit or commit payloads. Binary packages intentionally remain outside
the npm workspace graph because foreign-target workspace packages are rejected
by npm.

## Non-negotiable package contracts

- No install, postinstall, prepack, or runtime download mechanism.
- No Docker requirement.
- Loader optional dependencies exactly pin all five platform package versions.
- Supported native targets are macOS arm64/x64, glibc Linux arm64/x64, and
  Windows x64. musl Linux is intentionally unsupported until first-party
  archives satisfy the complete runtime, provenance, and CI contracts.
- Distribution SemVer is independent from the contained PostgreSQL version.
- Platform packages are staged before the loader.
- `runtime-v1` removes only headers, static/import libraries, pkg-config files,
  and Windows StackBuilder/wxWidgets files. Retain all commands, shared runtime
  libraries, extensions, locales, JIT data, catalogs, timezone data, and notices.
- Unix ephemeral clusters use a private socket and reject host authentication;
  Windows uses SCRAM-authenticated loopback TCP with a random cluster password.
- `createEphemeralCluster()` is disposable test/development infrastructure, not
  a durable database service.
- npm publication uses one verified candidate, provenance, trusted publishing,
  a protected environment, and staging. Never issue a direct `npm publish`.

## Required validation

Use Node.js 22.14+ and npm 11.5.1+. The release workflow separately pins an npm
CLI with staged-publishing support. For ordinary changes:

```sh
npm ci --ignore-scripts --workspaces=false
npm run verify
```

For runtime or native changes, also import and smoke the current platform. For
payload, importer, packaging, version, or release changes, run all platform jobs
and candidate installation tests through CI. `npm run check:publish` must pass
against the configured `serve-tools/postgres` repository before publication.

Update JavaScript behavior, TypeScript declarations, tests, READMEs, and policy
documents together. Preserve unrelated user changes and do not perform git,
GitHub, or npm registry mutations without explicit authorization.
