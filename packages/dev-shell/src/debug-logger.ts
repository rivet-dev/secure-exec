import { createWriteStream, type WriteStream } from "node:fs";
import pino from "pino";

/** Keys whose values are redacted in debug log records. */
const REDACT_KEYS = [
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"API_KEY",
	"SECRET",
	"TOKEN",
	"PASSWORD",
	"CREDENTIAL",
	"Authorization",
];

export interface DebugLogger extends pino.Logger {
	/** Flush and close the underlying file stream. */
	close(): Promise<void>;
}

/**
 * Create a structured pino logger that writes JSON lines to `filePath`.
 *
 * The logger never writes to stdout/stderr — all output goes exclusively
 * to the file sink so it cannot contaminate PTY rendering or protocol output.
 *
 * Secrets are redacted by key name via pino's built-in redact paths.
 */
export function createDebugLogger(filePath: string): DebugLogger {
	const fileStream: WriteStream = createWriteStream(filePath, { flags: "a" });

	const redactPaths = REDACT_KEYS.flatMap((key) => [
		key,
		`env.${key}`,
		`*.${key}`,
	]);

	const logger = pino(
		{
			level: "trace",
			timestamp: pino.stdTimeFunctions.isoTime,
			redact: {
				paths: redactPaths,
				censor: "[REDACTED]",
			},
		},
		fileStream,
	) as pino.Logger & { close: () => Promise<void> };

	logger.close = () =>
		new Promise<void>((resolve, reject) => {
			fileStream.end(() => {
				fileStream.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		});

	return logger;
}

/**
 * Return a no-op logger that satisfies the DebugLogger interface but
 * discards all records. Used when no debug log path is configured.
 */
export function createNoopLogger(): DebugLogger {
	const logger = pino({ level: "silent" }) as pino.Logger & {
		close: () => Promise<void>;
	};
	logger.close = () => Promise.resolve();
	return logger;
}
