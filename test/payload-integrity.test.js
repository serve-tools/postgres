import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { payloadIntegrity } from "../scripts/payload-integrity.js";

test("payload integrity is deterministic and detects content changes", (t) => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "serve-tools-payload-integrity-"),
	);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.mkdirSync(path.join(root, "bin"));
	fs.writeFileSync(path.join(root, "bin", "postgres"), "postgres");
	fs.writeFileSync(path.join(root, "COPYRIGHT"), "license");

	const first = payloadIntegrity(root);
	assert.deepEqual(payloadIntegrity(root), first);
	assert.equal(first.algorithm, "sha256-tree-v1");
	assert.equal(first.entries, 2);

	fs.writeFileSync(path.join(root, "bin", "postgres"), "changed");
	assert.notEqual(payloadIntegrity(root).sha256, first.sha256);
});
