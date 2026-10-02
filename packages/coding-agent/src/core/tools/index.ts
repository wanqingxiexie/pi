export {
	type ApplyPatchInput,
	type ApplyPatchToolDetails,
	applyPatchSchema,
	createApplyPatchTool,
	createApplyPatchToolDefinition,
} from "./apply_patch.ts";
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.ts";
export {
	type BioUpdateDetails,
	type BioUpdateInput,
	createBioTool,
	createBioToolDefinition,
} from "./bio.ts";
export type { EditOperations, EditToolDetails, EditToolInput, EditToolOptions } from "./edit.ts";
export { createEditTool, createEditToolDefinition } from "./edit.ts";
export { withFileMutationQueue } from "./file-mutation-queue.ts";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
} from "./find.ts";
export {
	createGrepTool,
	createGrepToolDefinition,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
} from "./grep.ts";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
} from "./ls.ts";
export type {
	PowerShellOperations,
	PowerShellSpawnContext,
	PowerShellSpawnHook,
	PowerShellToolDetails,
	PowerShellToolInput,
	PowerShellToolOptions,
} from "./powershell.ts";
export { createLocalPowerShellOperations, createPowerShellTool, createPowerShellToolDefinition } from "./powershell.ts";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
} from "./read.ts";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.ts";
export {
	createWebRunTool,
	createWebRunToolDefinition,
	type WebRunDetails,
	type WebRunInput,
} from "./web.ts";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "./write.ts";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolDefinition } from "../extensions/types.ts";
import { createApplyPatchTool, createApplyPatchToolDefinition } from "./apply_patch.ts";
import { type BashToolOptions, createBashTool, createBashToolDefinition } from "./bash.ts";
import { createBioTool, createBioToolDefinition } from "./bio.ts";
import { createEditTool, createEditToolDefinition } from "./edit.ts";
import { createFindTool, createFindToolDefinition, type FindToolOptions } from "./find.ts";
import { createGrepTool, createGrepToolDefinition, type GrepToolOptions } from "./grep.ts";
import { createLsTool, createLsToolDefinition, type LsToolOptions } from "./ls.ts";
import { createPowerShellTool, createPowerShellToolDefinition } from "./powershell.ts";
import { createReadTool, createReadToolDefinition, type ReadToolOptions } from "./read.ts";
import { createWebRunTool, createWebRunToolDefinition } from "./web.ts";
import { createWriteTool, createWriteToolDefinition, type WriteToolOptions } from "./write.ts";

export type BuiltinToolName =
	| "read"
	| "write"
	| "apply_patch"
	| "bash"
	| "grep"
	| "find"
	| "ls"
	| "web_run"
	| "bio_update"
	| "edit"
	| "powershell";
export type ToolName = BuiltinToolName;

export interface BuiltinToolOptions {
	bash?: BashToolOptions;
	write?: WriteToolOptions;
	read?: ReadToolOptions;
	grep?: GrepToolOptions;
	find?: FindToolOptions;
	ls?: LsToolOptions;
	edit?: any;
	powershell?: any;
}
export type ToolsOptions = BuiltinToolOptions;

export function createBuiltinToolDefinition(
	name: BuiltinToolName,
	cwd: string,
	options?: BuiltinToolOptions,
): ToolDefinition<any, any, any> {
	switch (name) {
		case "read":
			return createReadToolDefinition(cwd, options?.read);
		case "write":
			return createWriteToolDefinition(cwd, options?.write);
		case "apply_patch":
			return createApplyPatchToolDefinition(cwd);
		case "bash":
			return createBashToolDefinition(cwd, options?.bash);
		case "grep":
			return createGrepToolDefinition(cwd, options?.grep);
		case "find":
			return createFindToolDefinition(cwd, options?.find);
		case "ls":
			return createLsToolDefinition(cwd, options?.ls);
		case "web_run":
			return createWebRunToolDefinition();
		case "bio_update":
			return createBioToolDefinition();
		case "edit":
			return createEditToolDefinition(cwd, options?.edit);
		case "powershell":
			return createPowerShellToolDefinition(cwd, options?.powershell);
	}
}

export function createBuiltinTool(
	name: BuiltinToolName,
	cwd: string,
	options?: BuiltinToolOptions,
): AgentTool<any, any> {
	switch (name) {
		case "read":
			return createReadTool(cwd, options?.read);
		case "write":
			return createWriteTool(cwd, options?.write);
		case "apply_patch":
			return createApplyPatchTool(cwd);
		case "bash":
			return createBashTool(cwd, options?.bash);
		case "grep":
			return createGrepTool(cwd, options?.grep);
		case "find":
			return createFindTool(cwd, options?.find);
		case "ls":
			return createLsTool(cwd, options?.ls);
		case "web_run":
			return createWebRunTool();
		case "bio_update":
			return createBioTool();
		case "edit":
			return createEditTool(cwd, options?.edit);
		case "powershell":
			return createPowerShellTool(cwd, options?.powershell);
	}
}

export function createBuiltinToolDefinitionsMap(cwd: string, options?: BuiltinToolOptions): any {
	return {
		read: createReadToolDefinition(cwd, options?.read),
		write: createWriteToolDefinition(cwd, options?.write),
		apply_patch: createApplyPatchToolDefinition(cwd),
		bash: createBashToolDefinition(cwd, options?.bash),
		grep: createGrepToolDefinition(cwd, options?.grep),
		find: createFindToolDefinition(cwd, options?.find),
		ls: createLsToolDefinition(cwd, options?.ls),
		web_run: createWebRunToolDefinition(),
		bio_update: createBioToolDefinition(),
		edit: createEditToolDefinition(cwd, options?.edit),
		powershell: createPowerShellToolDefinition(cwd, options?.powershell),
	};
}

export function createBuiltinToolsMap(cwd: string, options?: BuiltinToolOptions): any {
	return {
		read: createReadTool(cwd, options?.read),
		write: createWriteTool(cwd, options?.write),
		apply_patch: createApplyPatchTool(cwd),
		bash: createBashTool(cwd, options?.bash),
		grep: createGrepTool(cwd, options?.grep),
		find: createFindTool(cwd, options?.find),
		ls: createLsTool(cwd, options?.ls),
		web_run: createWebRunTool(),
		bio_update: createBioTool(),
		edit: createEditTool(cwd, options?.edit),
		powershell: createPowerShellTool(cwd, options?.powershell),
	};
}

export function createAllToolDefinitions(cwd: string, options?: BuiltinToolOptions): any {
	const map = createBuiltinToolDefinitionsMap(cwd, options);
	const list = Object.values(map);
	return Object.assign(list, map);
}

export function createAllTools(cwd: string, options?: BuiltinToolOptions): any {
	const map = createBuiltinToolsMap(cwd, options);
	const list = Object.values(map);
	return Object.assign(list, map);
}

export function createCodingTools(cwd: string, options?: BuiltinToolOptions): AgentTool<any, any>[] {
	return [
		createReadTool(cwd, options?.read),
		createWriteTool(cwd, options?.write),
		createApplyPatchTool(cwd),
		createBashTool(cwd, options?.bash),
		createGrepTool(cwd, options?.grep),
		createFindTool(cwd, options?.find),
		createLsTool(cwd, options?.ls),
		createWebRunTool(),
		createBioTool(),
	];
}

export function createReadOnlyTools(cwd: string, options?: BuiltinToolOptions): AgentTool<any, any>[] {
	return [
		createReadTool(cwd, options?.read),
		createGrepTool(cwd, options?.grep),
		createFindTool(cwd, options?.find),
		createLsTool(cwd, options?.ls),
	];
}

export type Tool = AgentTool<any, any>;
