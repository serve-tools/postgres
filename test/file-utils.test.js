import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256, sha256Text } from "../scripts/file-utils.js";

test("text hashes ignore Windows line endings without weakening byte hashes", () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "file-utils-test-"));
	const lf = path.join(directory, "lf.txt");
	const crlf = path.join(directory, "crlf.txt");

	try {
		fs.writeFileSync(lf, "one\ntwo\n");
		fs.writeFileSync(crlf, "one\r\ntwo\r\n");
		assert.notEqual(sha256(lf), sha256(crlf));
		assert.equal(sha256Text(lf), sha256Text(crlf));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
