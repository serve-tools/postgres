/** Import the PostgreSQL archives pinned in postgresql-binaries.lock.json.
 *
 * This command deliberately does not read live upstream checksum files. Updating
 * the reviewed source lock is a separate, explicit operation.
 *
 * Usage:
 *   node scripts/import-binaries.js                         # current platform
 *   node scripts/import-binaries.js --all                   # full matrix
 *   node scripts/import-binaries.js --platform darwin-arm64 --platform linux-x64-gnu
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { detectPlatformKey } from "../packages/postgres/platforms.js";
import { sha256, writeJson } from "./file-utils.js";
import { detectNativeArchitecture } from "./native-architecture.js";
import { hasUnsafePathCharacter } from "./path-safety.js";
import { payloadIntegrity } from "./payload-integrity.js";
import {
	PAYLOAD_PROFILE,
	payloadExclusions,
	prunePayload,
} from "./payload-policy.js";
import { PLATFORMS } from "./platform-matrix.js";
import { readSourceLock } from "./source-lock.js";
import { parseTarListing } from "./tar-listing.js";

const ROOT = path.join(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache");
const REQUIRED_PROGRAMS = ["initdb", "pg_ctl", "postgres", "psql"];
const PUBLISH_CONFIG = {
	access: "public",
	provenance: true,
	registry: "https://registry.npmjs.org/",
};

const { values: args } = parseArgs({
	options: {
		all: { type: "boolean", default: false },
		platform: { type: "string", multiple: true },
	},
});
const sourceLock = readSourceLock(ROOT);
const keys = args.all
	? Object.keys(PLATFORMS)
	: (args.platform ?? [detectPlatformKey()].filter(Boolean));

if (keys.length === 0) {
	throw new Error(
		"No supported platform detected; pass --platform <key> explicitly.",
	);
}
for (const key of keys) {
	if (!(key in PLATFORMS)) throw new Error(`Unknown platform key: ${key}`);
}

fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const key of keys) await importPlatform(key);

async function importPlatform(key) {
	const platform = PLATFORMS[key];
	const archive = sourceLock.archives[key];
	const archiveName = path.basename(new URL(archive.url).pathname);
	const archivePath = path.join(CACHE_DIR, archiveName);

	await download(archive.url, archivePath);
	const actual = sha256(archivePath);
	if (actual !== archive.sha256) {
		fs.rmSync(archivePath, { force: true });
		throw new Error(
			`[${key}] cached archive sha256 mismatch: expected ${archive.sha256}, got ${actual}; ` +
				"the corrupt cache entry was removed, rerun the import",
		);
	}
	console.log(`[${key}] reviewed sha256 verified: ${actual}`);

	const pkgDir = path.join(ROOT, "binaries", key);
	const livePgDir = path.join(pkgDir, "pg");
	const stagingDir = fs.mkdtempSync(path.join(pkgDir, ".binary-import-"));
	const nextPgDir = path.join(stagingDir, "pg");
	const previousPgDir = path.join(stagingDir, "previous-pg");
	fs.mkdirSync(nextPgDir);

	try {
		validateArchivePaths(archivePath, key);
		extract(archivePath, nextPgDir, key);
		validateExtractedTree(nextPgDir, key);
		const pruning = prunePayload(nextPgDir, key);
		validatePayload(nextPgDir, key, platform.cpu[0]);
		const integrity = payloadIntegrity(nextPgDir);

		installPayloadAndMetadata({
			archive,
			integrity,
			key,
			livePgDir,
			nextPgDir,
			pkgDir,
			platform,
			previousPgDir,
		});
		console.log(
			`[${key}] imported PostgreSQL ${sourceLock.postgresql}; ` +
				`pruned ${pruning.removedEntries} development entries ` +
				`(${(pruning.removedBytes / 1024 / 1024).toFixed(1)} MiB)`,
		);
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

function installPayloadAndMetadata({
	archive,
	integrity,
	key,
	livePgDir,
	nextPgDir,
	pkgDir,
	platform,
	previousPgDir,
}) {
	const metadataFiles = [
		"package.json",
		"LICENSE.md",
		"build-manifest.json",
		"README.md",
	].map((file) => path.join(pkgDir, file));
	const metadata = new Map(
		metadataFiles.map((file) => [
			file,
			fs.existsSync(file) ? fs.readFileSync(file) : null,
		]),
	);
	let installed = false;
	try {
		if (fs.existsSync(livePgDir)) fs.renameSync(livePgDir, previousPgDir);
		fs.renameSync(nextPgDir, livePgDir);
		installed = true;
		writePlatformMetadata(pkgDir, key, platform, archive, integrity);
	} catch (error) {
		const rollbackErrors = [];
		try {
			if (installed) fs.rmSync(livePgDir, { recursive: true, force: true });
			if (fs.existsSync(previousPgDir)) fs.renameSync(previousPgDir, livePgDir);
		} catch (rollbackError) {
			rollbackErrors.push(rollbackError);
		}
		for (const [file, contents] of metadata) {
			try {
				if (contents === null) fs.rmSync(file, { force: true });
				else fs.writeFileSync(file, contents);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		if (rollbackErrors.length) {
			throw new AggregateError(
				[error, ...rollbackErrors],
				`[${key}] import failed and rollback was incomplete`,
			);
		}
		throw error;
	}
}

function validateArchivePaths(archivePath, key) {
	const result = spawnSync("tar", ["-tzf", archivePath], {
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`[${key}] cannot list archive members`);

	const names = parseTarListing(result.stdout);
	if (names.length === 0) throw new Error(`[${key}] archive is empty`);
	const roots = new Set();
	for (const name of names) {
		const parts = name.split("/").filter(Boolean);
		if (
			name.startsWith("/") ||
			parts.includes("..") ||
			hasUnsafePathCharacter(name)
		) {
			throw new Error(
				`[${key}] archive contains an unsafe member path: ${JSON.stringify(name)}`,
			);
		}
		if (parts[0]) roots.add(parts[0]);
	}
	if (roots.size !== 1) {
		throw new Error(
			`[${key}] archive must contain exactly one top-level directory`,
		);
	}
}

function extract(archivePath, destination, key) {
	const result = spawnSync(
		"tar",
		["-xzf", archivePath, "-C", destination, "--strip-components", "1"],
		{ stdio: "inherit" },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`[${key}] tar extraction failed`);
}

function validateExtractedTree(root, key) {
	const canonicalRoot = `${fs.realpathSync(root)}${path.sep}`;
	const visit = (directory) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				visit(file);
			} else if (entry.isSymbolicLink()) {
				let target;
				try {
					target = fs.realpathSync(file);
				} catch (error) {
					throw new Error(
						`[${key}] archive contains an invalid symlink: ${file}`,
						{
							cause: error,
						},
					);
				}
				if (
					target !== canonicalRoot.slice(0, -1) &&
					!target.startsWith(canonicalRoot)
				) {
					throw new Error(
						`[${key}] archive symlink escapes the payload: ${file}`,
					);
				}
			} else if (!entry.isFile()) {
				throw new Error(
					`[${key}] archive contains an unsupported entry: ${file}`,
				);
			}
		}
	};
	visit(root);
}

function validatePayload(pgDir, key, expectedArchitecture) {
	const suffix = key.startsWith("win32-") ? ".exe" : "";
	for (const program of REQUIRED_PROGRAMS) {
		const file = path.join(pgDir, "bin", `${program}${suffix}`);
		const stat = fs.statSync(file, { throwIfNoEntry: false });
		if (!stat?.isFile() || stat.size === 0) {
			throw new Error(
				`[${key}] required executable is missing or empty: ${program}${suffix}`,
			);
		}
		const actualArchitecture = detectNativeArchitecture(file);
		if (actualArchitecture !== expectedArchitecture) {
			throw new Error(
				`[${key}] ${program}${suffix} is ${actualArchitecture}, expected ${expectedArchitecture}`,
			);
		}
	}
	const license = ["COPYRIGHT", "LICENSE"].find((name) =>
		fs.statSync(path.join(pgDir, name), { throwIfNoEntry: false })?.isFile(),
	);
	if (!license) {
		throw new Error(`[${key}] PostgreSQL license file is missing`);
	}
}

function writePlatformMetadata(pkgDir, key, platform, archive, integrity) {
	const packageFile = path.join(pkgDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
	Object.assign(pkg, {
		name: `@serve-tools/postgres-${key}`,
		type: "module",
		description: `PostgreSQL ${sourceLock.postgresql} binaries for ${key} (self-contained, no download at install or runtime)`,
		license: "PostgreSQL",
		os: platform.os,
		cpu: platform.cpu,
		publishConfig: PUBLISH_CONFIG,
		files: ["build-manifest.json", "LICENSE.md", "pg", "README.md"],
	});
	if (platform.libc) pkg.libc = platform.libc;
	else delete pkg.libc;
	delete pkg.scripts;
	writeJson(packageFile, pkg);

	const primaryLicense =
		key === "win32-x64"
			? path.join(pkgDir, "pg", "server_license.txt")
			: path.join(pkgDir, "pg", "COPYRIGHT");
	fs.copyFileSync(primaryLicense, path.join(pkgDir, "LICENSE.md"));

	writeJson(path.join(pkgDir, "build-manifest.json"), {
		formatVersion: 1,
		distribution: pkg.version,
		postgresql: sourceLock.postgresql,
		platform: key,
		target: {
			triple: platform.triple,
			os: platform.os[0],
			cpu: platform.cpu[0],
			...(platform.libc ? { libc: platform.libc[0] } : {}),
		},
		archive: {
			url: archive.url,
			sha256: archive.sha256,
		},
		payload: {
			profile: PAYLOAD_PROFILE,
			excluded: payloadExclusions(key),
			integrity,
		},
		upstream: sourceLock.upstream,
	});

	fs.writeFileSync(
		path.join(pkgDir, "README.md"),
		`# @serve-tools/postgres-${key}\n\n` +
			`Distribution package ${pkg.version}, containing PostgreSQL ${sourceLock.postgresql} for ${key}. ` +
			`The runtime payload is sourced from a release built by ` +
			`[theseus-rs/postgresql-binaries](${sourceLock.upstream}).\n\n` +
			"Development headers, static/import libraries, and pkg-config files are excluded, as " +
			"are StackBuilder files on Windows; PostgreSQL programs and runtime features are retained.\n\n" +
			"Do not depend on this package directly. Use `@serve-tools/postgres`, which selects " +
			"the matching platform package via `optionalDependencies`.\n",
	);
}

async function download(url, destination) {
	if (fs.existsSync(destination)) {
		console.log(`  cached: ${path.relative(ROOT, destination)}`);
		return;
	}
	console.log(`  downloading: ${url}`);
	const response = await fetch(url, { redirect: "follow" });
	if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
	const temporary = `${destination}.${process.pid}.tmp`;
	try {
		const bytes = new Uint8Array(await response.arrayBuffer());
		fs.writeFileSync(temporary, bytes, { flag: "wx" });
		fs.renameSync(temporary, destination);
		console.log(`  downloaded ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
	} finally {
		fs.rmSync(temporary, { force: true });
	}
}
