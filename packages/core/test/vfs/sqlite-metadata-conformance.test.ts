import { defineMetadataStoreTests } from "../../src/test/metadata-store-conformance.js";
import { SqliteMetadataStore } from "../../src/vfs/sqlite-metadata.js";

defineMetadataStoreTests({
	name: "SqliteMetadataStore",
	createStore: () => new SqliteMetadataStore({ dbPath: ":memory:" }),
	capabilities: {
		versioning: false,
	},
});

defineMetadataStoreTests({
	name: "SqliteMetadataStore (versioning)",
	createStore: () => new SqliteMetadataStore({ dbPath: ":memory:", versioning: true }),
	capabilities: {
		versioning: true,
	},
});
