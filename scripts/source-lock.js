import path from "node:path";

import { readJson } from "./file-utils.js";
import { archiveUrl, PLATFORMS } from "./platform-matrix.js";

export function readSourceLock(root = path.join(import.meta.dirname, "..")) {
	const file = path.join(root, "postgresql-binaries.lock.json");
	const lock = readJson(file);
	validateSourceLock(lock);
	return lock;
}

export function validateSourceLock(lock) {
	assert(lock?.formatVersion === 1, "source lock has an unsupported format");
	assert(
		/^\d+\.\d+\.\d+$/.test(lock.postgresql),
		"source lock PostgreSQL version is invalid",
	);
	assert(typeof lock.upstream === "string", "source lock upstream is missing");

	const expectedKeys = Object.keys(PLATFORMS);
	const actualKeys = Object.keys(lock.archives ?? {});
	assert(
		JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
		"source lock platform set or order differs from the platform matrix",
	);

	for (const key of expectedKeys) {
		const archive = lock.archives[key];
		assert(
			archive.triple === PLATFORMS[key].triple,
			`${key} source triple is incorrect`,
		);
		assert(
			archive.url === archiveUrl(lock.postgresql, key),
			`${key} source URL is incorrect`,
		);
		assert(
			/^[a-f\d]{64}$/.test(archive.sha256),
			`${key} source sha256 is invalid`,
		);
	}
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}
