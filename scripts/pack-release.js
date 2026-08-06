/** Pack an immutable, independently verifiable npm release candidate. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateRelease } from "./check-release.js";
import { readJson, sha256, writeJson } from "./file-utils.js";
import { releasePackages } from "./release-packages.js";

const ROOT = path.join(import.meta.dirname, "..");
const npmExecPath = process.env.npm_execpath;
if (!npmExecPath)
	throw new Error("Run the release packer through an npm package script");

const dryRun = process.argv.includes("--dry-run");
const releaseMode = process.argv.includes("--release");
const destinationArgument = process.argv.find((argument) =>
	argument.startsWith("--destination="),
);
const destination = destinationArgument
	? path.resolve(destinationArgument.slice("--destination=".length))
	: path.join(ROOT, "release");
const destinationRelative = path.relative(ROOT, destination);
if (
	!destinationRelative ||
	destinationRelative.startsWith("..") ||
	path.isAbsolute(destinationRelative)
) {
	throw new Error(
		"Candidate destination must be a child of the repository root",
	);
}

validateRelease(ROOT, {
	requirePayloads: true,
	requireRepository: releaseMode,
});
const sourceCommit = process.env.GITHUB_SHA ?? null;
if (releaseMode && !/^[a-f\d]{40}$/.test(sourceCommit ?? "")) {
	throw new Error(
		"Release candidates require the exact GITHUB_SHA source commit",
	);
}

const transaction = fs.mkdtempSync(
	path.join(os.tmpdir(), "serve-tools-postgres-pack-"),
);
const candidate = path.join(transaction, "candidate");
const npmCache = path.join(transaction, "npm-cache");
fs.mkdirSync(candidate);

try {
	const packages = [];
	for (const definition of releasePackages(ROOT)) {
		const pkg = readJson(path.join(definition.directory, "package.json"));
		const output = command(
			process.execPath,
			[
				npmExecPath,
				"pack",
				definition.directory,
				"--json",
				"--pack-destination",
				candidate,
			],
			{
				env: {
					...process.env,
					npm_config_cache: npmCache,
					npm_config_update_notifier: "false",
				},
			},
		);
		const [packed] = JSON.parse(output);
		if (packed.name !== pkg.name || packed.version !== pkg.version) {
			throw new Error(
				`${definition.name} packed unexpected identity ${packed.id}`,
			);
		}
		assertDeclaredFilesPacked(pkg, packed.files);

		const tarball = path.join(candidate, packed.filename);
		packages.push({
			name: pkg.name,
			version: pkg.version,
			filename: packed.filename,
			bytes: fs.statSync(tarball).size,
			sha256: sha256(tarball),
			integrity: packed.integrity,
			optionalDependencies: pkg.optionalDependencies,
			os: pkg.os,
			cpu: pkg.cpu,
			libc: pkg.libc,
			files: packed.files.map(({ path: file, size }) => ({
				path: file,
				bytes: size,
			})),
			buildManifest: definition.platform
				? readJson(path.join(definition.directory, "build-manifest.json"))
				: undefined,
		});
		console.log(`packed ${packed.id}`);
	}

	for (const filename of ["postgresql-binaries.lock.json", "SECURITY.md"]) {
		fs.copyFileSync(path.join(ROOT, filename), path.join(candidate, filename));
	}
	const loader = packages.at(-1);
	const manifest = {
		formatVersion: 1,
		scope: releaseMode ? "release" : "local",
		sourceCommit,
		loaderVersion: loader.version,
		postgresql: readJson(path.join(ROOT, "postgresql-binaries.lock.json"))
			.postgresql,
		packages,
		sourceLock: fileRecord(
			path.join(candidate, "postgresql-binaries.lock.json"),
		),
		securityPolicy: fileRecord(path.join(candidate, "SECURITY.md")),
	};
	writeJson(path.join(candidate, "candidate-manifest.json"), manifest);
	command(
		process.execPath,
		[path.join(ROOT, "scripts", "verify-candidate.js"), candidate],
		{
			stdio: "inherit",
		},
	);

	if (dryRun) {
		console.log("release candidate verified without retaining artifacts");
	} else {
		const next = `${destination}.${process.pid}.next`;
		const backup = `${destination}.${process.pid}.backup`;
		fs.rmSync(next, { recursive: true, force: true });
		fs.renameSync(candidate, next);
		let backedUp = false;
		try {
			if (fs.existsSync(destination)) {
				fs.renameSync(destination, backup);
				backedUp = true;
			}
			fs.renameSync(next, destination);
			if (backedUp) fs.rmSync(backup, { recursive: true, force: true });
		} catch (error) {
			if (backedUp && !fs.existsSync(destination))
				fs.renameSync(backup, destination);
			throw error;
		} finally {
			fs.rmSync(next, { recursive: true, force: true });
		}
		console.log(`candidate written to ${destination}`);
	}
} finally {
	fs.rmSync(transaction, { recursive: true, force: true });
}

function assertDeclaredFilesPacked(pkg, packedFiles) {
	const paths = packedFiles.map(({ path: file }) => file);
	for (const declared of pkg.files) {
		if (
			!paths.some(
				(file) => file === declared || file.startsWith(`${declared}/`),
			)
		) {
			throw new Error(
				`${pkg.name} omitted declared package content: ${declared}`,
			);
		}
	}
}

function fileRecord(file) {
	return {
		filename: path.basename(file),
		bytes: fs.statSync(file).size,
		sha256: sha256(file),
	};
}

function command(executable, args, options = {}) {
	const result = spawnSync(executable, args, {
		cwd: ROOT,
		encoding: "utf8",
		...options,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		if (result.stdout) process.stdout.write(result.stdout);
		if (result.stderr) process.stderr.write(result.stderr);
		throw new Error(
			`${path.basename(executable)} exited with status ${result.status}`,
		);
	}
	return result.stdout?.trim() ?? "";
}
