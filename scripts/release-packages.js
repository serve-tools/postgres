import path from "node:path";

import { PLATFORMS } from "./platform-matrix.js";

export function releasePackages(root) {
	return [
		...Object.keys(PLATFORMS).map((key) => ({
			name: `@serve-tools/postgres-${key}`,
			directory: path.join(root, "binaries", key),
			platform: key,
		})),
		{
			name: "@serve-tools/postgres",
			directory: path.join(root, "packages", "postgres"),
			platform: null,
		},
	];
}

export const publicationOrder = [
	...Object.keys(PLATFORMS).map((key) => `@serve-tools/postgres-${key}`),
	"@serve-tools/postgres",
];
