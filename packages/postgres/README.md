# @serve-tools/postgres

Self-contained PostgreSQL binaries for Node.js, with no Docker, lifecycle
script, or install-time/runtime download.

```sh
npm install @serve-tools/postgres
```

The loader uses exact `optionalDependencies` to select one native package for
macOS arm64/x64, Linux arm64/x64 with glibc, or Windows x64. Node.js 22 or newer
is required. musl distributions such as Alpine Linux are not currently
supported.

## Temporary clusters

```js
import { createEphemeralCluster, postgresqlVersion } from "@serve-tools/postgres";

await using cluster = await createEphemeralCluster({ user: "app_test" });

console.log(`PostgreSQL ${postgresqlVersion}`);
console.log(cluster.psql("SELECT 42"));

// Compatible fields for node-postgres and postgres.js:
console.log(cluster.connection);
```

The helper uses a private Unix-domain socket on macOS and Linux, and
SCRAM-authenticated loopback TCP with a random per-cluster password on Windows.
`stop()` is idempotent; it stops PostgreSQL and removes the data and socket
directories. Async disposal calls the same method.

Clusters are intentionally disposable test and local-development resources.
They are not durable production database services.

## Program paths

```js
import { binPath, pgHome } from "@serve-tools/postgres";

console.log(pgHome());
console.log(binPath("pg_dump"));
```

`binPath()` accepts a program basename without an extension. The platform
package retains every PostgreSQL command and runtime feature, but excludes C
headers, static/import libraries, pkg-config files, and Windows StackBuilder
tooling. It is not an extension-development SDK.

Package distribution versions are independent from the contained PostgreSQL
release. The `postgresqlVersion` export and platform build manifests identify
the exact payload, allowing loader-only fixes without republishing unchanged
native packages.

`@serve-tools/postgres` is one package family in the broader `@serve-tools`
scope. Other families, such as a future `@serve-tools/http3-native`, are
independent siblings.
