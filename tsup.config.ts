import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs", "iife"],
	globalName: "Oekaki",
	dts: true,
	sourcemap: true,
	clean: true,
	target: "es2024",
});
