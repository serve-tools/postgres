/** Install and smoke-test the exact packed candidate for the current platform. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { detectPlatformKey } from "../packages/postgres/platforms.js";
import { writeJson } from "./file-utils.js";
import { verifyCandidate } from "./verify-candidate.js";

const ROOT = path.join(import.meta.dirname, "..");
const candidate = path.resolve(process.argv[2] ?? path.join(ROOT, "release"));
const npmExecPath = process.env.npm_execpath;
if (!npmExecPath)
	throw new Error("Run candidate tests through an npm package script");
const platform = detectPlatformKey();
if (!platform)
	throw new Error(
		`Unsupported candidate test platform: ${process.platform}-${process.arch}`,
	);
const manifest = verifyCandidate(candidate);
const temporary = fs.mkdtempSync(
	path.join(os.tmpdir(), "serve-tools-postgres-candidate-"),
);

try {
	const loader = manifest.packages.find(
		({ name }) => name === "@serve-tools/postgres",
	);
	const optionalDependencies = Object.fromEntries(
		manifest.packages
			.filter(({ buildManifest }) => buildManifest)
			.map((pkg) => [pkg.name, `file:${path.join(candidate, pkg.filename)}`]),
	);
	writeJson(path.join(temporary, "package.json"), {
		private: true,
		type: "module",
		dependencies: {
			"@serve-tools/postgres": `file:${path.join(candidate, loader.filename)}`,
		},
		optionalDependencies,
	});
	command(
		process.execPath,
		[
			npmExecPath,
			"install",
			"--ignore-scripts",
			"--offline",
			"--no-audit",
			"--no-fund",
			"--no-package-lock",
		],
		temporary,
	);

	const module = await import(
		pathToFileURL(
			path.join(
				temporary,
				"node_modules",
				"@serve-tools",
				"postgres",
				"index.js",
			),
		)
	);
	const cluster = await module.createEphemeralCluster({
		user: "candidate_user",
	});
	try {
		if (process.platform === "win32" && !cluster.connection.password) {
			throw new Error(
				"candidate Windows connection is not SCRAM-authenticated",
			);
		}
		if (process.platform !== "win32" && cluster.connection.password) {
			throw new Error(
				"candidate Unix socket connection unexpectedly has a password",
			);
		}
		if (cluster.psql("SELECT 6 * 7") !== "42")
			throw new Error("candidate SQL failed");
		if (module.postgresqlVersion !== manifest.postgresql) {
			throw new Error("candidate PostgreSQL version export is wrong");
		}
	} finally {
		await cluster.stop();
		await cluster.stop();
	}
	if (
		fs.existsSync(cluster.dataDir) ||
		(cluster.socketDir && fs.existsSync(cluster.socketDir))
	) {
		throw new Error("candidate cluster did not clean up temporary directories");
	}
	console.log(`candidate smoke passed for ${platform}`);
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}

function command(executable, args, cwd) {
	const result = spawnSync(executable, args, {
		cwd,
		encoding: "utf8",
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`${path.basename(executable)} exited ${result.status}`);
}
