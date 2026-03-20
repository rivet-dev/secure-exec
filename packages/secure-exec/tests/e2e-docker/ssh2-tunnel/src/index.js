const { Client } = require("ssh2");

async function main() {
	const tunnelHost = process.env.REDIS_INTERNAL_HOST;
	const tunnelPort = Number(process.env.REDIS_INTERNAL_PORT || "6379");

	if (!tunnelHost) {
		throw new Error("REDIS_INTERNAL_HOST is required for tunnel test");
	}

	const result = await new Promise((resolve, reject) => {
		const conn = new Client();
		let settled = false;

		conn.on("ready", () => {
			// Open a tunnel through the SSH server to Redis
			conn.forwardOut(
				"127.0.0.1",
				0,
				tunnelHost,
				tunnelPort,
				(err, stream) => {
					if (err) {
						conn.end();
						return reject(err);
					}

					let response = "";

					stream.on("data", (data) => {
						response += data.toString();
						// Redis PING response is "+PONG\r\n"
						if (!settled && response.includes("\r\n")) {
							settled = true;
							conn.end();
							resolve({
								tunneled: true,
								response: response.trim(),
							});
						}
					});

					stream.on("error", (streamErr) => {
						if (!settled) {
							settled = true;
							conn.end();
							reject(streamErr);
						}
					});

					// Send Redis PING command (inline format)
					stream.write("PING\r\n");
				},
			);
		});

		conn.on("error", (err) => {
			if (!settled) {
				settled = true;
				reject(err);
			}
		});

		conn.connect({
			host: process.env.SSH_HOST,
			port: Number(process.env.SSH_PORT),
			username: "testuser",
			password: "testpass",
		});
	});

	console.log(JSON.stringify(result));
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
