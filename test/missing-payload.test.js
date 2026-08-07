import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";

import { createEphemeralCluster, pgHome } from "../packages/postgres/index.js";

test("a missing development payload fails clearly without creating temp directories", async (t) => {
	try {
		pgHome();
		t.skip("the local PostgreSQL payload has been imported");
		return;
	} catch {
		// Exercise the clean-checkout path below.
	}

	const before = temporaryClusters();
	await assert.rejects(
		createEphemeralCluster(),
		/PostgreSQL payload is missing.*import-binaries\.js/s,
	);
	assert.deepEqual(temporaryClusters(), before);
});

function temporaryClusters() {
	return fs
		.readdirSync(os.tmpdir())
		.filter((name) => name.startsWith("serve-tools-pg-"))
		.sort();
}
