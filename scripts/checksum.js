/** Extract one unambiguous SHA-256 digest from an upstream checksum response. */
export function parseSha256(text, source = "checksum response") {
	const matches = text.match(/\b[a-f\d]{64}\b/gi) ?? [];
	if (matches.length !== 1) {
		throw new Error(
			`${source} must contain exactly one SHA-256 digest; found ${matches.length}`,
		);
	}
	return matches[0].toLowerCase();
}
