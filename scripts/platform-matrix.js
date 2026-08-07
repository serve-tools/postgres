/** Native package metadata and upstream archive targets used by release tooling. */
export const PLATFORMS = {
	"darwin-arm64": {
		triple: "aarch64-apple-darwin",
		os: ["darwin"],
		cpu: ["arm64"],
	},
	"darwin-x64": {
		triple: "x86_64-apple-darwin",
		os: ["darwin"],
		cpu: ["x64"],
	},
	"linux-arm64-gnu": {
		triple: "aarch64-unknown-linux-gnu",
		os: ["linux"],
		cpu: ["arm64"],
		libc: ["glibc"],
	},
	"linux-x64-gnu": {
		triple: "x86_64-unknown-linux-gnu",
		os: ["linux"],
		cpu: ["x64"],
		libc: ["glibc"],
	},
	"win32-x64": {
		triple: "x86_64-pc-windows-msvc",
		os: ["win32"],
		cpu: ["x64"],
	},
};

export function archiveUrl(version, key) {
	return `https://github.com/theseus-rs/postgresql-binaries/releases/download/${version}/postgresql-${version}-${PLATFORMS[key].triple}.tar.gz`;
}
