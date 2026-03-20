const { Client } = require("pg");

async function main() {
	const client = new Client({
		host: process.env.PG_HOST,
		port: Number(process.env.PG_PORT),
		user: "testuser",
		password: "testpass",
		database: "testdb",
	});

	await client.connect();

	// CREATE + INSERT + SELECT (original)
	await client.query(
		"CREATE TABLE IF NOT EXISTS test_e2e (id SERIAL PRIMARY KEY, value TEXT)",
	);
	await client.query("INSERT INTO test_e2e (value) VALUES ($1)", [
		"hello-sandbox",
	]);
	const selectRes = await client.query(
		"SELECT value FROM test_e2e WHERE value = $1",
		["hello-sandbox"],
	);

	// UPDATE + verify
	await client.query("UPDATE test_e2e SET value = $1 WHERE value = $2", [
		"updated-sandbox",
		"hello-sandbox",
	]);
	const updateRes = await client.query(
		"SELECT value FROM test_e2e WHERE value = $1",
		["updated-sandbox"],
	);

	// DELETE + verify
	await client.query("DELETE FROM test_e2e WHERE value = $1", [
		"updated-sandbox",
	]);
	const deleteRes = await client.query(
		"SELECT value FROM test_e2e WHERE value = $1",
		["updated-sandbox"],
	);

	// Transaction: ROLLBACK
	await client.query("BEGIN");
	await client.query("INSERT INTO test_e2e (value) VALUES ($1)", [
		"rollback-test",
	]);
	await client.query("ROLLBACK");
	const rollbackRes = await client.query(
		"SELECT value FROM test_e2e WHERE value = $1",
		["rollback-test"],
	);

	// Transaction: COMMIT
	await client.query("BEGIN");
	await client.query("INSERT INTO test_e2e (value) VALUES ($1)", [
		"commit-test",
	]);
	await client.query("COMMIT");
	const commitRes = await client.query(
		"SELECT value FROM test_e2e WHERE value = $1",
		["commit-test"],
	);

	await client.query("DROP TABLE test_e2e");
	await client.end();

	console.log(
		JSON.stringify({
			connected: true,
			insert: { rowCount: selectRes.rowCount, value: selectRes.rows[0].value },
			update: {
				rowCount: updateRes.rowCount,
				value: updateRes.rows[0].value,
			},
			delete: { rowCount: deleteRes.rowCount },
			rollback: { rowCount: rollbackRes.rowCount },
			commit: {
				rowCount: commitRes.rowCount,
				value: commitRes.rows[0].value,
			},
		}),
	);
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
