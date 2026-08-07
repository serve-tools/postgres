# @serve-tools/postgres-win32-x64

Distribution package 0.1.0, containing PostgreSQL 18.4.0 for win32-x64. The runtime payload is sourced from a release built by [theseus-rs/postgresql-binaries](https://github.com/theseus-rs/postgresql-binaries).

Development headers, static/import libraries, and pkg-config files are excluded, as are StackBuilder files on Windows; PostgreSQL programs and runtime features are retained.

Do not depend on this package directly. Use `@serve-tools/postgres`, which selects the matching platform package via `optionalDependencies`.
