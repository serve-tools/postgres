import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	findExcludedPayloadEntries,
	PAYLOAD_PROFILE,
	payloadExclusions,
	prunePayload,
} from "../scripts/payload-policy.js";

test("runtime payload policy declares only the approved conservative exclusions", () => {
	assert.equal(PAYLOAD_PROFILE, "runtime-v1");
	assert.deepEqual(payloadExclusions("darwin-arm64"), [
		"include/**",
		"**/*.a",
		"**/*.lib",
		"**/*.pc",
	]);
	assert.deepEqual(payloadExclusions("win32-x64"), [
		"include/**",
		"**/*.a",
		"**/*.lib",
		"**/*.pc",
		"StackBuilder/**",
		"bin/stackbuilder.exe",
		"bin/wx*.dll",
	]);
});

test("Windows pruning removes development and StackBuilder files but preserves runtime data", (t) => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "serve-tools-payload-policy-"),
	);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	for (const file of [
		"include/server/postgres.h",
		"lib/libpostgres.a",
		"lib/pkgconfig/libpq.pc",
		"bin/libcurl.lib",
		"StackBuilder/app.txt",
		"bin/stackbuilder.exe",
		"bin/wxbase.dll",
		"bin/postgres.exe",
		"bin/libpq.dll",
		"lib/plpgsql.dll",
		"share/postgres.bki",
		"share/locale/fr/postgres.mo",
		"lib/bitcode/postgres.bc",
		"StackBuilder_3rd_party_licenses.txt",
	]) {
		const target = path.join(root, file);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, file);
	}

	const result = prunePayload(root, "win32-x64");
	assert.ok(result.removedEntries >= 7);
	assert.deepEqual(findExcludedPayloadEntries(root, "win32-x64"), []);

	for (const retained of [
		"bin/postgres.exe",
		"bin/libpq.dll",
		"lib/plpgsql.dll",
		"share/postgres.bki",
		"share/locale/fr/postgres.mo",
		"lib/bitcode/postgres.bc",
		"StackBuilder_3rd_party_licenses.txt",
	]) {
		assert.ok(fs.existsSync(path.join(root, retained)), retained);
	}
});
