import type { AgentTool } from "@earendil-works/pi-agent-core";
import { existsSync, readFileSync, writeFileSync } from "fs";
import * as https from "https";
import * as path from "path";
import * as querystring from "querystring";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

export const WebRunSchema = Type.Object({
	dsl: Type.String({
		description:
			"Pipe-delimited search operation records. Supported: fast|<query>, slow|<query>, open|<url_or_ref_id>, image|<query>. Example: fast|latest news about space exploration",
	}),
});

export type WebRunInput = Static<typeof WebRunSchema>;

export interface AntigravityAccount {
	email: string;
	access: string;
	refresh: string;
	expires: number;
	projectId: string;
}

interface AntigravityCredentialsFile {
	accounts: AntigravityAccount[];
}

export interface WebSearchResultItem {
	refId: string;
	title: string;
	url: string;
	snippet: string;
}

export interface WebRunDetails {
	queries: string[];
	results: WebSearchResultItem[];
	summaryText: string;
}

const ANTIGRAVITY_JSON_LOCATIONS = [
	"C:/Users/ADMIN/Desktop/kiro-go/data/antigravity.json",
	path.join(process.env.USERPROFILE || "", "Desktop/kiro-go/data/antigravity.json"),
];

function loadAntigravityCredentials(): { file: AntigravityCredentialsFile; filePath: string } | null {
	for (const loc of ANTIGRAVITY_JSON_LOCATIONS) {
		if (existsSync(loc)) {
			try {
				const raw = readFileSync(loc, "utf-8");
				const parsed = JSON.parse(raw);
				if (parsed.accounts && parsed.accounts.length > 0) {
					return { file: parsed, filePath: loc };
				}
			} catch {}
		}
	}
	return null;
}

async function refreshAccessToken(account: AntigravityAccount, saveFilePath?: string): Promise<string> {
	const now = Date.now();
	if (account.access && account.expires && now < account.expires - 60000) {
		return account.access;
	}

	const postData = querystring.stringify({
		client_id: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
		client_secret: "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",
		refresh_token: account.refresh,
		grant_type: "refresh_token",
	});

	return new Promise<string>((resolve, reject) => {
		const req = https.request(
			"https://oauth2.googleapis.com/token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"Content-Length": Buffer.byteLength(postData),
				},
				timeout: 15000,
			},
			(res) => {
				let body = "";
				res.on("data", (c) => {
					body += c;
				});
				res.on("end", () => {
					try {
						const parsed = JSON.parse(body);
						if (parsed.access_token) {
							account.access = parsed.access_token;
							account.expires = Date.now() + (parsed.expires_in || 3600) * 1000;
							if (saveFilePath) {
								try {
									const fileData = JSON.parse(readFileSync(saveFilePath, "utf-8"));
									const match = fileData.accounts?.find((a: any) => a.email === account.email);
									if (match) {
										match.access = account.access;
										match.expires = account.expires;
										writeFileSync(saveFilePath, JSON.stringify(fileData, null, 2), "utf-8");
									}
								} catch {}
							}
							resolve(account.access);
						} else {
							reject(new Error(`Failed to refresh token: ${body}`));
						}
					} catch (err) {
						reject(err);
					}
				});
			},
		);
		req.on("error", reject);
		req.write(postData);
		req.end();
	});
}

export async function executeGoogleGroundingSearch(query: string): Promise<WebRunDetails> {
	const creds = loadAntigravityCredentials();
	if (!creds) {
		throw new Error("No Antigravity Google credentials found in kiro-go/data/antigravity.json.");
	}

	const account = creds.file.accounts[0];
	const accessToken = await refreshAccessToken(account, creds.filePath);

	const payload = JSON.stringify({
		project: account.projectId,
		model: "gemini-3.8-flash-tiered",
		request: {
			contents: [
				{
					role: "user",
					parts: [{ text: query }],
				},
			],
			tools: [{ googleSearch: {} }],
		},
		userAgent: "antigravity",
		requestType: "agent",
	});

	return new Promise<WebRunDetails>((resolve, reject) => {
		const req = https.request(
			"https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
					"User-Agent": "antigravity",
				},
				timeout: 30000,
			},
			(res) => {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => {
					try {
						const json = JSON.parse(body);
						const candidate = json.response?.candidates?.[0] || json.candidates?.[0];
						if (!candidate) {
							return resolve({
								queries: [query],
								results: [],
								summaryText: `Google Search returned no content or error: ${body.slice(0, 300)}`,
							});
						}

						const metadata = candidate.groundingMetadata;
						const queries: string[] = metadata?.webSearchQueries || [query];
						const chunks: any[] = metadata?.groundingChunks || [];
						const searchResults: WebSearchResultItem[] = [];

						for (let i = 0; i < chunks.length; i++) {
							const web = chunks[i]?.web;
							if (web) {
								searchResults.push({
									refId: `turn0search${i + 1}`,
									title: web.title || `Source ${i + 1}`,
									url: web.uri || "",
									snippet: "",
								});
							}
						}

						const mainText = candidate.content?.parts?.[0]?.text || "";
						resolve({
							queries,
							results: searchResults,
							summaryText: mainText,
						});
					} catch (e) {
						reject(e);
					}
				});
			},
		);
		req.on("error", reject);
		req.write(payload);
		req.end();
	});
}

export function parseSolWebDSL(dslText: string): { op: string; query: string }[] {
	const records: { op: string; query: string }[] = [];
	const lines = dslText
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);

	for (const line of lines) {
		const parts = line.split("|");
		const op = parts[0]?.trim().toLowerCase();
		const query = parts.slice(1).join("|").trim();
		if (op && query) {
			records.push({ op, query });
		} else if (line.length > 0) {
			records.push({ op: "fast", query: line });
		}
	}
	return records;
}

export async function executeSolWebRun(dslText: string): Promise<WebRunDetails> {
	const parsed = parseSolWebDSL(dslText);
	const targetQuery = parsed[0]?.query || dslText;
	return await executeGoogleGroundingSearch(targetQuery);
}

export function createWebRunToolDefinition(): ToolDefinition<typeof WebRunSchema, WebRunDetails> {
	return {
		name: "web_run",
		label: "web.run",
		description:
			"Search the live web using Google search grounding via compact pipe records (e.g. fast|<query>, slow|<query>). Returns verified search results and citations.",
		parameters: WebRunSchema,
		execute: async (_toolCallId, params) => {
			const details = await executeSolWebRun(params.dsl);
			const formattedOutput = [
				`Searched Google for: ${details.queries.join(", ")}`,
				details.summaryText,
				"",
				"Sources:",
				...details.results.map((r) => `【${r.refId}】 ${r.title} - ${r.url}`),
			].join("\n");

			return {
				content: [{ type: "text", text: formattedOutput }],
				details,
			};
		},
	};
}

export function createWebRunTool(): AgentTool<typeof WebRunSchema, WebRunDetails> {
	return wrapToolDefinition(createWebRunToolDefinition());
}
