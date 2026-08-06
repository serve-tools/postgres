/** @serve-tools/postgres — self-contained PostgreSQL binaries for Node.js.
 *
 * Resolves the platform-matching `@serve-tools/postgres-<key>` package
 * (installed via optionalDependencies) and exposes paths to its binaries,
 * plus a minimal ephemeral-cluster helper for tests and dev servers.
 *
 * No postinstall scripts, no downloads at install or runtime: the binaries
 * are inside the platform package, pinned by the lockfile.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import { detectPlatformKey } from "./platforms.js";

export { postgresqlVersion } from "./postgresql-version.js";

const require = createRequire(import.meta.url);
const isWindows = process.platform === "win32";
const exeSuffix = isWindows ? ".exe" : "";

/** Absolute path to the platform package's unpacked PostgreSQL tree. */
export function pgHome() {
	const key = detectPlatformKey();

	if (!key) {
		throw new Error(
			`Unsupported platform: ${process.platform}-${process.arch}`,
		);
	}

	const packageName = `@serve-tools/postgres-${key}`;
	const candidates = [];

	// Published layout: resolve the sibling platform package. In a development
	// workspace this can resolve before the gitignored binary payload is imported,
	// so the expected executable is checked below.
	try {
		const pkg = require.resolve(`${packageName}/package.json`);
		candidates.push(path.join(path.dirname(pkg), "pg"));
	} catch (error) {
		if (error?.code !== "MODULE_NOT_FOUND") {
			throw error;
		}
	}

	// Development layout: binaries/<key>/pg within this repository.
	candidates.push(
		path.join(import.meta.dirname, "..", "..", "binaries", key, "pg"),
	);

	for (const candidate of candidates) {
		if (fs.existsSync(path.join(candidate, "bin", `initdb${exeSuffix}`))) {
			return candidate;
		}
	}

	throw new Error(
		`${packageName} is not installed or its PostgreSQL payload is missing. ` +
			"Run: node scripts/import-binaries.js",
	);
}

/** Absolute path to a PostgreSQL executable (postgres, initdb, pg_ctl, psql, ...). */
export function binPath(name) {
	if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
		throw new TypeError(
			"PostgreSQL executable name must be a basename without an extension",
		);
	}
	return path.join(pgHome(), "bin", `${name}${exeSuffix}`);
}

/** Create and start a throwaway PostgreSQL cluster.
 *
 * Uses a private Unix socket on Unix and SCRAM-authenticated loopback TCP on
 * Windows. Returns connection details and a stop() that shuts the server down
 * and removes all temporary directories.
 */
export async function createEphemeralCluster({ user = "postgres" } = {}) {
	if (typeof user !== "string" || user.length === 0 || user.includes("\0")) {
		throw new TypeError(
			"PostgreSQL bootstrap user must be a non-empty string without NUL bytes",
		);
	}
	const initdb = binPath("initdb");
	const pgCtl = binPath("pg_ctl");
	const psql = binPath("psql");
	const password = isWindows ? randomBytes(32).toString("base64url") : null;
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "serve-tools-pg-"));
	let socketDir = null;
	const database = "postgres";
	let port = null;

	try {
		socketDir = isWindows
			? null
			: fs.mkdtempSync(path.join(os.tmpdir(), "serve-tools-pgsock-"));
		initializeDatabase(initdb, dataDir, user, password);
	} catch (error) {
		removeDirectories(dataDir, socketDir);
		throw error;
	}

	try {
		// Keep the unavoidable Windows port-allocation race as short as possible:
		// reserve only after initdb succeeds and immediately before pg_ctl starts.
		port = isWindows ? await availableLoopbackPort() : null;
		writeLocalEndpointConfiguration(dataDir, socketDir, port);
		run(pgCtl, [
			"-D",
			dataDir,
			"-w",
			"-l",
			path.join(dataDir, "server.log"),
			"start",
		]);
	} catch (error) {
		if (canCleanAfterFailedStart(pgCtl, dataDir, error)) {
			removeDirectories(dataDir, socketDir);
		} else {
			error.message += `\nTemporary cluster retained for recovery: ${dataDir}`;
		}

		throw error;
	}

	let stopped = false;
	const host = socketDir ?? "127.0.0.1";
	const stop = async () => {
		if (stopped) return;

		try {
			run(pgCtl, ["-D", dataDir, "-w", "-m", "fast", "stop"]);
		} catch (error) {
			const status = spawnSync(pgCtl, ["-D", dataDir, "status"], {
				encoding: "utf8",
			});
			if (status.error || status.status !== 3) throw error;
		}

		removeDirectories(dataDir, socketDir);
		stopped = true;
	};
	const connection = {
		host,
		...(port === null ? {} : { port }),
		...(password === null ? {} : { password }),
		user,
		username: user,
		database,
	};

	return {
		user,
		socketDir,
		port,
		dataDir,
		/** Compatible connection fields for node-postgres and postgres.js. */
		connection,
		psql(sqlText, targetDatabase = database) {
			const connectionArgs = [
				"-h",
				host,
				...(port === null ? [] : ["-p", String(port)]),
			];
			const res = spawnSync(
				psql,
				[
					...connectionArgs,
					"-U",
					user,
					"-d",
					targetDatabase,
					"-XAt",
					"-c",
					sqlText,
				],
				{
					encoding: "utf8",
					maxBuffer: 16 * 1024 * 1024,
					env: {
						...process.env,
						...(password === null ? {} : { PGPASSWORD: password }),
					},
				},
			);
			assertProcessSucceeded("psql", [], res);
			return res.stdout.trim();
		},
		stop,
		[Symbol.asyncDispose]: stop,
	};
}

function initializeDatabase(initdb, dataDir, user, password) {
	const credentialDir = password
		? fs.mkdtempSync(path.join(os.tmpdir(), "serve-tools-pgsecret-"))
		: null;
	try {
		const passwordFile = credentialDir
			? path.join(credentialDir, "password")
			: null;
		if (passwordFile)
			fs.writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
		run(initdb, [
			"-D",
			dataDir,
			"-U",
			user,
			"--no-locale",
			"-E",
			"UTF8",
			...(passwordFile
				? [
						"--auth-local=reject",
						"--auth-host=scram-sha-256",
						`--pwfile=${passwordFile}`,
					]
				: ["--auth-local=trust", "--auth-host=reject"]),
		]);
	} finally {
		removeDirectories(credentialDir);
	}
}

function writeLocalEndpointConfiguration(dataDir, socketDir, port) {
	const endpoint = socketDir
		? [
				"listen_addresses = ''",
				`unix_socket_directories = '${postgresqlConfigString(socketDir)}'`,
			]
		: ["listen_addresses = '127.0.0.1'", `port = ${port}`];
	fs.appendFileSync(
		path.join(dataDir, "postgresql.conf"),
		`\n# Managed by @serve-tools/postgres\n${endpoint.join("\n")}\n`,
	);
}

function postgresqlConfigString(value) {
	return value.replaceAll("\\", "\\\\").replaceAll("'", "''");
}

function availableLoopbackPort() {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Unable to allocate a loopback port for PostgreSQL"));
				return;
			}
			server.close((error) => (error ? reject(error) : resolve(address.port)));
		});
	});
}

function run(cmd, args) {
	const res = spawnSync(cmd, args, { encoding: "utf8" });

	assertProcessSucceeded(path.basename(cmd), args, res);

	return res;
}

function assertProcessSucceeded(command, args, result) {
	const invocation = [command, ...args].join(" ");

	if (result.error) {
		throw new Error(`${invocation} failed to launch: ${result.error.message}`, {
			cause: result.error,
		});
	}

	if (result.status !== 0) {
		const detail =
			result.stderr ||
			result.stdout ||
			(result.signal
				? `terminated by ${result.signal}`
				: `exit status ${result.status}`);

		throw new Error(`${invocation} failed:\n${detail}`);
	}
}

function canCleanAfterFailedStart(pgCtl, dataDir, error) {
	// A launch failure means pg_ctl never started a server.
	if (error.cause) {
		return true;
	}

	const status = spawnSync(pgCtl, ["-D", dataDir, "status"], {
		encoding: "utf8",
	});

	if (status.error) {
		return false;
	}
	if (status.status === 3) {
		return true;
	}
	if (status.status !== 0) {
		return false;
	}

	const stop = spawnSync(pgCtl, ["-D", dataDir, "-w", "-m", "fast", "stop"], {
		encoding: "utf8",
	});

	return !stop.error && stop.status === 0;
}

function removeDirectories(...directories) {
	for (const directory of directories) {
		if (directory) fs.rmSync(directory, { recursive: true, force: true });
	}
}
