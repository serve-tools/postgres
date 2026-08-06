import fs from "node:fs";

/** Detect the architecture encoded in a 64-bit Mach-O, ELF, or PE executable. */
export function detectNativeArchitecture(file) {
	const bytes = fs.readFileSync(file);
	if (bytes.length < 20) {
		return "unknown";
	}

	const magic = bytes.readUInt32LE(0);
	if (magic === 0xfeedfacf) {
		const cpuType = bytes.readUInt32LE(4);
		if (cpuType === 0x0100000c) return "arm64";
		if (cpuType === 0x01000007) return "x64";
	}

	if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
		const machine = bytes.readUInt16LE(18);
		if (machine === 183) return "arm64";
		if (machine === 62) return "x64";
	}

	if (bytes.subarray(0, 2).toString("ascii") === "MZ" && bytes.length >= 0x40) {
		const peOffset = bytes.readUInt32LE(0x3c);
		if (
			peOffset + 6 <= bytes.length &&
			bytes.subarray(peOffset, peOffset + 4).equals(Buffer.from("PE\0\0"))
		) {
			const machine = bytes.readUInt16LE(peOffset + 4);
			if (machine === 0xaa64) return "arm64";
			if (machine === 0x8664) return "x64";
		}
	}

	return "unknown";
}
