# @serve-tools/postgres-darwin-x64

Distribution package 0.1.0, containing PostgreSQL 18.4.0 for darwin-x64. The runtime payload is derived from [theseus-rs/postgresql-binaries](https://github.com/theseus-rs/postgresql-binaries) (built by [zonky](https://github.com/zonkyio/embedded-postgres-binaries)).

Development headers, static/import libraries, and pkg-config files are excluded, as are StackBuilder files on Windows; PostgreSQL programs and runtime features are retained.

Do not depend on this package directly. Use `@serve-tools/postgres`, which selects the matching platform package via `optionalDependencies`.
