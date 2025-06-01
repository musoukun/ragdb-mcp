import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RagService } from "../services/rag-service.js";
import { ConfigManager } from "../config/index.js";
import type {
	AddDocumentInput,
	UpdateDocumentInput,
	DeleteDocumentInput,
	SearchDocumentsInput,
	ListDocumentsInput,
	CreateIndexInput,
	DeleteIndexInput,
} from "../types/index.js";

/**
 * MCP Toolsを登録する関数
 */
export function registerRagTools(
	server: McpServer,
	ragService: RagService
): void {
	const configManager = ConfigManager.getInstance();

	/**
	 * インデックス作成ツール
	 */
	server.tool(
		"create_index",
		{
			indexName: z.string().describe("作成するインデックス名"),
			dimension: z
				.number()
				.optional()
				.describe("ベクターの次元数（省略時はデフォルト）"),
		},
		async ({
			indexName,
			dimension,
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				await ragService.createIndex(indexName, dimension);
				return {
					content: [
						{
							type: "text",
							text: `インデックス '${indexName}' を正常に作成しました。${dimension ? `次元数: ${dimension}` : ""}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `インデックス作成に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * インデックス削除ツール
	 */
	server.tool(
		"delete_index",
		{
			indexName: z.string().describe("削除するインデックス名"),
		},
		async ({
			indexName,
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				await ragService.deleteIndex(indexName);
				return {
					content: [
						{
							type: "text",
							text: `インデックス '${indexName}' を正常に削除しました。`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `インデックス削除に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * インデックス一覧ツール
	 */
	server.tool(
		"list_indexes",
		{},
		async (): Promise<{
			content: Array<{ type: "text"; text: string }>;
		}> => {
			try {
				const indexes = await ragService.listIndexes();
				return {
					content: [
						{
							type: "text",
							text: `利用可能なインデックス: ${indexes.length > 0 ? indexes.join(", ") : "なし"}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `インデックス一覧取得に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * ドキュメント追加ツール（重複検知対応）
	 */
	server.tool(
		"add_document",
		{
			content: z.string().describe("追加するMarkdownドキュメントの内容"),
			metadata: z
				.object({
					title: z
						.string()
						.optional()
						.describe("ドキュメントのタイトル"),
					source: z
						.string()
						.optional()
						.describe("ドキュメントのソース"),
					author: z.string().optional().describe("作成者"),
					category: z.string().optional().describe("カテゴリ"),
					tags: z.array(z.string()).optional().describe("タグ配列"),
				})
				.optional()
				.describe("ドキュメントのメタデータ"),
			chunkingOptions: z
				.object({
					strategy: z
						.enum([
							"recursive",
							"character",
							"token",
							"markdown",
							"html",
							"json",
							"latex",
						])
						.optional()
						.describe("チャンキング戦略"),
					size: z.number().optional().describe("チャンクサイズ"),
					overlap: z
						.number()
						.optional()
						.describe("チャンクのオーバーラップサイズ"),
					separator: z.string().optional().describe("区切り文字"),
					extractMetadata: z
						.boolean()
						.optional()
						.describe("メタデータを抽出するか"),
				})
				.optional()
				.describe("チャンキングオプション"),
			indexName: z
				.string()
				.optional()
				.describe("保存先インデックス名（省略時はデフォルト）"),
			duplicateCheck: z
				.object({
					enabled: z
						.boolean()
						.optional()
						.describe(
							"重複チェックを有効にするか（デフォルト: 環境変数設定）"
						),
					threshold: z
						.number()
						.min(0)
						.max(1)
						.optional()
						.describe("類似度閾値（0.0-1.0、デフォルト: 0.9）"),
					strategy: z
						.enum(["semantic", "metadata", "hybrid"])
						.optional()
						.describe("重複検知戦略"),
					allowAIDecision: z
						.boolean()
						.optional()
						.describe("AI判断を許可するか（デフォルト: true）"),
				})
				.optional()
				.describe("重複検知設定"),
		},
		async ({
			content,
			metadata = {},
			chunkingOptions = {},
			indexName,
			duplicateCheck,
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				// 重複検知設定を決定（引数 > 環境変数 > デフォルト）
				const globalDuplicateConfig =
					configManager.getDuplicateCheckConfig();
				const finalDuplicateConfig = {
					enabled:
						duplicateCheck?.enabled ??
						globalDuplicateConfig.enabled,
					threshold:
						duplicateCheck?.threshold ??
						globalDuplicateConfig.threshold,
					strategy:
						duplicateCheck?.strategy ??
						globalDuplicateConfig.strategy,
					topK: globalDuplicateConfig.topK,
				};

				// 重複検知対応版のメソッドを呼び出し
				const result = await ragService.addDocumentWithDuplicateCheck(
					content,
					metadata,
					chunkingOptions,
					indexName,
					finalDuplicateConfig
				);

				// 結果に応じたレスポンス生成
				let responseText = result.message;

				if (result.duplicateCheck?.isDuplicate) {
					responseText += "\n\n【重複検知結果】";
					responseText += `\n類似ドキュメント数: ${result.duplicateCheck.similarDocuments.length}件`;
					responseText += `\n類似度閾値: ${result.duplicateCheck.threshold}`;

					if (result.duplicateCheck.decision) {
						responseText += "\n\n【AI判断】";
						responseText += `\nアクション: ${result.duplicateCheck.decision.action}`;
						responseText += `\n判断理由: ${result.duplicateCheck.decision.reason}`;
						responseText += `\n信頼度: ${(result.duplicateCheck.decision.confidence * 100).toFixed(1)}%`;
					}

					if (result.duplicateCheck.similarDocuments.length > 0) {
						responseText += "\n\n【類似ドキュメント】";
						result.duplicateCheck.similarDocuments
							.slice(0, 3)
							.forEach((doc, index) => {
								responseText += `\n${index + 1}. タイトル: ${doc.metadata.title || "未設定"}`;
								responseText += `\n   類似度: ${(doc.score * 100).toFixed(1)}%`;
								responseText += `\n   内容プレビュー: ${doc.content.substring(0, 100)}...`;
							});
					}
				}

				responseText += `\n\n【最終結果】`;
				responseText += `\nドキュメントID: ${result.document.id}`;
				responseText += `\n実行されたアクション: ${result.action}`;
				responseText += `\nインデックス: ${indexName || "documents"}`;
				responseText += `\nコンテンツ長: ${content.length}文字`;

				return {
					content: [
						{
							type: "text",
							text: responseText,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `ドキュメント追加に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * ドキュメント更新ツール
	 */
	server.tool(
		"update_document",
		{
			documentId: z.string().describe("更新するドキュメントのID"),
			content: z
				.string()
				.optional()
				.describe("新しいMarkdownドキュメントの内容"),
			metadata: z
				.object({
					title: z.string().optional(),
					source: z.string().optional(),
					author: z.string().optional(),
					category: z.string().optional(),
					tags: z.array(z.string()).optional(),
				})
				.optional()
				.describe("更新するメタデータ"),
			chunkingOptions: z
				.object({
					strategy: z
						.enum([
							"recursive",
							"character",
							"token",
							"markdown",
							"html",
							"json",
							"latex",
						])
						.optional(),
					size: z.number().optional(),
					overlap: z.number().optional(),
					separator: z.string().optional(),
					extractMetadata: z.boolean().optional(),
				})
				.optional()
				.describe("チャンキングオプション"),
			indexName: z.string().optional().describe("インデックス名"),
		},
		async ({
			documentId,
			content,
			metadata,
			chunkingOptions = {},
			indexName,
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				const document = await ragService.updateDocument(
					documentId,
					content,
					metadata,
					chunkingOptions,
					indexName
				);
				return {
					content: [
						{
							type: "text",
							text:
								`ドキュメント（ID: ${documentId}）を正常に更新しました。\n` +
								`更新日時: ${document.updatedAt.toISOString()}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `ドキュメント更新に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * ドキュメント削除ツール
	 */
	server.tool(
		"delete_document",
		{
			documentId: z.string().describe("削除するドキュメントのID"),
			indexName: z.string().optional().describe("インデックス名"),
		},
		async ({
			documentId,
			indexName,
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				await ragService.deleteDocument(documentId, indexName);
				return {
					content: [
						{
							type: "text",
							text: `ドキュメント（ID: ${documentId}）を正常に削除しました。`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `ドキュメント削除に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * ドキュメント検索ツール
	 */
	server.tool(
		"search_documents",
		{
			query: z.string().describe("検索クエリ"),
			indexName: z.string().optional().describe("検索対象インデックス名"),
			options: z
				.object({
					topK: z
						.number()
						.optional()
						.describe("返す結果の最大数（デフォルト: 5）"),
					filter: z
						.record(z.any())
						.optional()
						.describe("メタデータフィルター"),
					includeMetadata: z
						.boolean()
						.optional()
						.describe("メタデータを含めるか"),
					minScore: z.number().optional().describe("最小スコア閾値"),
				})
				.optional()
				.describe("検索オプション"),
		},
		async ({
			query,
			indexName,
			options = {},
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				const results = await ragService.searchDocuments(
					query,
					indexName,
					options
				);

				if (results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `クエリ「${query}」に対する検索結果は見つかりませんでした。`,
							},
						],
					};
				}

				const resultsText = results
					.map((result, index) => {
						return (
							`結果 ${index + 1}:\n` +
							`スコア: ${result.score.toFixed(4)}\n` +
							`内容: ${result.content.substring(0, 200)}${result.content.length > 200 ? "..." : ""}\n` +
							`メタデータ: ${JSON.stringify(result.metadata, null, 2)}\n`
						);
					})
					.join("\n---\n");

				return {
					content: [
						{
							type: "text",
							text: `検索クエリ「${query}」の結果（${results.length}件）:\n\n${resultsText}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `ドキュメント検索に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * RAG検索ツール（質問応答形式）
	 */
	server.tool(
		"rag_search",
		{
			question: z.string().describe("検索したい質問や調べたい内容"),
			indexName: z.string().optional().describe("検索対象インデックス名"),
			options: z
				.object({
					topK: z
						.number()
						.optional()
						.describe(
							"取得する関連ドキュメント数（デフォルト: 3）"
						),
					minScore: z
						.number()
						.optional()
						.describe("最小関連度スコア（0-1、デフォルト: 0.1）"),
					includeContext: z
						.boolean()
						.optional()
						.describe("コンテキストを含めるか（デフォルト: true）"),
					combineResults: z
						.boolean()
						.optional()
						.describe(
							"結果を統合して回答するか（デフォルト: true）"
						),
				})
				.optional()
				.describe("検索オプション"),
		},
		async ({
			question,
			indexName,
			options = {},
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				const searchOptions = {
					topK: options.topK || 3,
					minScore: options.minScore || 0.1,
					includeMetadata: true,
				};

				const results = await ragService.searchDocuments(
					question,
					indexName,
					searchOptions
				);

				if (results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text:
									`質問「${question}」に関連する情報が見つかりませんでした。\n\n` +
									`💡 検索のヒント:\n` +
									`- より具体的なキーワードを使用してください\n` +
									`- 別の表現で質問してみてください\n` +
									`- 関連するトピックで検索してみてください`,
							},
						],
					};
				}

				// 結果を統合して回答する場合
				if (options.combineResults !== false) {
					const contexts = results
						.map((result, index) => {
							return (
								`**参考情報 ${index + 1}** (関連度: ${(result.score * 100).toFixed(1)}%)\n` +
								`ソース: ${result.metadata.source || "不明"}\n` +
								`${result.content}\n`
							);
						})
						.join("\n---\n\n");

					const response =
						`## 質問: ${question}\n\n` +
						`以下の情報を基に回答します:\n\n` +
						`${contexts}\n\n` +
						`**📋 要約:**\n` +
						`上記の情報から、${question}に関して以下のことが分かります：\n\n` +
						results
							.map(
								(result, index) =>
									`${index + 1}. ${result.content.substring(0, 150)}...`
							)
							.join("\n") +
						`\n\n**💡 詳細情報:**\n` +
						`より詳しい情報については、上記の参考情報をご確認ください。`;

					return {
						content: [
							{
								type: "text",
								text: response,
							},
						],
					};
				}

				// 個別の検索結果を返す場合
				const resultText = results
					.map((result, index) => {
						return (
							`**検索結果 ${index + 1}:**\n` +
							`関連度スコア: ${(result.score * 100).toFixed(1)}%\n` +
							`ソース: ${result.metadata.source || "不明"}\n` +
							`カテゴリ: ${result.metadata.category || "未分類"}\n` +
							`\n**内容:**\n${result.content}\n`
						);
					})
					.join("\n---\n\n");

				return {
					content: [
						{
							type: "text",
							text:
								`## 質問: ${question}\n\n` +
								`${results.length}件の関連する情報が見つかりました:\n\n` +
								`${resultText}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `RAG検索に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * 高度なRAG検索ツール（フィルター機能付き）
	 */
	server.tool(
		"advanced_rag_search",
		{
			query: z.string().describe("検索クエリ"),
			indexName: z.string().optional().describe("検索対象インデックス名"),
			filters: z
				.object({
					category: z
						.string()
						.optional()
						.describe("カテゴリフィルター"),
					tags: z
						.array(z.string())
						.optional()
						.describe("タグフィルター"),
					source: z.string().optional().describe("ソースフィルター"),
					author: z.string().optional().describe("作成者フィルター"),
				})
				.optional()
				.describe("メタデータフィルター"),
			searchOptions: z
				.object({
					topK: z.number().optional().describe("最大結果数"),
					minScore: z.number().optional().describe("最小スコア"),
					includeVector: z
						.boolean()
						.optional()
						.describe("ベクターデータを含めるか"),
				})
				.optional()
				.describe("検索オプション"),
			outputFormat: z
				.enum(["summary", "detailed", "json"])
				.optional()
				.describe("出力形式"),
		},
		async ({
			query,
			indexName,
			filters = {},
			searchOptions = {},
			outputFormat = "detailed",
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				// フィルターをマージ
				const searchFilter: Record<string, any> = {};
				if (filters.category) searchFilter.category = filters.category;
				if (filters.source) searchFilter.source = filters.source;
				if (filters.author) searchFilter.author = filters.author;
				if (filters.tags && filters.tags.length > 0) {
					// タグは配列の一部がマッチすれば良い
					searchFilter.tags = filters.tags;
				}

				const options = {
					topK: searchOptions.topK || 5,
					filter:
						Object.keys(searchFilter).length > 0
							? searchFilter
							: undefined,
					includeMetadata: true,
					minScore: searchOptions.minScore || 0,
				};

				const results = await ragService.searchDocuments(
					query,
					indexName,
					options
				);

				if (results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `検索クエリ「${query}」${Object.keys(searchFilter).length > 0 ? "（フィルター適用）" : ""}に対する結果が見つかりませんでした。`,
							},
						],
					};
				}

				let responseText = "";

				switch (outputFormat) {
					case "summary":
						responseText =
							`## 検索結果サマリー\n\n` +
							`クエリ: ${query}\n` +
							`結果数: ${results.length}件\n` +
							`インデックス: ${indexName || "documents"}\n\n` +
							`**要約:**\n` +
							results
								.slice(0, 3)
								.map(
									(result, index) =>
										`${index + 1}. ${result.content.substring(0, 100)}... (スコア: ${(result.score * 100).toFixed(1)}%)`
								)
								.join("\n");
						break;

					case "json":
						responseText =
							`## 検索結果（JSON形式）\n\n` +
							`\`\`\`json\n` +
							JSON.stringify(
								{
									query,
									indexName: indexName || "documents",
									resultCount: results.length,
									filters: searchFilter,
									results: results.map((result) => ({
										id: result.id,
										score: result.score,
										content: result.content.substring(
											0,
											200
										),
										metadata: result.metadata,
									})),
								},
								null,
								2
							) +
							`\n\`\`\``;
						break;

					case "detailed":
					default:
						const filterInfo =
							Object.keys(searchFilter).length > 0
								? `\n**適用フィルター:** ${Object.entries(
										searchFilter
									)
										.map(
											([key, value]) =>
												`${key}: ${Array.isArray(value) ? value.join(", ") : value}`
										)
										.join(", ")}\n`
								: "";

						responseText =
							`## 検索結果\n\n` +
							`**クエリ:** ${query}\n` +
							`**結果数:** ${results.length}件${filterInfo}\n` +
							results
								.map((result, index) => {
									const metadata = result.metadata;
									return (
										`### 結果 ${index + 1}\n` +
										`**スコア:** ${(result.score * 100).toFixed(1)}%\n` +
										`**ソース:** ${metadata.source || "不明"}\n` +
										`**カテゴリ:** ${metadata.category || "未分類"}\n` +
										`**タグ:** ${metadata.tags ? metadata.tags.join(", ") : "なし"}\n` +
										`\n**内容:**\n${result.content}\n`
									);
								})
								.join("\n---\n\n");
						break;
				}

				return {
					content: [
						{
							type: "text",
							text: responseText,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `高度なRAG検索に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * セマンティック類似検索ツール
	 */
	server.tool(
		"semantic_similarity_search",
		{
			referenceText: z
				.string()
				.describe("参照テキスト（このテキストに似た内容を検索）"),
			indexName: z.string().optional().describe("検索対象インデックス名"),
			options: z
				.object({
					topK: z
						.number()
						.optional()
						.describe("結果数（デフォルト: 5）"),
					minScore: z
						.number()
						.optional()
						.describe("最小類似度スコア（デフォルト: 0.3）"),
					excludeSelf: z
						.boolean()
						.optional()
						.describe(
							"同一ドキュメントを除外するか（デフォルト: true）"
						),
				})
				.optional()
				.describe("検索オプション"),
		},
		async ({
			referenceText,
			indexName,
			options = {},
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				const searchOptions = {
					topK:
						(options.topK || 5) +
						(options.excludeSelf !== false ? 2 : 0), // 除外分を考慮して多めに取得
					minScore: options.minScore || 0.3,
					includeMetadata: true,
				};

				const results = await ragService.searchDocuments(
					referenceText,
					indexName,
					searchOptions
				);

				// 自己除外処理
				let filteredResults = results;
				if (options.excludeSelf !== false) {
					filteredResults = results.filter((result) => {
						// 参照テキストと完全に同じ内容や、非常に高い類似度（>0.95）のものを除外
						return (
							result.score <= 0.95 &&
							result.content !== referenceText
						);
					});
				}

				// 最終的な結果数に調整
				filteredResults = filteredResults.slice(0, options.topK || 5);

				if (filteredResults.length === 0) {
					return {
						content: [
							{
								type: "text",
								text:
									`参照テキストに類似する内容が見つかりませんでした。\n\n` +
									`**参照テキスト:**\n${referenceText.substring(0, 200)}${referenceText.length > 200 ? "..." : ""}\n\n` +
									`💡 類似度の閾値を下げるか、異なる表現で検索してみてください。`,
							},
						],
					};
				}

				const resultText = filteredResults
					.map((result, index) => {
						return (
							`**類似ドキュメント ${index + 1}:**\n` +
							`類似度: ${(result.score * 100).toFixed(1)}%\n` +
							`ソース: ${result.metadata.source || "不明"}\n` +
							`カテゴリ: ${result.metadata.category || "未分類"}\n` +
							`\n**内容:**\n${result.content}\n` +
							`\n**類似点の分析:**\n` +
							`この内容は参照テキストと${result.score > 0.7 ? "高い" : result.score > 0.5 ? "中程度の" : "低い"}類似度を持っています。`
						);
					})
					.join("\n---\n\n");

				return {
					content: [
						{
							type: "text",
							text:
								`## セマンティック類似検索結果\n\n` +
								`**参照テキスト:**\n${referenceText.substring(0, 300)}${referenceText.length > 300 ? "..." : ""}\n\n` +
								`**類似ドキュメント（${filteredResults.length}件）:**\n\n` +
								`${resultText}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `セマンティック類似検索に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * RAG設定情報表示ツール
	 */
	server.tool(
		"get_rag_info",
		{},
		async (): Promise<{
			content: Array<{ type: "text"; text: string }>;
		}> => {
			try {
				const indexes = await ragService.listIndexes();

				return {
					content: [
						{
							type: "text",
							text:
								`RAG データベース情報:\n\n` +
								`利用可能なインデックス: ${indexes.length > 0 ? indexes.join(", ") : "なし"}\n` +
								`サポートされているファイル形式: Markdown\n` +
								`チャンキング戦略: recursive, character, token, markdown, html, json, latex\n` +
								`埋め込みプロバイダー: OpenAI, Google（Anthropicは将来対応予定）\n` +
								`ベクターストア: LibSQL\n\n` +
								`**利用可能な検索ツール:**\n` +
								`• rag_search - 質問応答形式のRAG検索\n` +
								`• advanced_rag_search - フィルター機能付き高度検索\n` +
								`• semantic_similarity_search - セマンティック類似検索\n` +
								`• search_documents - 基本的なドキュメント検索`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `RAG情報取得に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);

	/**
	 * ドキュメント一覧表示ツール
	 */
	server.tool(
		"list_documents",
		{
			indexName: z
				.string()
				.optional()
				.describe("一覧を取得するインデックス名（省略時はデフォルト）"),
			limit: z
				.number()
				.min(1)
				.max(100)
				.optional()
				.describe("取得するドキュメント数（1-100、デフォルト: 20）"),
			offset: z
				.number()
				.min(0)
				.optional()
				.describe("開始位置（0から開始、デフォルト: 0）"),
			filter: z
				.object({
					category: z
						.string()
						.optional()
						.describe("カテゴリフィルター"),
					author: z.string().optional().describe("作成者フィルター"),
					source: z.string().optional().describe("ソースフィルター"),
					tags: z
						.array(z.string())
						.optional()
						.describe("タグフィルター"),
				})
				.optional()
				.describe("フィルター条件"),
		},
		async ({
			indexName,
			limit = 20,
			offset = 0,
			filter,
		}): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
			try {
				const result = await ragService.listDocuments(
					indexName,
					limit,
					offset,
					filter
				);

				if (result.documents.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: filter
									? `指定された条件に一致するドキュメントが見つかりませんでした。\n\n**フィルター条件:**\n${JSON.stringify(filter, null, 2)}`
									: `${indexName || "デフォルト"}インデックスにドキュメントが登録されていません。`,
							},
						],
					};
				}

				// ページネーション情報
				const currentPage = Math.floor(offset / limit) + 1;
				const totalPages = Math.ceil(result.total / limit);
				const hasNextPage = offset + limit < result.total;
				const hasPrevPage = offset > 0;

				// ドキュメント一覧の生成
				const documentList = result.documents
					.map((doc, index) => {
						const displayIndex = offset + index + 1;
						const contentPreview = doc.content
							.replace(/\n+/g, " ")
							.substring(0, 150);
						const contentSuffix =
							doc.content.length > 150 ? "..." : "";

						return (
							`**${displayIndex}. ${doc.metadata.title || "無題のドキュメント"}**\n` +
							`📅 作成日: ${doc.createdAt.toLocaleDateString("ja-JP")}\n` +
							`📝 更新日: ${doc.updatedAt.toLocaleDateString("ja-JP")}\n` +
							`🔖 カテゴリ: ${doc.metadata.category || "未分類"}\n` +
							`👤 作成者: ${doc.metadata.author || "不明"}\n` +
							`📂 ソース: ${doc.metadata.source || "不明"}\n` +
							`🧩 チャンク数: ${doc.metadata.chunks || 1}\n` +
							`🏷️ タグ: ${doc.metadata.tags ? doc.metadata.tags.join(", ") : "なし"}\n` +
							`📄 プレビュー: ${contentPreview}${contentSuffix}\n` +
							`🆔 ID: ${doc.id}`
						);
					})
					.join("\n\n---\n\n");

				// レスポンステキストの組み立て
				let responseText = `## 📚 ドキュメント一覧\n\n`;
				responseText += `**インデックス:** ${indexName || "documents"}\n`;
				responseText += `**総ドキュメント数:** ${result.total}件\n`;
				responseText += `**表示範囲:** ${offset + 1}-${Math.min(offset + limit, result.total)}件\n`;
				responseText += `**ページ:** ${currentPage}/${totalPages}\n\n`;

				if (filter) {
					responseText += `**適用フィルター:**\n`;
					if (filter.category)
						responseText += `• カテゴリ: ${filter.category}\n`;
					if (filter.author)
						responseText += `• 作成者: ${filter.author}\n`;
					if (filter.source)
						responseText += `• ソース: ${filter.source}\n`;
					if (filter.tags)
						responseText += `• タグ: ${filter.tags.join(", ")}\n`;
					responseText += `\n`;
				}

				responseText += `${documentList}\n\n`;

				// ページネーション案内
				if (totalPages > 1) {
					responseText += `## 📄 ページナビゲーション\n\n`;
					if (hasPrevPage) {
						responseText += `⬅️ 前のページを見るには: offset=${Math.max(0, offset - limit)}\n`;
					}
					if (hasNextPage) {
						responseText += `➡️ 次のページを見るには: offset=${offset + limit}\n`;
					}
					responseText += `\n💡 **使用例:** \`list_documents indexName="${indexName || "documents"}" limit=${limit} offset=${offset + limit}\``;
				}

				return {
					content: [
						{
							type: "text",
							text: responseText,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `ドキュメント一覧取得に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		}
	);
}
