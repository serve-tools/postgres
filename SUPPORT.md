# Support policy

## Supported environments

The package supports Node.js 22 and newer while those lines are maintained by
the Node.js project. The native target matrix is macOS arm64/x64, Linux
arm64/x64 with glibc, and Windows x64.

musl distributions such as Alpine Linux, Windows arm64, 32-bit targets,
FreeBSD, and other Unix systems are not currently packaged. Unsupported targets
fail explicitly instead of downloading a fallback.

## Intended use

`createEphemeralCluster()` is for disposable test and local-development
databases. It is not a service manager, backup system, high-availability layer,
or durable production PostgreSQL deployment. Direct program access through
`pgHome()` and `binPath()` remains available for callers that own those
operational concerns.

Platform packages are runtime distributions. Building third-party C extensions
requires a separate PostgreSQL development toolchain because headers and static
or import libraries are intentionally excluded.

## Getting help

Use [GitHub issues](https://github.com/serve-tools/postgres/issues) for usage
questions and reproducible bugs. Include the package version, exported
`postgresqlVersion`, Node.js version, operating system, CPU architecture, libc
where applicable, and a minimal reproduction. Use the private process in
[SECURITY.md](./SECURITY.md) for vulnerabilities.
