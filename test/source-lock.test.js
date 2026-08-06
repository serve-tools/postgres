import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { PLATFORMS } from "../scripts/platform-matrix.js";
import { readSourceLock, validateSourceLock } from "../scripts/source-lock.js";

const ROOT = path.join(import.meta.dirname, "..");

test("the reviewed source lock covers the platform matrix", () => {
	const lock = readSourceLock(ROOT);
	assert.deepEqual(Object.keys(lock.archives), Object.keys(PLATFORMS));
	assert.equal(lock.postgresql, "18.4.0");
});

test("source-lock validation rejects an unreviewed digest shape", () => {
	const lock = structuredClone(readSourceLock(ROOT));
	lock.archives["darwin-arm64"].sha256 = "unreviewed";
	assert.throws(() => validateSourceLock(lock), /sha256 is invalid/);
});
