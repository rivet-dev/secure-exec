const { Pool } = require("pg");

async function main() {
	const pool = new Pool({
		host: process.env.PG_HOST,
		port: Number(process.env.PG_PORT),
		user: "testuser",
		password: "testpass",
		database: "testdb",
		max: 5,
	});

	// Setup
	await pool.query(
		"CREATE TABLE IF NOT EXISTS test_pool (id SERIAL PRIMARY KEY, value TEXT)",
	);

	// Acquire client, query, release
	const client = await pool.connect();
	await client.query("INSERT INTO test_pool (value) VALUES ($1)", [
		"from-client",
	]);
	const clientRes = await client.query(
		"SELECT value FROM test_pool WHERE value = $1",
		["from-client"],
	);
	client.release();

	// pool.query() shorthand
	await pool.query("INSERT INTO test_pool (value) VALUES ($1)", [
		"from-shorthand",
	]);
	const shorthandRes = await pool.query(
		"SELECT value FROM test_pool WHERE value = $1",
		["from-shorthand"],
	);

	// Concurrent queries via pool.query()
	const [r1, r2, r3] = await Promise.all([
		pool.query("SELECT 1 AS n"),
		pool.query("SELECT 2 AS n"),
		pool.query("SELECT 3 AS n"),
	]);

	// Cleanup
	await pool.query("DROP TABLE test_pool");
	await pool.end();

	console.log(
		JSON.stringify({
			connected: true,
			clientAcquire: {
				rowCount: clientRes.rowCount,
				value: clientRes.rows[0].value,
			},
			shorthand: {
				rowCount: shorthandRes.rowCount,
				value: shorthandRes.rows[0].value,
			},
			concurrent: [r1.rows[0].n, r2.rows[0].n, r3.rows[0].n],
		}),
	);
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
