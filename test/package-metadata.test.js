import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { PLATFORMS } from "../scripts/platform-matrix.js";
import { readSourceLock } from "../scripts/source-lock.js";

const ROOT = path.join(import.meta.dirname, "..");

test("the workspace and package-family names are unambiguous", () => {
	const rootPackage = readJson("package.json");
	const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

	assert.equal(rootPackage.name, "@serve-tools/postgres-workspace");
	assert.deepEqual(rootPackage.workspaces, ["packages/*"]);
	assert.match(readme, /Serve Tools.*umbrella project/);
	assert.match(readme, /@serve-tools\/http3-native/);
	assert.match(
		readme,
		/GitHub repository, npm organization, and npm packages have not been created/i,
	);
});

test("public-facing documentation contains no prerelease framing", () => {
	const bannedTerms = ["experi" + "mental", "experi" + "ment", "toe" + "-dip"];
	for (const file of [
		"README.md",
		"SECURITY.md",
		"SUPPORT.md",
		"CONTRIBUTING.md",
		"RELEASING.md",
		"packages/postgres/README.md",
	]) {
		const contents = fs.readFileSync(path.join(ROOT, file), "utf8");
		for (const term of bannedTerms) {
			assert.ok(!contents.toLowerCase().includes(term), `${file}: ${term}`);
		}
	}
});

test("loader exactly pins each independently versioned platform package", () => {
	const loader = readJson("packages/postgres/package.json");
	const expected = Object.fromEntries(
		Object.keys(PLATFORMS).map((key) => {
			const pkg = readJson(`binaries/${key}/package.json`);
			return [pkg.name, pkg.version];
		}),
	);

	assert.deepEqual(loader.optionalDependencies, expected);
	assert.notEqual(loader.version, readSourceLock(ROOT).postgresql);
});

test("published packages have no lifecycle scripts", () => {
	assert.ok(!("scripts" in readJson("packages/postgres/package.json")));
	for (const key of Object.keys(PLATFORMS)) {
		assert.ok(!("scripts" in readJson(`binaries/${key}/package.json`)), key);
	}
});

test("every declared loader package file exists", () => {
	const loader = readJson("packages/postgres/package.json");
	for (const file of loader.files) {
		assert.ok(
			fs.existsSync(path.join(ROOT, "packages", "postgres", file)),
			file,
		);
	}
});

function readJson(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}
