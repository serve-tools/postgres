export function hasUnsafePathCharacter(value) {
	return (
		value.includes("\\") ||
		[...value].some((character) => {
			const codePoint = character.codePointAt(0);
			return codePoint < 0x20 || codePoint === 0x7f;
		})
	);
}
