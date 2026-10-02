import type { AgentTool } from "@earendil-works/pi-agent-core";
import { existsSync, readFileSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { resolveToCwd } from "./path-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

export const applyPatchSchema = Type.Object({
	patch: Type.String({
		description:
			"The full patch text starting with '*** Begin Patch' and ending with '*** End Patch' that describes all changes to be made.",
	}),
});

export type ApplyPatchInput = Static<typeof applyPatchSchema>;

export interface ApplyPatchToolDetails {
	added: string[];
	modified: string[];
	deleted: string[];
	summary: string;
}

export type Hunk =
	| { type: "add"; path: string; contents: string }
	| { type: "delete"; path: string }
	| { type: "update"; path: string; move_path?: string; chunks: UpdateFileChunk[] };

export interface UpdateFileChunk {
	old_lines: string[];
	new_lines: string[];
	change_context?: string;
	is_end_of_file?: boolean;
}

function parsePatchHeader(
	lines: string[],
	startIdx: number,
): { filePath: string; movePath?: string; nextIdx: number } | null {
	const line = lines[startIdx];

	if (line.startsWith("*** Add File:")) {
		const filePath = line.slice("*** Add File:".length).trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Delete File:")) {
		const filePath = line.slice("*** Delete File:".length).trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Update File:")) {
		const filePath = line.slice("*** Update File:".length).trim();
		let movePath: string | undefined;
		let nextIdx = startIdx + 1;

		if (nextIdx < lines.length && lines[nextIdx].startsWith("*** Move to:")) {
			movePath = lines[nextIdx].slice("*** Move to:".length).trim();
			nextIdx++;
		}

		return filePath ? { filePath, movePath, nextIdx } : null;
	}

	return null;
}

function parseUpdateFileChunks(lines: string[], startIdx: number): { chunks: UpdateFileChunk[]; nextIdx: number } {
	const chunks: UpdateFileChunk[] = [];
	let i = startIdx;

	while (i < lines.length && !lines[i].startsWith("***")) {
		if (lines[i].startsWith("@@")) {
			const contextLine = lines[i].substring(2).trim();
			i++;

			const oldLines: string[] = [];
			const newLines: string[] = [];
			let isEndOfFile = false;

			while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("***")) {
				const changeLine = lines[i];

				if (changeLine === "*** End of File") {
					isEndOfFile = true;
					i++;
					break;
				}

				if (changeLine.startsWith(" ")) {
					const content = changeLine.substring(1);
					oldLines.push(content);
					newLines.push(content);
				} else if (changeLine.startsWith("-")) {
					oldLines.push(changeLine.substring(1));
				} else if (changeLine.startsWith("+")) {
					newLines.push(changeLine.substring(1));
				}

				i++;
			}

			chunks.push({
				old_lines: oldLines,
				new_lines: newLines,
				change_context: contextLine || undefined,
				is_end_of_file: isEndOfFile || undefined,
			});
		} else {
			i++;
		}
	}

	return { chunks, nextIdx: i };
}

function parseAddFileContent(lines: string[], startIdx: number): { content: string; nextIdx: number } {
	let content = "";
	let i = startIdx;

	while (i < lines.length && !lines[i].startsWith("***")) {
		if (lines[i].startsWith("+")) {
			content += `${lines[i].substring(1)}\n`;
		}
		i++;
	}

	if (content.endsWith("\n")) {
		content = content.slice(0, -1);
	}

	return { content, nextIdx: i };
}

function stripHeredoc(input: string): string {
	const heredocMatch = input.match(/^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/);
	if (heredocMatch) {
		return heredocMatch[2];
	}
	return input;
}

export function parsePatch(patchText: string): { hunks: Hunk[] } {
	const cleaned = stripHeredoc(patchText.trim());
	const lines = cleaned.split(/\r?\n/);
	const hunks: Hunk[] = [];

	const beginMarker = "*** Begin Patch";
	const endMarker = "*** End Patch";

	const beginIdx = lines.findIndex((line) => line.trim() === beginMarker);
	const endIdx = lines.findIndex((line) => line.trim() === endMarker);

	if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
		throw new Error("Invalid patch format: missing '*** Begin Patch' or '*** End Patch' markers");
	}

	let i = beginIdx + 1;

	while (i < endIdx) {
		const header = parsePatchHeader(lines, i);
		if (!header) {
			i++;
			continue;
		}

		if (lines[i].startsWith("*** Add File:")) {
			const { content, nextIdx } = parseAddFileContent(lines, header.nextIdx);
			hunks.push({
				type: "add",
				path: header.filePath,
				contents: content,
			});
			i = nextIdx;
		} else if (lines[i].startsWith("*** Delete File:")) {
			hunks.push({
				type: "delete",
				path: header.filePath,
			});
			i = header.nextIdx;
		} else if (lines[i].startsWith("*** Update File:")) {
			const { chunks, nextIdx } = parseUpdateFileChunks(lines, header.nextIdx);
			hunks.push({
				type: "update",
				path: header.filePath,
				move_path: header.movePath,
				chunks,
			});
			i = nextIdx;
		} else {
			i++;
		}
	}

	return { hunks };
}

function normalizeUnicode(str: string): string {
	return str
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
		.replace(/\u2026/g, "...")
		.replace(/\u00A0/g, " ");
}

type Comparator = (a: string, b: string) => boolean;

function tryMatch(lines: string[], pattern: string[], startIndex: number, compare: Comparator, eof: boolean): number {
	if (eof) {
		const fromEnd = lines.length - pattern.length;
		if (fromEnd >= startIndex) {
			let matches = true;
			for (let j = 0; j < pattern.length; j++) {
				if (!compare(lines[fromEnd + j], pattern[j])) {
					matches = false;
					break;
				}
			}
			if (matches) return fromEnd;
		}
	}

	for (let i = startIndex; i <= lines.length - pattern.length; i++) {
		let matches = true;
		for (let j = 0; j < pattern.length; j++) {
			if (!compare(lines[i + j], pattern[j])) {
				matches = false;
				break;
			}
		}
		if (matches) return i;
	}

	return -1;
}

function seekSequence(lines: string[], pattern: string[], startIndex: number, eof = false): number {
	if (pattern.length === 0) return -1;

	const exact = tryMatch(lines, pattern, startIndex, (a, b) => a === b, eof);
	if (exact !== -1) return exact;

	const rstrip = tryMatch(lines, pattern, startIndex, (a, b) => a.trimEnd() === b.trimEnd(), eof);
	if (rstrip !== -1) return rstrip;

	const trim = tryMatch(lines, pattern, startIndex, (a, b) => a.trim() === b.trim(), eof);
	if (trim !== -1) return trim;

	const normalized = tryMatch(
		lines,
		pattern,
		startIndex,
		(a, b) => normalizeUnicode(a.trim()) === normalizeUnicode(b.trim()),
		eof,
	);
	return normalized;
}

function computeReplacements(
	originalLines: string[],
	filePath: string,
	chunks: UpdateFileChunk[],
): Array<[number, number, string[]]> {
	const replacements: Array<[number, number, string[]]> = [];
	let lineIndex = 0;

	for (const chunk of chunks) {
		if (chunk.change_context) {
			const contextIdx = seekSequence(originalLines, [chunk.change_context], lineIndex);
			if (contextIdx === -1) {
				throw new Error(`Failed to find context '${chunk.change_context}' in ${filePath}`);
			}
			lineIndex = contextIdx + 1;
		}

		if (chunk.old_lines.length === 0) {
			const insertionIdx =
				originalLines.length > 0 && originalLines[originalLines.length - 1] === ""
					? originalLines.length - 1
					: originalLines.length;
			replacements.push([insertionIdx, 0, chunk.new_lines]);
			continue;
		}

		let pattern = chunk.old_lines;
		let newSlice = chunk.new_lines;
		let found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file);

		if (found === -1 && pattern.length > 0 && pattern[pattern.length - 1] === "") {
			pattern = pattern.slice(0, -1);
			if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") {
				newSlice = newSlice.slice(0, -1);
			}
			found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file);
		}

		if (found !== -1) {
			replacements.push([found, pattern.length, newSlice]);
			lineIndex = found + pattern.length;
		} else {
			throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join("\n")}`);
		}
	}

	replacements.sort((a, b) => a[0] - b[0]);
	return replacements;
}

function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
	const result = [...lines];

	for (let i = replacements.length - 1; i >= 0; i--) {
		const [startIdx, oldLen, newSegment] = replacements[i];
		result.splice(startIdx, oldLen);
		for (let j = 0; j < newSegment.length; j++) {
			result.splice(startIdx + j, 0, newSegment[j]);
		}
	}

	return result;
}

export function deriveNewContentsFromChunks(filePath: string, chunks: UpdateFileChunk[]): string {
	let originalContent: string;
	try {
		originalContent = readFileSync(filePath, "utf-8");
	} catch (error) {
		throw new Error(`Failed to read file ${filePath}: ${error}`, { cause: error });
	}

	const originalLines = originalContent.split(/\r?\n/);
	if (originalLines.length > 0 && originalLines[originalLines.length - 1] === "") {
		originalLines.pop();
	}

	const replacements = computeReplacements(originalLines, filePath, chunks);
	const newLines = applyReplacements(originalLines, replacements);

	if (newLines.length === 0 || newLines[newLines.length - 1] !== "") {
		newLines.push("");
	}

	return newLines.join("\n");
}

export async function executeApplyPatch(cwd: string, patchText: string): Promise<ApplyPatchToolDetails> {
	const { hunks } = parsePatch(patchText);
	if (hunks.length === 0) {
		throw new Error("No files or hunks found in patch.");
	}

	const added: string[] = [];
	const modified: string[] = [];
	const deleted: string[] = [];

	for (const hunk of hunks) {
		const absolutePath = resolveToCwd(hunk.path, cwd);

		switch (hunk.type) {
			case "add": {
				const addDir = path.dirname(absolutePath);
				await fs.mkdir(addDir, { recursive: true });
				await fs.writeFile(absolutePath, hunk.contents, "utf-8");
				added.push(hunk.path);
				break;
			}
			case "delete": {
				if (existsSync(absolutePath)) {
					await fs.unlink(absolutePath);
					deleted.push(hunk.path);
				}
				break;
			}
			case "update": {
				if (!existsSync(absolutePath)) {
					throw new Error(`Cannot update non-existent file: ${hunk.path}`);
				}
				const newContent = deriveNewContentsFromChunks(absolutePath, hunk.chunks);

				if (hunk.move_path) {
					const moveAbs = resolveToCwd(hunk.move_path, cwd);
					const moveDir = path.dirname(moveAbs);
					await fs.mkdir(moveDir, { recursive: true });
					await fs.writeFile(moveAbs, newContent, "utf-8");
					await fs.unlink(absolutePath);
					modified.push(`${hunk.path} -> ${hunk.move_path}`);
				} else {
					await fs.writeFile(absolutePath, newContent, "utf-8");
					modified.push(hunk.path);
				}
				break;
			}
		}
	}

	const summaryParts: string[] = [];
	if (added.length > 0) summaryParts.push(`Added: ${added.join(", ")}`);
	if (modified.length > 0) summaryParts.push(`Modified: ${modified.join(", ")}`);
	if (deleted.length > 0) summaryParts.push(`Deleted: ${deleted.join(", ")}`);

	return {
		added,
		modified,
		deleted,
		summary: summaryParts.join("\n") || "No files modified",
	};
}

export function createApplyPatchToolDefinition(
	cwd: string,
): ToolDefinition<typeof applyPatchSchema, ApplyPatchToolDetails> {
	return {
		name: "apply_patch",
		label: "apply_patch",
		description:
			"Apply unified patch to add, update, move, or delete files. Provide exact patch text bounded by '*** Begin Patch' and '*** End Patch'.",
		parameters: applyPatchSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const targetCwd = ctx?.cwd ?? cwd;
			const details = await withFileMutationQueue(targetCwd, async () => {
				return await executeApplyPatch(targetCwd, params.patch);
			});

			return {
				content: [{ type: "text", text: details.summary }],
				details,
			};
		},
	};
}

export function createApplyPatchTool(cwd: string): AgentTool<typeof applyPatchSchema, ApplyPatchToolDetails> {
	return wrapToolDefinition(createApplyPatchToolDefinition(cwd));
}
