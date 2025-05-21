import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	globalName: "Oekaki",
	dts: true,
	sourcemap: false,
	clean: true,
	target: "es2024",
});
