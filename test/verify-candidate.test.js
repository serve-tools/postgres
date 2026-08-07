import assert from "node:assert/strict";
import test from "node:test";

import { parseTarListing } from "../scripts/tar-listing.js";

test("tar listings accept Windows CRLF output", () => {
	assert.deepEqual(parseTarListing("package/\r\npackage/package.json\r\n"), [
		"package/",
		"package/package.json",
	]);
	assert.deepEqual(parseTarListing("package/unsafe\rname\n"), [
		"package/unsafe\rname",
	]);
});
