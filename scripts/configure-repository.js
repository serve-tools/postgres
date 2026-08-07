/** Configure exact public repository metadata. */
import path from "node:path";
import { parseArgs } from "node:util";

import { readJson, writeJson } from "./file-utils.js";
import { PLATFORMS } from "./platform-matrix.js";

const ROOT = path.join(import.meta.dirname, "..");
const { values } = parseArgs({ options: { repository: { type: "string" } } });
const repository = values.repository?.replace(/\/$/, "");
if (
	!repository ||
	!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
) {
	throw new Error(
		"Usage: node scripts/configure-repository.js " +
			"--repository https://github.com/<owner>/<repository>",
	);
}

const packages = [
	["package.json", null],
	["packages/postgres/package.json", "packages/postgres"],
	...Object.keys(PLATFORMS).map((key) => [
		`binaries/${key}/package.json`,
		`binaries/${key}`,
	]),
];

for (const [relativeFile, directory] of packages) {
	const file = path.join(ROOT, relativeFile);
	const pkg = readJson(file);
	pkg.repository = {
		type: "git",
		url: `${repository}.git`,
		...(directory ? { directory } : {}),
	};
	pkg.homepage = `${repository}#readme`;
	pkg.bugs = { url: `${repository}/issues` };
	writeJson(file, pkg);
}

const configFile = path.join(ROOT, "release-config.json");
const config = readJson(configFile);
config.repository = repository;
writeJson(configFile, config);
console.log(`configured package provenance metadata for ${repository}`);
