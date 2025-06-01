import { LibSQLVector } from "@mastra/libsql";
import { MDocument } from "@mastra/rag";
import { embedMany, embed } from "ai";
import { openai } from "@ai-sdk/openai";
// import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import MarkdownIt from "markdown-it";
import { randomUUID } from "crypto";
import type {
	Document,
	Chunk,
	DocumentMetadata,
	ChunkMetadata,
	SearchOptions,
	SearchResult,
	ChunkingOptions,
	EmbeddingConfig,
	LibSQLConfig,
	DuplicateCheckConfig,
	AddDocumentResult,
	DuplicateCheckResult,
} from "../types/index.js";
import { RagError } from "../types/index.js";
import { DuplicateCheckService } from "./duplicate-check-service.js";

/**
 * RAGサービス - LibSQL Vector Storeを使用したドキュメント管理
 */
export class RagService {
	private vectorStore: LibSQLVector;
	private embeddingConfig: EmbeddingConfig;
	private markdown: MarkdownIt;
	private defaultIndexName = "documents";
	private duplicateCheckService: DuplicateCheckService;

	constructor(libsqlConfig: LibSQLConfig, embeddingConfig: EmbeddingConfig) {
		this.vectorStore = new LibSQLVector(libsqlConfig);
		this.embeddingConfig = embeddingConfig;
		this.markdown = new MarkdownIt();
		this.duplicateCheckService = new DuplicateCheckService(embeddingConfig);
	}

	/**
	 * インデックスを作成
	 */
	async createIndex(indexName: string, dimension?: number): Promise<void> {
		try {
			const dims = dimension || this.getDefaultDimensions();
			await this.vectorStore.createIndex({
				indexName,
				dimension: dims,
				metric: "cosine",
			});
		} catch (error) {
			throw new RagError(
				`Failed to create index: ${error instanceof Error ? error.message : "Unknown error"}`,
				"INDEX_CREATION_ERROR",
				{ indexName, dimension }
			);
		}
	}

	/**
	 * インデックスを削除
	 */
	async deleteIndex(indexName: string): Promise<void> {
		try {
			await this.vectorStore.deleteIndex({ indexName });
		} catch (error) {
			throw new RagError(
				`Failed to delete index: ${error instanceof Error ? error.message : "Unknown error"}`,
				"INDEX_DELETION_ERROR",
				{ indexName }
			);
		}
	}

	/**
	 * インデックス一覧を取得
	 */
	async listIndexes(): Promise<string[]> {
		try {
			return await this.vectorStore.listIndexes();
		} catch (error) {
			throw new RagError(
				`Failed to list indexes: ${error instanceof Error ? error.message : "Unknown error"}`,
				"INDEX_LIST_ERROR"
			);
		}
	}

	/**
	 * ドキュメントを追加
	 */
	async addDocument(
		content: string,
		metadata: DocumentMetadata = {},
		chunkingOptions: Partial<ChunkingOptions> = {},
		indexName: string = this.defaultIndexName
	): Promise<Document> {
		try {
			// ドキュメントの重複チェック
			const existingDoc = await this.findExistingDocument(
				content,
				indexName
			);
			if (existingDoc) {
				return await this.updateDocument(
					existingDoc.id,
					content,
					metadata,
					chunkingOptions,
					indexName
				);
			}

			const document: Document = {
				id: randomUUID(),
				content,
				metadata: {
					...metadata,
					source: metadata.source || "manual_input",
					createdAt: new Date().toISOString(),
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			// ドキュメントをチャンクに分割
			const chunks = await this.chunkDocument(document, chunkingOptions);

			// 埋め込みを生成
			const embeddings = await this.generateEmbeddings(
				chunks.map((chunk) => chunk.content)
			);

			// ベクターストアに保存
			await this.vectorStore.upsert({
				indexName,
				vectors: embeddings,
				metadata: chunks.map((chunk, index) => ({
					...chunk.metadata,
					text: chunk.content,
					documentId: document.id,
					chunkId: chunk.id,
					embedding_index: index,
				})),
				ids: chunks.map((chunk) => chunk.id),
			});

			return document;
		} catch (error) {
			throw new RagError(
				`Failed to add document: ${error instanceof Error ? error.message : "Unknown error"}`,
				"DOCUMENT_ADD_ERROR",
				{ metadata, indexName }
			);
		}
	}

	/**
	 * ドキュメントを更新
	 */
	async updateDocument(
		documentId: string,
		content?: string,
		metadata?: Partial<DocumentMetadata>,
		chunkingOptions: Partial<ChunkingOptions> = {},
		indexName: string = this.defaultIndexName
	): Promise<Document> {
		try {
			// 既存のチャンクを削除
			await this.deleteDocumentChunks(documentId, indexName);

			// 更新されたドキュメントを作成
			const document: Document = {
				id: documentId,
				content: content || "",
				metadata: {
					...metadata,
					updatedAt: new Date().toISOString(),
				},
				createdAt: new Date(), // この値は実際には既存の値を使用すべき
				updatedAt: new Date(),
			};

			if (content) {
				// 新しいチャンクを作成
				const chunks = await this.chunkDocument(
					document,
					chunkingOptions
				);

				// 埋め込みを生成
				const embeddings = await this.generateEmbeddings(
					chunks.map((chunk) => chunk.content)
				);

				// ベクターストアに保存
				await this.vectorStore.upsert({
					indexName,
					vectors: embeddings,
					metadata: chunks.map((chunk, index) => ({
						...chunk.metadata,
						text: chunk.content,
						documentId: document.id,
						chunkId: chunk.id,
						embedding_index: index,
					})),
					ids: chunks.map((chunk) => chunk.id),
				});
			}

			return document;
		} catch (error) {
			throw new RagError(
				`Failed to update document: ${error instanceof Error ? error.message : "Unknown error"}`,
				"DOCUMENT_UPDATE_ERROR",
				{ documentId, indexName }
			);
		}
	}

	/**
	 * ドキュメントを削除
	 */
	async deleteDocument(
		documentId: string,
		indexName: string = this.defaultIndexName
	): Promise<void> {
		try {
			await this.deleteDocumentChunks(documentId, indexName);
		} catch (error) {
			throw new RagError(
				`Failed to delete document: ${error instanceof Error ? error.message : "Unknown error"}`,
				"DOCUMENT_DELETE_ERROR",
				{ documentId, indexName }
			);
		}
	}

	/**
	 * ドキュメントを検索
	 */
	async searchDocuments(
		query: string,
		indexName: string = this.defaultIndexName,
		options: SearchOptions = {}
	): Promise<SearchResult[]> {
		try {
			// クエリの埋め込みを生成
			const queryEmbedding = await this.generateQueryEmbedding(query);

			// ベクター検索を実行
			const results = await this.vectorStore.query({
				indexName,
				queryVector: queryEmbedding,
				topK: options.topK || 5,
				filter: options.filter,
				includeVector: false,
				minScore: options.minScore || 0,
			});

			return results.map((result: any) => ({
				id: result.metadata.chunkId || result.id,
				content: result.metadata.text || "",
				metadata: {
					...result.metadata,
					chunkIndex: result.metadata.chunkIndex || 0,
					startPosition: result.metadata.startPosition || 0,
					endPosition: result.metadata.endPosition || 0,
				} as ChunkMetadata,
				score: result.score,
			}));
		} catch (error) {
			throw new RagError(
				`Failed to search documents: ${error instanceof Error ? error.message : "Unknown error"}`,
				"DOCUMENT_SEARCH_ERROR",
				{ query, indexName, options }
			);
		}
	}

	/**
	 * ドキュメントをチャンクに分割
	 */
	private async chunkDocument(
		document: Document,
		options: Partial<ChunkingOptions> = {}
	): Promise<Chunk[]> {
		const chunkingOptions: ChunkingOptions = {
			strategy: options.strategy || "markdown",
			size: options.size || 512,
			overlap: options.overlap || 50,
			separator: options.separator,
			extractMetadata: options.extractMetadata || false,
		};

		// MDocumentを作成
		const mdoc = MDocument.fromMarkdown(document.content);

		// チャンキングを実行
		await mdoc.chunk({
			strategy: chunkingOptions.strategy,
			size: chunkingOptions.size,
			overlap: chunkingOptions.overlap,
			...(chunkingOptions.separator && {
				separator: chunkingOptions.separator,
			}),
		});

		const chunks = mdoc.getDocs();

		return chunks.map((chunk: any, index: number) => ({
			id: `${document.id}_chunk_${index}`,
			documentId: document.id,
			content: chunk.text,
			metadata: {
				...document.metadata,
				chunkIndex: index,
				startPosition: 0, // MDcumentからは取得できない
				endPosition: chunk.text.length,
			} as ChunkMetadata,
		}));
	}

	/**
	 * 埋め込みを生成
	 */
	private async generateEmbeddings(texts: string[]): Promise<number[][]> {
		const model = this.getEmbeddingModel();

		const { embeddings } = await embedMany({
			model,
			values: texts,
		});

		return embeddings;
	}

	/**
	 * クエリの埋め込みを生成
	 */
	private async generateQueryEmbedding(query: string): Promise<number[]> {
		const model = this.getEmbeddingModel();

		const { embedding } = await embed({
			model,
			value: query,
		});

		return embedding;
	}

	/**
	 * 埋め込みモデルを取得
	 */
	private getEmbeddingModel() {
		const { provider, model, apiKey, dimensions } = this.embeddingConfig;

		switch (provider) {
			case "openai":
				return openai.embedding(model, {
					...(dimensions && { dimensions }),
				});
			case "anthropic":
				// Anthropicは現在埋め込みAPIを提供していないため、OpenAIにフォールバック
				console.warn(
					"Anthropic embedding not available, falling back to OpenAI"
				);
				return openai.embedding("text-embedding-3-small");
			case "google":
				// GoogleプロバイダーにAPIキーを明示的に設定
				const googleAI = createGoogleGenerativeAI({
					apiKey: apiKey, // EMBEDDING_API_KEYを明示的に渡す
				});
				return googleAI.textEmbeddingModel(model, {
					...(dimensions && { outputDimensionality: dimensions }),
				});
			default:
				throw new RagError(
					`Unsupported embedding provider: ${provider}`,
					"INVALID_EMBEDDING_PROVIDER"
				);
		}
	}

	/**
	 * デフォルトの次元数を取得
	 */
	private getDefaultDimensions(): number {
		if (this.embeddingConfig.dimensions) {
			return this.embeddingConfig.dimensions;
		}

		const { provider, model } = this.embeddingConfig;

		// モデル別のデフォルト次元数
		switch (provider) {
			case "openai":
				if (model.includes("text-embedding-3-small")) return 1536;
				if (model.includes("text-embedding-3-large")) return 3072;
				return 1536; // デフォルト
			case "google":
				if (model.includes("text-embedding-004")) return 768;
				return 768; // デフォルト
			default:
				return 1536; // デフォルト
		}
	}

	/**
	 * 既存のドキュメントを検索（重複チェック用）
	 */
	private async findExistingDocument(
		content: string,
		indexName: string
	): Promise<Document | null> {
		try {
			// コンテンツの最初の100文字でハッシュ的な検索を行う
			const searchQuery = content.substring(0, 100);
			const results = await this.searchDocuments(searchQuery, indexName, {
				topK: 1,
			});

			if (results.length > 0 && results[0].score > 0.95) {
				// 高い類似度なら同じドキュメントとみなす
				return {
					id: results[0].metadata.documentId || results[0].id,
					content: results[0].content,
					metadata: results[0].metadata,
					createdAt: new Date(),
					updatedAt: new Date(),
				};
			}

			return null;
		} catch (error) {
			// 検索に失敗した場合は重複なしとみなす
			return null;
		}
	}

	/**
	 * ドキュメントのチャンクを削除
	 */
	private async deleteDocumentChunks(
		documentId: string,
		indexName: string
	): Promise<void> {
		try {
			// LibSQLではフィルターによる一括削除ができないため、
			// まず該当チャンクを検索してからIDで削除
			const dummyEmbedding = Array(this.getDefaultDimensions()).fill(0);
			const results = await this.vectorStore.query({
				indexName,
				queryVector: dummyEmbedding,
				topK: 1000, // 大きな値で全チャンクを取得
				filter: { documentId },
				includeVector: false,
			});

			// 各チャンクを個別に削除
			for (const result of results) {
				await this.vectorStore.deleteVector({
					indexName,
					id: result.id,
				});
			}
		} catch (error) {
			// エラーが発生してもログに記録するだけで継続
			console.warn(
				`Failed to delete chunks for document ${documentId}:`,
				error
			);
		}
	}

	/**
	 * 🆕 ドキュメントを追加（重複検知対応版）
	 */
	async addDocumentWithDuplicateCheck(
		content: string,
		metadata: DocumentMetadata = {},
		chunkingOptions: Partial<ChunkingOptions> = {},
		indexName: string = this.defaultIndexName,
		duplicateCheckConfig?: DuplicateCheckConfig
	): Promise<AddDocumentResult> {
		try {
			let duplicateCheckResult: DuplicateCheckResult | undefined;

			// 重複検知が有効な場合
			if (duplicateCheckConfig?.enabled) {
				// 新規ドキュメントの埋め込みを生成
				const queryEmbedding = await this.generateQueryEmbedding(
					content.substring(0, 1000)
				);

				// 類似ドキュメントを検索
				const existingResults = await this.vectorStore.query({
					indexName,
					queryVector: queryEmbedding,
					topK: duplicateCheckConfig.topK || 10,
					includeVector: false,
				});

				// 重複チェック実行
				duplicateCheckResult =
					await this.duplicateCheckService.checkForDuplicates(
						content,
						metadata,
						existingResults.map((result) => ({
							id: result.id,
							content: result.metadata?.text || "",
							metadata: {
								...result.metadata,
								chunkIndex: result.metadata?.chunkIndex || 0,
								startPosition:
									result.metadata?.startPosition || 0,
								endPosition:
									result.metadata?.endPosition ||
									result.metadata?.text?.length ||
									0,
							} as ChunkMetadata,
							score: result.score || 0,
						})),
						duplicateCheckConfig
					);

				// AI判断に基づくアクション実行
				if (
					duplicateCheckResult.isDuplicate &&
					duplicateCheckResult.decision
				) {
					const decision = duplicateCheckResult.decision;

					switch (decision.action) {
						case "skip":
							return {
								document: this.createSkippedDocument(
									content,
									metadata
								),
								duplicateCheck: duplicateCheckResult,
								action: "skipped",
								message: `ドキュメントの追加をスキップしました。理由: ${decision.reason}`,
							};

						case "update":
							if (decision.targetDocumentId) {
								const updatedDocument =
									await this.updateDocument(
										decision.targetDocumentId,
										content,
										metadata,
										chunkingOptions,
										indexName
									);
								return {
									document: updatedDocument,
									duplicateCheck: duplicateCheckResult,
									action: "updated",
									message: `既存ドキュメントを更新しました。理由: ${decision.reason}`,
								};
							}
							// フォールスルー: updateだがtargetDocumentIdがない場合は新規追加
							break;

						case "add":
							// 新規追加を継続
							break;
					}
				}
			}

			// 通常の新規追加処理
			const document = await this.addDocument(
				content,
				metadata,
				chunkingOptions,
				indexName
			);

			return {
				document,
				duplicateCheck: duplicateCheckResult,
				action: "added",
				message: duplicateCheckResult?.isDuplicate
					? `類似ドキュメントが見つかりましたが、新規追加しました。理由: ${duplicateCheckResult.decision?.reason || "AI判断により新規追加"}`
					: "新規ドキュメントを追加しました。",
			};
		} catch (error) {
			throw new RagError(
				`Failed to add document with duplicate check: ${error instanceof Error ? error.message : "Unknown error"}`,
				"DOCUMENT_ADD_WITH_DUPLICATE_CHECK_ERROR",
				{
					metadata,
					indexName,
					duplicateCheckEnabled: duplicateCheckConfig?.enabled,
				}
			);
		}
	}

	/**
	 * スキップ用のダミードキュメントを作成
	 */
	private createSkippedDocument(
		content: string,
		metadata: DocumentMetadata
	): Document {
		return {
			id: "skipped-" + randomUUID(),
			content,
			metadata: {
				...metadata,
				source: metadata.source || "manual_input",
				createdAt: new Date().toISOString(),
				skipped: true,
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	/**
	 * ドキュメント一覧を取得
	 */
	async listDocuments(
		indexName: string = this.defaultIndexName,
		limit: number = 20,
		offset: number = 0,
		filter?: Record<string, any>
	): Promise<{ documents: Document[]; total: number }> {
		try {
			// ダミーのクエリベクターを作成（全データ取得のため）
			const dummyEmbedding = Array(this.getDefaultDimensions()).fill(0);

			// 大きなtopK値で全チャンクを取得
			const results = await this.vectorStore.query({
				indexName,
				queryVector: dummyEmbedding,
				topK: 10000, // 大きな値で制限なく取得
				filter,
				includeVector: false,
			});

			// チャンクからドキュメントを集約
			const documentMap = new Map<
				string,
				{
					id: string;
					content: string;
					metadata: DocumentMetadata;
					createdAt: Date;
					updatedAt: Date;
					chunks: number;
				}
			>();

			for (const result of results) {
				const documentId = result.metadata?.documentId || result.id;
				const chunkContent = result.metadata?.text || "";

				if (documentMap.has(documentId)) {
					// 既存ドキュメントにチャンク情報を追加
					const doc = documentMap.get(documentId)!;
					doc.chunks += 1;
					// より長いコンテンツがあれば更新（最初のチャンクが通常最も包括的）
					if (chunkContent.length > doc.content.length) {
						doc.content = chunkContent;
					}
				} else {
					// 新しいドキュメントを作成
					const metadata = { ...result.metadata };
					// チャンク固有のメタデータを除去
					delete metadata.chunkIndex;
					delete metadata.startPosition;
					delete metadata.endPosition;
					delete metadata.text;
					delete metadata.chunkId;
					delete metadata.embedding_index;

					documentMap.set(documentId, {
						id: documentId,
						content: chunkContent,
						metadata: metadata as DocumentMetadata,
						createdAt: new Date(metadata.createdAt || new Date()),
						updatedAt: new Date(metadata.updatedAt || new Date()),
						chunks: 1,
					});
				}
			}

			// ドキュメント配列に変換
			const allDocuments = Array.from(documentMap.values()).map(
				(doc) => ({
					id: doc.id,
					content: doc.content,
					metadata: {
						...doc.metadata,
						chunks: doc.chunks, // チャンク数を追加
					},
					createdAt: doc.createdAt,
					updatedAt: doc.updatedAt,
				})
			);

			// 作成日時でソート（新しい順）
			allDocuments.sort(
				(a, b) => b.createdAt.getTime() - a.createdAt.getTime()
			);

			// ページネーション適用
			const total = allDocuments.length;
			const paginatedDocuments = allDocuments.slice(
				offset,
				offset + limit
			);

			return {
				documents: paginatedDocuments,
				total,
			};
		} catch (error) {
			throw new RagError(
				`Failed to list documents: ${error instanceof Error ? error.message : "Unknown error"}`,
				"DOCUMENT_LIST_ERROR",
				{ indexName, limit, offset, filter }
			);
		}
	}
}
