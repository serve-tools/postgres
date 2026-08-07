# @serve-tools/postgres

Self-contained PostgreSQL binaries for Node.js. The package family uses native
npm platform selection and performs no install-time or runtime downloads. It
does not require Docker and publishes no lifecycle scripts.

## Package family

Serve Tools is the umbrella project and `@serve-tools` is its npm scope. This
repository owns only the PostgreSQL family:

- `@serve-tools/postgres` is the public loader and lifecycle API.
- `@serve-tools/postgres-<platform>` contains one platform's runtime payload.
- `@serve-tools/postgres-workspace` is the private development workspace.

Other native server tools belong in sibling families. For example, a future
dual distribution of `@http3-server/native` can be named
`@serve-tools/http3-native`; it should not be folded into this package family.

The public source repository is
[`serve-tools/postgres`](https://github.com/serve-tools/postgres), and the
six-package `0.1.0` family is published under the `@serve-tools` npm
organization.

## Guarantees

- Every complete upstream archive is pinned by URL and SHA-256 in
  `postgresql-binaries.lock.json`.
- Import rejects unsafe archive paths, escaping symlinks, missing programs, and
  executables for the wrong architecture.
- Each final pruned payload has a deterministic tree digest recorded in its
  `build-manifest.json`.
- Platform packages are exact optional dependencies of the loader, so npm
  installs only the matching target.
- Packed tarballs become one immutable release candidate. Candidate verification
  checks their digests, contents, metadata, dependency graph, source lock, and
  publication order before any staging operation.
- After the one-time package-identity bootstrap, the release workflow stages
  platform packages before the loader and cannot perform a direct publication.

## Supported targets

| Platform | Architectures | Runtime |
| --- | --- | --- |
| macOS | arm64, x64 | native |
| Linux | arm64, x64 | glibc |
| Windows | x64 | native |

Node.js 22 or newer is required. The CI policy covers maintained Node.js lines
and exercises every native target. Linux installations require glibc; musl
distributions such as Alpine Linux are not currently supported.

## Use

Install the loader normally:

```sh
npm install @serve-tools/postgres
```

Start a temporary cluster for a test or local development process:

```js
import { createEphemeralCluster, postgresqlVersion } from "@serve-tools/postgres";

await using cluster = await createEphemeralCluster();

console.log(`PostgreSQL ${postgresqlVersion}`);
console.log(cluster.psql("SELECT 42"));
console.log(cluster.connection); // node-postgres and postgres.js-compatible fields
```

`createEphemeralCluster()` uses a private Unix-domain socket on macOS and Linux,
and SCRAM-authenticated loopback TCP with a random per-cluster password on
Windows. Its data directory is disposable and removed by `stop()` or async
disposal. It is designed for tests and local development, not as a durable
database supervisor.

`pgHome()` returns the selected PostgreSQL tree, and `binPath("pg_dump")`
returns an absolute program path. Executable names must be basenames without an
extension.

## Payload policy and provenance

The locked archives and published checksums come directly from releases built
by
[theseus-rs/postgresql-binaries](https://github.com/theseus-rs/postgresql-binaries).
This project does not maintain a custom PostgreSQL toolchain.

The conservative `runtime-v1` profile removes only development headers,
static/import libraries, pkg-config files, and Windows StackBuilder/wxWidgets
files. It retains PostgreSQL programs, runtime shared libraries, extensions,
locales, JIT artifacts, catalogs, timezone data, and license notices. These are
runtime packages, not a C-extension development SDK.

Package distribution versions are independent from the PostgreSQL release.
Every manifest and the loader's `postgresqlVersion` export identify the exact
payload. A loader-only fix can therefore ship without repacking unchanged
binaries.

## Development

Import the current platform and run the local checks:

```sh
npm ci --ignore-scripts --workspaces=false
npm run import
npm run verify
npm run smoke
```

The generated `binaries/<platform>/pg/` trees and archive cache are gitignored.
A clean checkout contains all provenance and package metadata but no native
payload.

Updating PostgreSQL is a separate reviewed operation:

```sh
npm run source:update -- --version 18.5.0
npm run import -- --all
npm run check:release
```

Ordinary imports trust only committed digests; they never replace them with
live upstream values. See [CONTRIBUTING.md](./CONTRIBUTING.md),
[SECURITY.md](./SECURITY.md), and [RELEASING.md](./RELEASING.md) for the full
maintenance and release contracts.

## Publication

Repository provenance metadata is configured for
`https://github.com/serve-tools/postgres`, and `npm run check:publish` verifies
that identity. The package identities were bootstrapped at `0.1.0` from one
verified release candidate. Subsequent releases use the staged,
provenance-aware trusted-publishing workflow documented in
[RELEASING.md](./RELEASING.md).
