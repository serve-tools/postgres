import { createHash } from "node:crypto";
import fs from "node:fs";

export function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
	fs.writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);
}

export function sha256(file) {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
