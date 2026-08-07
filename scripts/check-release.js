/** Validate the complete local package family without invoking npm. */

import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { detectNativeArchitecture } from "./native-architecture.js";
import { payloadIntegrity } from "./payload-integrity.js";
import {
	findExcludedPayloadEntries,
	PAYLOAD_PROFILE,
	payloadExclusions,
} from "./payload-policy.js";
import { PLATFORMS } from "./platform-matrix.js";
import { readSourceLock } from "./source-lock.js";

const DEFAULT_ROOT = path.join(import.meta.dirname, "..");
const REQUIRED_PROGRAMS = ["initdb", "pg_ctl", "postgres", "psql"];
const EXPECTED_FILES = ["build-manifest.json", "LICENSE.md", "pg", "README.md"];
const EXPECTED_LOADER_FILES = [
	"index.js",
	"index.d.ts",
	"LICENSE.md",
	"platforms.js",
	"postgresql-version.js",
	"README.md",
];
const EXPECTED_PUBLISH_CONFIG = {
	access: "public",
	provenance: true,
	registry: "https://registry.npmjs.org/",
};
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function validateRelease(
	root = DEFAULT_ROOT,
	{ requirePayloads = true, requireRepository = false } = {},
) {
	const failures = [];
	const check = (condition, message) => {
		if (!condition) failures.push(message);
	};
	let sourceLock;
	let releaseConfig;
	try {
		sourceLock = readSourceLock(root);
		releaseConfig = JSON.parse(
			fs.readFileSync(path.join(root, "release-config.json"), "utf8"),
		);
	} catch (error) {
		failures.push(`release configuration: ${error.message}`);
		throwFailures(failures);
	}
	check(
		releaseConfig.formatVersion === 1,
		"release configuration format is unsupported",
	);
	check(
		releaseConfig.npmScope === "@serve-tools",
		"release npm scope is incorrect",
	);
	check(
		releaseConfig.publishWorkflow === "publish.yml",
		"publish workflow identity is incorrect",
	);
	check(
		releaseConfig.npmEnvironment === "npm",
		"npm environment identity is incorrect",
	);
	if (requireRepository) {
		check(
			Boolean(releaseConfig.repository),
			"public repository has not been configured",
		);
	}
	for (const required of [
		"README.md",
		"LICENSE.md",
		"SECURITY.md",
		"SUPPORT.md",
		"CONTRIBUTING.md",
		"RELEASING.md",
		"CHANGELOG.md",
	]) {
		check(
			fs.existsSync(path.join(root, required)),
			`repository policy file is missing: ${required}`,
		);
	}
	const rootPackage = readJson(path.join(root, "package.json"), failures);
	if (rootPackage) {
		check(
			rootPackage.name === "@serve-tools/postgres-workspace",
			"workspace name is incorrect",
		);
		check(rootPackage.private === true, "workspace must remain private");
		check(
			rootPackage.packageManager === "npm@11.18.0",
			"workspace npm version is incorrect",
		);
		check(
			rootPackage.devEngines?.packageManager?.version === ">=11.5.1",
			"workspace minimum npm version is incorrect",
		);
		check(
			isDeepStrictEqual(rootPackage.workspaces, ["packages/*"]),
			"workspace layout is incorrect",
		);
		check(rootPackage.license === "MIT-0", "workspace license is incorrect");
		validateRepositoryMetadata(
			rootPackage,
			null,
			releaseConfig.repository,
			failures,
		);
	}

	const loaderDir = path.join(root, "packages", "postgres");
	const loader = readJson(path.join(loaderDir, "package.json"), failures);
	if (loader) {
		check(
			loader.name === "@serve-tools/postgres",
			"loader package name is incorrect",
		);
		check(loader.license === "MIT-0", "loader license is incorrect");
		check(loader.author === "Jonathan Neal", "loader author is incorrect");
		check(
			loader.engines?.node === ">=22",
			"loader Node.js support range is incorrect",
		);
		check(
			SEMVER.test(loader.version),
			"loader distribution version is not valid SemVer",
		);
		check(
			!("scripts" in loader),
			"loader package must not contain lifecycle scripts",
		);
		check(
			isDeepStrictEqual(loader.publishConfig, EXPECTED_PUBLISH_CONFIG),
			"loader publishConfig is incorrect",
		);
		check(
			isDeepStrictEqual(loader.files, EXPECTED_LOADER_FILES),
			"loader files list is incorrect",
		);
		check(loader.types === "./index.d.ts", "loader types entry is incorrect");
		check(
			loader.sideEffects === false,
			"loader must declare sideEffects false",
		);
		check(
			isDeepStrictEqual(loader.exports, {
				".": {
					types: "./index.d.ts",
					import: "./index.js",
					default: "./index.js",
				},
			}),
			"loader exports map is incorrect",
		);
		validateRepositoryMetadata(
			loader,
			"packages/postgres",
			releaseConfig.repository,
			failures,
		);
		for (const file of loader.files ?? []) {
			check(
				fs.existsSync(path.join(loaderDir, file)),
				`loader package file is missing: ${file}`,
			);
		}
		const versionSource = readText(
			path.join(loaderDir, "postgresql-version.js"),
			failures,
		);
		check(
			versionSource?.includes(
				`postgresqlVersion = ${JSON.stringify(sourceLock.postgresql)}`,
			),
			"loader PostgreSQL version export differs from the source lock",
		);
	}

	const expectedDependencies = {};
	for (const [key, platform] of Object.entries(PLATFORMS)) {
		const pkgDir = path.join(root, "binaries", key);
		const pkg = readJson(path.join(pkgDir, "package.json"), failures);
		if (!pkg) continue;
		expectedDependencies[`@serve-tools/postgres-${key}`] = pkg.version;

		check(
			pkg.name === `@serve-tools/postgres-${key}`,
			`${key}: package name is incorrect`,
		);
		check(pkg.type === "module", `${key}: package type is incorrect`);
		check(pkg.license === "PostgreSQL", `${key}: package license is incorrect`);
		check(
			pkg.author === "Jonathan Neal",
			`${key}: package author is incorrect`,
		);
		check(
			SEMVER.test(pkg.version),
			`${key}: distribution version is not valid SemVer`,
		);
		check(
			!("scripts" in pkg),
			`${key}: package must not contain lifecycle scripts`,
		);
		check(
			isDeepStrictEqual(pkg.os, platform.os),
			`${key}: os metadata is incorrect`,
		);
		check(
			isDeepStrictEqual(pkg.cpu, platform.cpu),
			`${key}: cpu metadata is incorrect`,
		);
		check(
			isDeepStrictEqual(pkg.libc, platform.libc),
			`${key}: libc metadata is incorrect`,
		);
		check(
			isDeepStrictEqual(pkg.publishConfig, EXPECTED_PUBLISH_CONFIG),
			`${key}: publishConfig is incorrect`,
		);
		check(
			isDeepStrictEqual(pkg.files, EXPECTED_FILES),
			`${key}: files list is incorrect`,
		);
		validateRepositoryMetadata(
			pkg,
			`binaries/${key}`,
			releaseConfig.repository,
			failures,
		);
		for (const file of pkg.files ?? []) {
			if (file !== "pg" || requirePayloads) {
				check(
					fs.existsSync(path.join(pkgDir, file)),
					`${key}: package file is missing: ${file}`,
				);
			}
		}

		const archive = sourceLock.archives[key];
		const expectedManifest = {
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
			archive: { url: archive.url, sha256: archive.sha256 },
			payload: {
				profile: PAYLOAD_PROFILE,
				excluded: payloadExclusions(key),
			},
			upstream: sourceLock.upstream,
		};
		const manifest = readJson(
			path.join(pkgDir, "build-manifest.json"),
			failures,
		);
		const integrity = manifest?.payload?.integrity;
		expectedManifest.payload.integrity = integrity;
		check(
			isDeepStrictEqual(manifest, expectedManifest),
			`${key}: build manifest differs from package metadata or source lock`,
		);
		check(
			integrity?.algorithm === "sha256-tree-v1" &&
				Number.isSafeInteger(integrity.entries) &&
				integrity.entries > 0 &&
				Number.isSafeInteger(integrity.bytes) &&
				integrity.bytes > 0 &&
				/^[a-f\d]{64}$/.test(integrity.sha256),
			`${key}: payload integrity record is invalid`,
		);

		if (requirePayloads) {
			validatePayload(pkgDir, key, platform.cpu[0], failures);
			try {
				check(
					isDeepStrictEqual(
						payloadIntegrity(path.join(pkgDir, "pg")),
						integrity,
					),
					`${key}: payload tree differs from its build manifest`,
				);
			} catch (error) {
				failures.push(`${key}: cannot hash payload tree (${error.message})`);
			}
		}
	}

	if (loader) {
		check(
			isDeepStrictEqual(loader.optionalDependencies, expectedDependencies),
			"loader optionalDependencies do not exactly pin every platform distribution",
		);
	}

	throwFailures(failures);
	return {
		platforms: Object.keys(PLATFORMS).length,
		postgresql: sourceLock.postgresql,
	};
}

function validateRepositoryMetadata(pkg, directory, repository, failures) {
	const label = directory ? pkg.name : "workspace";
	if (!repository) {
		if (pkg.repository || pkg.homepage || pkg.bugs) {
			failures.push(
				`${label}: repository metadata exists before release configuration`,
			);
		}
		return;
	}
	if (
		!isDeepStrictEqual(pkg.repository, {
			type: "git",
			url: `${repository}.git`,
			...(directory ? { directory } : {}),
		})
	) {
		failures.push(`${label}: repository metadata is incorrect`);
	}
	if (pkg.homepage !== `${repository}#readme`) {
		failures.push(`${label}: homepage is incorrect`);
	}
	if (!isDeepStrictEqual(pkg.bugs, { url: `${repository}/issues` })) {
		failures.push(`${label}: bugs URL is incorrect`);
	}
}

function validatePayload(pkgDir, key, expectedArchitecture, failures) {
	const pgDir = path.join(pkgDir, "pg");
	const suffix = key.startsWith("win32-") ? ".exe" : "";
	for (const entry of findExcludedPayloadEntries(pgDir, key)) {
		failures.push(
			`${key}: payload contains excluded runtime-profile entry: ${entry}`,
		);
	}
	const licenseFile = ["COPYRIGHT", "LICENSE"].find((name) =>
		fs.statSync(path.join(pgDir, name), { throwIfNoEntry: false })?.isFile(),
	);
	if (!licenseFile) failures.push(`${key}: PostgreSQL license file is missing`);
	const primaryLicense = path.join(
		pgDir,
		key === "win32-x64" ? "server_license.txt" : "COPYRIGHT",
	);
	try {
		if (
			!fs
				.readFileSync(path.join(pkgDir, "LICENSE.md"))
				.equals(fs.readFileSync(primaryLicense))
		) {
			failures.push(`${key}: package license copy differs from the payload`);
		}
	} catch (error) {
		failures.push(
			`${key}: cannot validate package license copy (${error.message})`,
		);
	}
	for (const program of REQUIRED_PROGRAMS) {
		const label = `${program}${suffix}`;
		const file = path.join(pgDir, "bin", label);
		if (!checkFile(file, `${key}: ${label}`, failures)) continue;
		if (!key.startsWith("win32-") && (fs.statSync(file).mode & 0o111) === 0) {
			failures.push(`${key}: ${label} is not executable`);
		}
		try {
			const actual = detectNativeArchitecture(file);
			if (actual !== expectedArchitecture) {
				failures.push(
					`${key}: ${label} is ${actual}, expected ${expectedArchitecture}`,
				);
			}
		} catch (error) {
			failures.push(`${key}: cannot inspect ${label}: ${error.message}`);
		}
	}
}

function checkFile(file, label, failures) {
	try {
		const stat = fs.statSync(file);
		if (!stat.isFile() || stat.size === 0)
			throw new Error("not a non-empty file");
		return true;
	} catch (error) {
		failures.push(`${label} is missing or invalid (${error.message})`);
		return false;
	}
}

function readJson(file, failures) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (error) {
		failures.push(`${path.relative(DEFAULT_ROOT, file)}: ${error.message}`);
		return null;
	}
}

function readText(file, failures) {
	try {
		return fs.readFileSync(file, "utf8");
	} catch (error) {
		failures.push(`${path.relative(DEFAULT_ROOT, file)}: ${error.message}`);
		return null;
	}
}

function throwFailures(failures) {
	if (failures.length)
		throw new Error(`Release validation failed:\n- ${failures.join("\n- ")}`);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
	try {
		const result = validateRelease(DEFAULT_ROOT, {
			requirePayloads: !process.argv.includes("--metadata-only"),
			requireRepository: process.argv.includes("--publish"),
		});
		console.log(
			`release inputs valid: PostgreSQL ${result.postgresql}, ${result.platforms} platform packages`,
		);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
