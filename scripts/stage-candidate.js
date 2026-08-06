/** Stage a verified candidate through npm trusted publishing. */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { publicationOrder } from "./release-packages.js";
import { verifyCandidate } from "./verify-candidate.js";

export function stagingPlan(manifest, { sourceCommit, version }) {
	if (manifest.scope !== "release")
		throw new Error("Only a release candidate can be staged");
	if (manifest.sourceCommit !== sourceCommit)
		throw new Error("Candidate source commit differs");
	if (manifest.loaderVersion !== version)
		throw new Error("Candidate version differs");
	const packages = new Map(manifest.packages.map((pkg) => [pkg.name, pkg]));
	return publicationOrder.map((name) => {
		const pkg = packages.get(name);
		if (!pkg) throw new Error(`Candidate is missing ${name}`);
		return pkg;
	});
}

export function stageArguments(tarball, tag) {
	return ["stage", "publish", tarball, "--access=public", `--tag=${tag}`];
}

export function supportsStagedPublishing(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) return false;
	const [, major, minor] = match.map(Number);
	return major > 11 || (major === 11 && minor >= 15);
}

function main() {
	if (process.env.GITHUB_ACTIONS !== "true") {
		throw new Error(
			"Candidate staging is restricted to the GitHub publish workflow",
		);
	}
	const npmExecPath = process.env.npm_execpath;
	if (!npmExecPath)
		throw new Error("Run candidate staging through an npm package script");
	if (process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN) {
		throw new Error("Candidate staging refuses long-lived npm registry tokens");
	}
	if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
		throw new Error(
			"Candidate staging requires GitHub OIDC trusted publishing",
		);
	}
	const npmVersionResult = spawnSync(
		process.execPath,
		[npmExecPath, "--version"],
		{
			encoding: "utf8",
		},
	);
	if (
		npmVersionResult.error ||
		npmVersionResult.status !== 0 ||
		!supportsStagedPublishing(npmVersionResult.stdout.trim())
	) {
		throw new Error("Candidate staging requires npm 11.15.0 or newer");
	}
	const candidate = path.resolve(process.argv[2] ?? "release");
	const version = argument("--version=");
	const tag = argument("--tag=") ?? "next";
	const confirmation = argument("--confirmation=");
	if (!version || confirmation !== `stage ${version}`) {
		throw new Error(
			`Confirmation must exactly match: stage ${version ?? "<version>"}`,
		);
	}
	if (!/^[a-z][a-z0-9._-]*$/.test(tag))
		throw new Error(`Invalid npm dist-tag: ${tag}`);
	const manifest = verifyCandidate(candidate);
	const plan = stagingPlan(manifest, {
		sourceCommit: process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA,
		version,
	});
	for (const pkg of plan) {
		const result = spawnSync(
			process.execPath,
			[npmExecPath, ...stageArguments(path.join(candidate, pkg.filename), tag)],
			{ stdio: "inherit" },
		);
		if (result.error) throw result.error;
		if (result.status !== 0) process.exit(result.status ?? 1);
		console.log(`staged ${pkg.name}@${pkg.version}`);
	}
}

function argument(prefix) {
	return process.argv
		.find((value) => value.startsWith(prefix))
		?.slice(prefix.length);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
)
	main();
