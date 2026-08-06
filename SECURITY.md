# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. After the public
GitHub repository is created, use its private vulnerability-reporting form. If
that channel is unavailable, contact the maintainer privately before sharing
reproduction details.

Reports should identify the affected package and version, target platform,
impact, reproduction steps, and any known mitigation. Receipt will be
acknowledged within three business days. Disclosure timing will be coordinated
with the reporter and relevant upstream project.

## Supported versions

Security fixes are made against the latest released distribution. Older package
versions should be upgraded. Payload releases track a specific PostgreSQL
release and may be replaced promptly when PostgreSQL or the binary builder
publishes a relevant security update.

## Supply-chain controls

- Source archives are pinned by reviewed SHA-256 digests.
- Imports validate archive boundaries, target architecture, runtime contents,
  and the final payload tree digest.
- npm tarballs are packed once and recorded in an immutable candidate manifest.
- CI tests those exact tarballs on every supported target before staging.
- Normal releases use npm trusted publishing, provenance, a protected GitHub
  environment, and staged publication.
- Published packages contain no install-time or runtime downloader.

Maintainers monitor security notices from PostgreSQL, Node.js, npm, GitHub
Actions dependencies, and the upstream binary projects. A relevant advisory
requires a new reviewed source lock or application release; cached payloads are
never silently replaced.
