import assert from "node:assert/strict";
import test from "node:test";

import { detectPlatformKey } from "../packages/postgres/platforms.js";

test("musl Linux is explicitly unsupported", () => {
	withLinuxRuntime("x64", undefined, () => {
		assert.equal(detectPlatformKey(), null);
	});
});

test("glibc Linux still selects its native package", () => {
	withLinuxRuntime("arm64", "2.39", () => {
		assert.equal(detectPlatformKey(), "linux-arm64-gnu");
	});
});

function withLinuxRuntime(archValue, glibcVersionRuntime, callback) {
	const platform = Object.getOwnPropertyDescriptor(process, "platform");
	const arch = Object.getOwnPropertyDescriptor(process, "arch");
	const getReport = process.report.getReport;

	try {
		Object.defineProperty(process, "platform", { value: "linux" });
		Object.defineProperty(process, "arch", { value: archValue });
		process.report.getReport = () => ({ header: { glibcVersionRuntime } });
		callback();
	} finally {
		Object.defineProperty(process, "platform", platform);
		Object.defineProperty(process, "arch", arch);
		process.report.getReport = getReport;
	}
}
