import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Compute a portable digest of every retained payload file and symlink. */
export function payloadIntegrity(root) {
	const records = [];
	let bytes = 0;

	const visit = (directory) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			const relative = path.relative(root, file).split(path.sep).join("/");
			if (entry.isDirectory()) {
				visit(file);
			} else if (entry.isSymbolicLink()) {
				records.push(`${relative}\0link\0${fs.readlinkSync(file)}\n`);
			} else if (entry.isFile()) {
				const contents = fs.readFileSync(file);
				bytes += contents.byteLength;
				records.push(
					`${relative}\0file\0${contents.byteLength}\0` +
						`${createHash("sha256").update(contents).digest("hex")}\n`,
				);
			} else {
				throw new Error(`Unsupported payload entry: ${relative}`);
			}
		}
	};

	visit(root);
	records.sort();
	return {
		algorithm: "sha256-tree-v1",
		entries: records.length,
		bytes,
		sha256: createHash("sha256").update(records.join("")).digest("hex"),
	};
}
