import fs from "node:fs";
import path from "node:path";

export const PAYLOAD_PROFILE = "runtime-v1";

const BASE_EXCLUSIONS = ["include/**", "**/*.a", "**/*.lib", "**/*.pc"];

const WINDOWS_EXCLUSIONS = [
	"StackBuilder/**",
	"bin/stackbuilder.exe",
	"bin/wx*.dll",
];

export function payloadExclusions(platformKey) {
	return platformKey === "win32-x64"
		? [...BASE_EXCLUSIONS, ...WINDOWS_EXCLUSIONS]
		: [...BASE_EXCLUSIONS];
}

/** Remove only development artifacts and Windows StackBuilder files. */
export function prunePayload(root, platformKey) {
	let removedBytes = 0;
	let removedEntries = 0;

	const visit = (directory) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			const relative = toRelative(root, file);

			if (isExcluded(relative, entry.isDirectory(), platformKey)) {
				const measurement = measure(file);
				removedBytes += measurement.bytes;
				removedEntries += measurement.entries;
				fs.rmSync(file, { recursive: entry.isDirectory(), force: true });
			} else if (entry.isDirectory()) {
				visit(file);
			}
		}
	};

	visit(root);
	return { removedBytes, removedEntries };
}

/** Return forbidden entries left in a supposedly pruned payload. */
export function findExcludedPayloadEntries(root, platformKey) {
	const found = [];
	if (!fs.existsSync(root)) return found;

	const visit = (directory) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			const relative = toRelative(root, file);
			if (isExcluded(relative, entry.isDirectory(), platformKey)) {
				found.push(relative);
			} else if (entry.isDirectory()) {
				visit(file);
			}
		}
	};

	visit(root);
	return found.sort();
}

function isExcluded(relative, directory, platformKey) {
	if (directory && relative === "include") return true;

	const extension = path.posix.extname(relative).toLowerCase();
	if (!directory && [".a", ".lib", ".pc"].includes(extension)) return true;

	if (platformKey !== "win32-x64") return false;
	if (directory && relative === "StackBuilder") return true;
	if (!directory && relative === "bin/stackbuilder.exe") return true;
	return !directory && /^bin\/wx.*\.dll$/i.test(relative);
}

function measure(file) {
	const stat = fs.lstatSync(file);
	if (!stat.isDirectory()) return { bytes: stat.size, entries: 1 };

	let bytes = 0;
	let entries = 1;
	for (const entry of fs.readdirSync(file)) {
		const child = measure(path.join(file, entry));
		bytes += child.bytes;
		entries += child.entries;
	}
	return { bytes, entries };
}

function toRelative(root, file) {
	return path.relative(root, file).split(path.sep).join("/");
}
