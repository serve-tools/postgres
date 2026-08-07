/** Detect the local package suffix, or null when no native package exists. */
export function detectPlatformKey() {
	const { platform, arch } = process;
	const supportedArchitecture = arch === "arm64" || arch === "x64";
	if (platform === "darwin" && supportedArchitecture)
		return `${platform}-${arch}`;
	if (platform === "linux" && supportedArchitecture) {
		return isMusl() ? null : `${platform}-${arch}-gnu`;
	}
	if (platform === "win32" && arch === "x64") return `${platform}-${arch}`;
	return null;
}

function isMusl() {
	const report = process.report?.getReport?.();
	return Boolean(
		report && typeof report === "object" && !report.header?.glibcVersionRuntime,
	);
}
