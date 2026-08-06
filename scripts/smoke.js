/** Smoke test: prove the imported binaries run relocated from inside this repo.
 *
 * initdb a throwaway cluster → start it on a private local endpoint → run real SQL
 * through psql → stop and clean up. Exercises the exact lifecycle a starter
 * dev server or test harness would use.
 */
import { createEphemeralCluster, pgHome } from "../packages/postgres/index.js";

console.log(`pg home: ${pgHome()}`);

// Use a non-default bootstrap role to ensure the helper still connects to the
// default `postgres` database rather than assuming a same-named database exists.
const cluster = await createEphemeralCluster({ user: "smoke_user" });
try {
	console.log(
		cluster.socketDir
			? `socket:  ${cluster.socketDir}`
			: `endpoint: ${cluster.connection.host}:${cluster.connection.port}`,
	);
	if (cluster.connection.database !== "postgres") {
		throw new Error(
			`unexpected default database: ${cluster.connection.database}`,
		);
	}
	if (
		cluster.connection.user !== "smoke_user" ||
		cluster.connection.username !== "smoke_user"
	) {
		throw new Error("connection role aliases are inconsistent");
	}
	if (process.platform === "win32" && !cluster.connection.password) {
		throw new Error("Windows connection is missing its SCRAM password");
	}
	if (process.platform !== "win32" && cluster.connection.password) {
		throw new Error("Unix socket connection unexpectedly has a password");
	}
	console.log(`version: ${cluster.psql("SELECT version()")}`);

	cluster.psql(
		"CREATE TABLE smoke (id serial PRIMARY KEY, note text NOT NULL)",
	);
	cluster.psql(
		"INSERT INTO smoke (note) VALUES ('hello from @serve-tools/postgres')",
	);
	const note = cluster.psql("SELECT note FROM smoke WHERE id = 1");
	console.log(`round-trip: ${note}`);

	// The property PGlite cannot offer: two truly isolated databases in one server.
	cluster.psql("CREATE DATABASE clone_a");
	cluster.psql("CREATE DATABASE clone_b");
	cluster.psql("CREATE TABLE t (v int)", "clone_a");
	const isolated = cluster.psql(
		"SELECT count(*) FROM pg_tables WHERE tablename = 't'",
		"clone_b",
	);
	console.log(
		`isolation: clone_b sees ${isolated} of clone_a's tables (expect 0)`,
	);

	console.log("OK");
} finally {
	await cluster.stop();
	await cluster.stop();
}
