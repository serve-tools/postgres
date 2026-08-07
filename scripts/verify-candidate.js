/** Verify candidate identity, package ordering, hashes, and dependency edges. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { readJson, sha256, sha256Text } from "./file-utils.js";
import { hasUnsafePathCharacter } from "./path-safety.js";
import { publicationOrder } from "./release-packages.js";
import { parseTarListing } from "./tar-listing.js";

const ROOT = path.join(import.meta.dirname, "..");

export function verifyCandidate(candidateDirectory) {
	const candidate = path.resolve(candidateDirectory);
	const manifest = readJson(path.join(candidate, "candidate-manifest.json"));
	assert(
		manifest.formatVersion === 1,
		"candidate manifest format is unsupported",
	);
	assert(
		["local", "release"].includes(manifest.scope),
		"candidate scope is invalid",
	);
	assert(
		manifest.scope !== "release" || /^[a-f\d]{40}$/.test(manifest.sourceCommit),
		"release candidate lacks an exact source commit",
	);
	assert(
		manifest.packages.length === publicationOrder.length,
		"candidate package count is wrong",
	);
	assert(
		isDeepStrictEqual(
			manifest.packages.map(({ name }) => name),
			publicationOrder,
		),
		"candidate package order is wrong",
	);

	const packages = new Map();
	for (const pkg of manifest.packages) {
		assert(
			!packages.has(pkg.name),
			`candidate contains duplicate package ${pkg.name}`,
		);
		packages.set(pkg.name, pkg);
		const tarball = path.join(candidate, pkg.filename);
		assertFile(tarball, pkg.bytes, pkg.sha256);
		assert(
			/^sha512-[A-Za-z0-9+/]+=*$/.test(pkg.integrity),
			`${pkg.name} integrity is invalid`,
		);
		inspectTarball(tarball, pkg);
		const packedPaths = new Set(pkg.files.map(({ path: file }) => file));
		for (const required of ["package.json", "README.md", "LICENSE.md"]) {
			assert(packedPaths.has(required), `${pkg.name} omits ${required}`);
		}
		if (pkg.buildManifest) {
			assert(
				packedPaths.has("build-manifest.json"),
				`${pkg.name} omits provenance`,
			);
			assert(
				pkg.buildManifest.postgresql === manifest.postgresql,
				`${pkg.name} PostgreSQL version differs from the candidate`,
			);
			assert(
				pkg.buildManifest.distribution === pkg.version,
				`${pkg.name} distribution version differs from its manifest`,
			);
		}
	}

	const loader = packages.get("@serve-tools/postgres");
	assert(
		loader?.version === manifest.loaderVersion,
		"candidate loader version is wrong",
	);
	const expectedDependencies = Object.fromEntries(
		publicationOrder
			.slice(0, -1)
			.map((name) => [name, packages.get(name)?.version]),
	);
	assert(
		isDeepStrictEqual(loader.optionalDependencies, expectedDependencies),
		"candidate loader dependency edges are wrong",
	);
	assertFileRecord(candidate, manifest.sourceLock);
	assertFileRecord(candidate, manifest.securityPolicy);
	assert(
		sha256Text(path.join(ROOT, "postgresql-binaries.lock.json")) ===
			sha256Text(path.join(candidate, manifest.sourceLock.filename)),
		"candidate source lock differs from the checked-out source",
	);
	assert(
		sha256Text(path.join(ROOT, "SECURITY.md")) ===
			sha256Text(path.join(candidate, manifest.securityPolicy.filename)),
		"candidate security policy differs from the checked-out source",
	);

	const sourceLock = readJson(
		path.join(candidate, manifest.sourceLock.filename),
	);
	assert(
		sourceLock.postgresql === manifest.postgresql,
		"candidate source lock version is wrong",
	);
	return manifest;
}

function inspectTarball(tarball, expected) {
	const members = parseTarListing(tar(tarball, ["-tzf", tarball]));
	assert(members.length > 0, `${expected.name} tarball is empty`);
	for (const member of members) {
		const segments = member.split("/").filter(Boolean);
		assert(
			member.startsWith("package/") &&
				!segments.includes("..") &&
				!hasUnsafePathCharacter(member),
			`${expected.name} tarball contains an unsafe path`,
		);
	}
	const actualPaths = members
		.filter((member) => !member.endsWith("/"))
		.map((member) => member.slice("package/".length))
		.sort();
	const recordedPaths = expected.files.map(({ path: file }) => file).sort();
	assert(
		isDeepStrictEqual(actualPaths, recordedPaths),
		`${expected.name} recorded file list differs from its tarball`,
	);

	const pkg = JSON.parse(
		tar(tarball, ["-xOzf", tarball, "package/package.json"]),
	);
	for (const field of [
		"name",
		"version",
		"os",
		"cpu",
		"libc",
		"optionalDependencies",
	]) {
		assert(
			isDeepStrictEqual(pkg[field], expected[field]),
			`${expected.name} packed ${field} metadata is inconsistent`,
		);
	}
	assert(!("scripts" in pkg), `${expected.name} packed a lifecycle script`);

	if (expected.buildManifest) {
		const manifest = JSON.parse(
			tar(tarball, ["-xOzf", tarball, "package/build-manifest.json"]),
		);
		assert(
			isDeepStrictEqual(manifest, expected.buildManifest),
			`${expected.name} packed provenance differs from the candidate manifest`,
		);
	}
}

function tar(tarball, args) {
	const result = spawnSync("tar", args, {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`cannot inspect ${path.basename(tarball)}: ${result.stderr || `tar exited ${result.status}`}`,
		);
	}
	return result.stdout;
}

function assertFileRecord(candidate, record) {
	assert(
		record && typeof record.filename === "string",
		"candidate file record is invalid",
	);
	assertFile(
		path.join(candidate, record.filename),
		record.bytes,
		record.sha256,
	);
}

function assertFile(file, bytes, digest) {
	const stat = fs.statSync(file, { throwIfNoEntry: false });
	assert(stat?.isFile(), `candidate file is missing: ${path.basename(file)}`);
	assert(
		stat.size === bytes,
		`candidate file size changed: ${path.basename(file)}`,
	);
	assert(
		sha256(file) === digest,
		`candidate file digest changed: ${path.basename(file)}`,
	);
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
	const directory = process.argv[2] ?? path.join(ROOT, "release");
	const manifest = verifyCandidate(directory);
	console.log(
		`verified ${manifest.scope} candidate (${manifest.packages.length} packages)`,
	);
}
