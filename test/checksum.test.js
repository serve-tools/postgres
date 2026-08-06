import assert from "node:assert/strict";
import test from "node:test";

import { parseSha256 } from "../scripts/checksum.js";

const digest =
	"4099dcf71c74bed82736e17928d07591df0efee8f802449533b9557d99ae7988";

test("checksum parser accepts sha256sum output", () => {
	assert.equal(parseSha256(`${digest}  postgresql.tar.gz\n`), digest);
});

test("checksum parser accepts Windows CertUtil output", () => {
	assert.equal(
		parseSha256(
			`SHA256 hash of postgresql.tar.gz:\r\n${digest.toUpperCase()}\r\n` +
				"CertUtil: -hashfile command completed successfully.\r\n",
		),
		digest,
	);
});

test("checksum parser rejects missing or ambiguous digests", () => {
	assert.throws(() => parseSha256("SHA256"), /found 0/);
	assert.throws(() => parseSha256(`${digest}\n${digest}`), /found 2/);
});
