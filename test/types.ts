import {
	binPath,
	createEphemeralCluster,
	pgHome,
	postgresqlVersion,
} from "../packages/postgres/index.js";

const home: string = pgHome();
const executable: string = binPath("postgres");
const version: string = postgresqlVersion;

async function typeContract() {
	await using cluster = await createEphemeralCluster({ user: "type_test" });
	const result: string = cluster.psql("SELECT 42");
	const host: string = cluster.connection.host;
	const port: number | undefined = cluster.connection.port;
	const password: string | undefined = cluster.connection.password;
	const socket: string | null = cluster.socketDir;
	return { executable, home, host, password, port, result, socket, version };
}

void typeContract;
