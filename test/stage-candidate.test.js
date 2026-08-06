import assert from "node:assert/strict";
import test from "node:test";

import { publicationOrder } from "../scripts/release-packages.js";
import {
	stageArguments,
	stagingPlan,
	supportsStagedPublishing,
} from "../scripts/stage-candidate.js";

test("candidate staging is platform-first and verifies identity", () => {
	const packages = publicationOrder.map((name) => ({
		name,
		filename: `${name}.tgz`,
	}));
	const manifest = {
		scope: "release",
		sourceCommit: "a".repeat(40),
		loaderVersion: "1.2.3",
		packages,
	};
	assert.deepEqual(
		stagingPlan(manifest, { sourceCommit: "a".repeat(40), version: "1.2.3" }),
		packages,
	);
	assert.throws(
		() =>
			stagingPlan(manifest, { sourceCommit: "b".repeat(40), version: "1.2.3" }),
		/source commit differs/,
	);
});

test("staged publishing requires a compatible npm CLI", () => {
	assert.equal(supportsStagedPublishing("11.14.9"), false);
	assert.equal(supportsStagedPublishing("11.15.0"), true);
	assert.equal(supportsStagedPublishing("12.0.0"), true);
	assert.equal(supportsStagedPublishing("invalid"), false);
});

test("staged publishing arguments cannot silently perform a direct publish", () => {
	assert.deepEqual(stageArguments("package.tgz", "next"), [
		"stage",
		"publish",
		"package.tgz",
		"--access=public",
		"--tag=next",
	]);
});
