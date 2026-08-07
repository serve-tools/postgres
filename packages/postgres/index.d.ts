export const postgresqlVersion: string;

export interface EphemeralClusterOptions {
	user?: string;
}

export interface PostgreSQLConnection {
	host: string;
	port?: number;
	password?: string;
	user: string;
	username: string;
	database: string;
}

export interface EphemeralCluster {
	user: string;
	socketDir: string | null;
	port: number | null;
	dataDir: string;
	connection: PostgreSQLConnection;
	psql(sqlText: string, targetDatabase?: string): string;
	stop(): Promise<void>;
	[Symbol.asyncDispose](): Promise<void>;
}

/** Absolute path to the selected platform package's PostgreSQL tree. */
export function pgHome(): string;

/** Absolute path to a PostgreSQL program. Pass a basename without an extension. */
export function binPath(name: string): string;

/** Initialize and start a temporary PostgreSQL cluster. */
export function createEphemeralCluster(
	options?: EphemeralClusterOptions,
): Promise<EphemeralCluster>;
