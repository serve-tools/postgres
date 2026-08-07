# Releasing

Releases promote one reviewed set of npm tarballs. They never rebuild between
testing and staging.

## Repository and npm state

The public repository is `https://github.com/serve-tools/postgres`, repository
provenance metadata is configured, `main` is protected, and the protected
GitHub environment is named `npm`. The `@serve-tools` npm organization exists,
but none of this package family's npm identities have been published.

Before the first publication:

1. Run `npm run check:publish` and complete a successful release-candidate run.
2. Bootstrap each npm package identity using a short-lived granular access token
   because trusted publishing cannot be configured for a package that does not
   exist. Use npm staged publishing with only tarballs from one verified
   candidate; stage the five platform packages first and the loader last,
   inspect the stage, and promote it. Revoke the token immediately. This is the
   only token-based release procedure.
3. Configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
   for `publish.yml` and the `npm` environment. Require two-factor authentication
   and disallow token publication after the bootstrap release.

Repository metadata must exactly match the public repository because npm uses
it when [generating provenance](https://docs.npmjs.com/generating-provenance-statements/).
The configured identity can be reproduced with
`npm run configure:repository -- --repository=https://github.com/serve-tools/postgres`.
Never substitute a placeholder URL.

## Candidate creation

The release-candidate workflow imports every locked archive, verifies every
payload, packs all packages once, and uploads one immutable candidate artifact.
Its manifest records the source commit, source lock, PostgreSQL version, package
order, tarball SHA-256 and npm integrity, package contents, and final payload
tree digests.

Every supported platform then installs the loader from those local tarballs and
runs a real initdb/start/SQL/stop cycle. A candidate is releasable only when all
native and policy checks pass.

## Staging and promotion

Dispatch `publish.yml` with the successful candidate workflow run, expected
version, npm tag, and exact confirmation text. The job:

1. verifies the candidate and source commit again;
2. obtains a short-lived npm credential through GitHub OIDC;
3. stages platform tarballs in dependency order and the loader last; and
4. stops without directly publishing them.

Review npm's [staged package report](https://docs.npmjs.com/staged-publishing/)
and provenance before promoting the staged release in npm. If any check is
wrong, discard the stage, correct the source, and build a new candidate. Do not
alter or repack an existing candidate.

## Release checklist

- The source lock change and upstream release are reviewed.
- `npm run verify` and every native smoke job pass.
- `npm run check:publish` confirms the exact public repository metadata.
- The candidate manifest names the intended source commit and version.
- Package size changes are explained and within npm limits.
- Security advisories and license files are reviewed.
- Platform packages precede the loader.
- The staged package report and provenance are approved before promotion.
