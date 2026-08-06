import path from "node:path";
import test from "node:test";

import { validateRelease } from "../scripts/check-release.js";

const ROOT = path.join(import.meta.dirname, "..");

test("committed release metadata is internally consistent without generated payloads", () => {
	validateRelease(ROOT, { requirePayloads: false });
});
