/** Explicitly refresh the reviewed upstream source lock for a PostgreSQL build. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { parseSha256 } from "./checksum.js";
import { writeJson } from "./file-utils.js";
import { archiveUrl, PLATFORMS } from "./platform-matrix.js";
import { validateSourceLock } from "./source-lock.js";

const ROOT = path.join(import.meta.dirname, "..");
const { values: args } = parseArgs({
	options: { version: { type: "string" } },
});

if (!args.version || !/^\d+\.\d+\.\d+$/.test(args.version)) {
	throw new Error(
		"Usage: node scripts/update-source-lock.js --version <postgresql-version>",
	);
}

const archives = {};
for (const [key, platform] of Object.entries(PLATFORMS)) {
	const url = archiveUrl(args.version, key);
	const checksumUrl = `${url}.sha256`;
	const response = await fetch(checksumUrl, { redirect: "follow" });
	if (!response.ok) {
		throw new Error(`GET ${checksumUrl} → ${response.status}`);
	}
	archives[key] = {
		triple: platform.triple,
		url,
		sha256: parseSha256(await response.text(), checksumUrl),
	};
}

const lock = {
	formatVersion: 1,
	postgresql: args.version,
	upstream: "https://github.com/theseus-rs/postgresql-binaries",
	archives,
};
validateSourceLock(lock);
writeJson(path.join(ROOT, "postgresql-binaries.lock.json"), lock);
fs.writeFileSync(
	path.join(ROOT, "packages", "postgres", "postgresql-version.js"),
	`/** PostgreSQL payload version selected by the reviewed source lock. */\n` +
		`export const postgresqlVersion = ${JSON.stringify(args.version)};\n`,
);
console.log(
	`updated PostgreSQL source lock to ${args.version}; review every digest before import`,
);
