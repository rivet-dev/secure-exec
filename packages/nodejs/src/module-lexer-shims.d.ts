declare module "cjs-module-lexer" {
	export function initSync(): void;
	export function parse(source: string): {
		exports: string[];
		reexports: string[];
	};
}

declare module "es-module-lexer" {
	export interface ImportSpecifier {
		n: string | undefined;
		d: number;
	}

	export interface ExportSpecifier {
		n: string | undefined;
	}

	export const init: Promise<void>;
	export function initSync(): void;
	export function parse(
		source: string,
		filePath?: string,
	): [ImportSpecifier[], ExportSpecifier[], boolean, boolean];
}
