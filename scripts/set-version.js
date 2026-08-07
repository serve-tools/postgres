/** Update distribution versions without changing the PostgreSQL source lock. */
import fs from "node:fs";
import path from "node:path";

import { readJson, writeJson } from "./file-utils.js";
import { PLATFORMS } from "./platform-matrix.js";
import { readSourceLock } from "./source-lock.js";

const ROOT = path.join(import.meta.dirname, "..");
const sourceLock = readSourceLock(ROOT);
const [target, targetOrVersion, possibleVersion] = process.argv.slice(2);
const platformKey = target === "platform" ? targetOrVersion : null;
const version = target === "platform" ? possibleVersion : targetOrVersion;

if (
	!version ||
	!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
	!(
		["loader", "platforms", "release"].includes(target) ||
		platformKey in PLATFORMS
	)
) {
	throw new Error(
		"Usage: node scripts/set-version.js loader|platforms|release <semver> | platform <key> <semver>",
	);
}

const loaderFile = path.join(ROOT, "packages", "postgres", "package.json");
const loader = readJson(loaderFile);

if (target === "loader" || target === "release") {
	loader.version = version;
}

const selectedKeys =
	target === "platform"
		? [platformKey]
		: ["platforms", "release"].includes(target)
			? Object.keys(PLATFORMS)
			: [];

for (const key of selectedKeys) {
	const file = path.join(ROOT, "binaries", key, "package.json");
	const pkg = readJson(file);
	pkg.version = version;
	writeJson(file, pkg);
	loader.optionalDependencies[pkg.name] = version;

	const manifestFile = path.join(ROOT, "binaries", key, "build-manifest.json");
	const manifest = readJson(manifestFile);
	manifest.distribution = version;
	writeJson(manifestFile, manifest);

	fs.writeFileSync(
		path.join(ROOT, "binaries", key, "README.md"),
		`# ${pkg.name}\n\n` +
			`Distribution package ${version}, containing PostgreSQL ${sourceLock.postgresql} for ${key}. ` +
			`The runtime payload is sourced from a release built by ` +
			`[theseus-rs/postgresql-binaries](${sourceLock.upstream}).\n\n` +
			"Development headers, static/import libraries, and pkg-config files are excluded, as " +
			"are StackBuilder files on Windows; PostgreSQL programs and runtime features are retained.\n\n" +
			"Do not depend on this package directly. Use `@serve-tools/postgres`, which selects " +
			"the matching platform package via `optionalDependencies`.\n",
	);
}

writeJson(loaderFile, loader);

const lockFile = path.join(ROOT, "package-lock.json");
const packageLock = readJson(lockFile);
packageLock.packages["packages/postgres"].version = loader.version;
packageLock.packages["packages/postgres"].optionalDependencies =
	loader.optionalDependencies;
writeJson(lockFile, packageLock);

console.log(
	`set ${target}${platformKey ? ` ${platformKey}` : ""} distribution to ${version}`,
);
