import type { AgentTool } from "@earendil-works/pi-agent-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

export const BioUpdateSchema = Type.Object({
	memory: Type.String({
		description: "The plain text user memory to persist across sessions (or request to forget).",
	}),
});

export type BioUpdateInput = Static<typeof BioUpdateSchema>;

export interface BioUpdateDetails {
	persistedPath: string;
	content: string;
}

export function getSolMemoryPath(): string {
	return join(homedir(), ".sol", "memory.md");
}

export function loadSolMemory(): string {
	const memPath = getSolMemoryPath();
	if (existsSync(memPath)) {
		try {
			return readFileSync(memPath, "utf-8").trim();
		} catch {}
	}
	return "No stored user memories yet.";
}

export function appendSolMemory(newMemory: string): string {
	const memPath = getSolMemoryPath();
	const dir = dirname(memPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	let current = "";
	if (existsSync(memPath)) {
		current = readFileSync(memPath, "utf-8").trim();
	}

	const dateStr = new Date().toISOString().split("T")[0];
	const entry = `\n- [${dateStr}] ${newMemory.trim()}`;
	const updated = (current ? current + entry : entry).trim();
	writeFileSync(memPath, `${updated}\n`, "utf-8");
	return updated;
}

export function createBioToolDefinition(): ToolDefinition<typeof BioUpdateSchema, BioUpdateDetails> {
	return {
		name: "bio_update",
		label: "bio.update",
		description: "Persist long-term facts, preferences, or updates about the user to memory.",
		parameters: BioUpdateSchema,
		execute: async (_toolCallId, params) => {
			const updated = appendSolMemory(params.memory);
			const memPath = getSolMemoryPath();
			return {
				content: [{ type: "text", text: `Memory successfully recorded to ${memPath}` }],
				details: {
					persistedPath: memPath,
					content: updated,
				},
			};
		},
	};
}

export function createBioTool(): AgentTool<typeof BioUpdateSchema, BioUpdateDetails> {
	return wrapToolDefinition(createBioToolDefinition());
}
