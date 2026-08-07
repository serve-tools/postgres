import assert from "node:assert/strict";
import test from "node:test";

import { binPath, createEphemeralCluster } from "../packages/postgres/index.js";

test("binPath accepts only an executable basename", () => {
	for (const invalid of [
		"",
		"../postgres",
		"bin/postgres",
		"postgres.exe",
		".postgres",
		42,
	]) {
		assert.throws(
			() => binPath(invalid),
			/PostgreSQL executable name must be a basename without an extension/,
			String(invalid),
		);
	}
});

test("createEphemeralCluster rejects invalid bootstrap roles before touching the payload", async () => {
	for (const user of ["", "invalid\0role", 42]) {
		await assert.rejects(
			createEphemeralCluster({ user }),
			/PostgreSQL bootstrap user must be a non-empty string without NUL bytes/,
		);
	}
});
