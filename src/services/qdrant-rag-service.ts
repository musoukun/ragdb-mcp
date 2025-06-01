import { QdrantVector } from "@mastra/qdrant";
import { MDocument } from "@mastra/rag";
import { embedMany, embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
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
	QdrantConfig,
} from "../types/index.js";
import { RagError } from "../types/index.js";

/**
 * Qdrant用RAGサービス - Qdrant Vector Databaseを使用したドキュメント管理
 */
export class QdrantRagService {
	private vectorStore: QdrantVector;
	private embeddingConfig: EmbeddingConfig;
	private markdown: MarkdownIt;
	private defaultIndexName = "documents";

	constructor(qdrantConfig: QdrantConfig, embeddingConfig: EmbeddingConfig) {
		this.vectorStore = new QdrantVector({
			url: qdrantConfig.url,
			apiKey: qdrantConfig.apiKey,
		});
		this.embeddingConfig = embeddingConfig;
		this.markdown = new MarkdownIt();
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
	 * インデックス情報を取得
	 */
	async describeIndex(indexName: string): Promise<any> {
		try {
			return await this.vectorStore.describeIndex({ indexName });
		} catch (error) {
			throw new RagError(
				`Failed to describe index: ${error instanceof Error ? error.message : "Unknown error"}`,
				"INDEX_DESCRIBE_ERROR",
				{ indexName }
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
			const queryVector = await this.generateQueryEmbedding(query);
			const results = await this.vectorStore.query({
				indexName,
				queryVector,
				topK: options.topK || 10,
				filter: options.filter,
				includeVector: false,
			});

			return results.map((result) => ({
				id: result.id,
				content: result.metadata?.text || "",
				metadata: (result.metadata || {}) as ChunkMetadata,
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
	 * ドキュメント一覧を取得
	 */
	async listDocuments(
		indexName: string = this.defaultIndexName,
		limit: number = 20,
		offset: number = 0,
		filter?: Record<string, any>
	): Promise<{ documents: Document[]; total: number }> {
		try {
			// Qdrantでは、全てのドキュメントを取得するために、ダミーのクエリベクトルを使用
			const dummyVector = new Array(this.getDefaultDimensions()).fill(0);

			const results = await this.vectorStore.query({
				indexName,
				queryVector: dummyVector,
				topK: Math.max(limit + offset, 10000), // 十分大きなtopKを指定
				filter: filter,
				includeVector: false,
			});

			// チャンクからドキュメントを集約
			const documentMap = new Map<string, Document>();
			const chunkCounts = new Map<string, number>();

			for (const result of results) {
				const metadata = result.metadata || {};
				const documentId = metadata.documentId;
				if (!documentId) continue;

				// チャンク数をカウント
				chunkCounts.set(
					documentId,
					(chunkCounts.get(documentId) || 0) + 1
				);

				if (!documentMap.has(documentId)) {
					// メタデータからチャンク固有の情報を除去
					const cleanMetadata = { ...metadata };
					delete cleanMetadata.chunkId;
					delete cleanMetadata.chunkIndex;
					delete cleanMetadata.startPosition;
					delete cleanMetadata.endPosition;
					delete cleanMetadata.embedding_index;
					delete cleanMetadata.text;

					// チャンク数を追加
					cleanMetadata.chunkCount = chunkCounts.get(documentId);

					const document: Document = {
						id: documentId,
						content: metadata.text || "",
						metadata: cleanMetadata,
						createdAt: new Date(
							cleanMetadata.createdAt || new Date()
						),
						updatedAt: new Date(
							cleanMetadata.updatedAt || new Date()
						),
					};
					documentMap.set(documentId, document);
				}
			}

			const allDocuments = Array.from(documentMap.values());

			// 作成日時で降順ソート
			allDocuments.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() -
					new Date(a.createdAt).getTime()
			);

			// ページネーション適用
			const startIndex = offset;
			const endIndex = offset + limit;
			const paginatedDocuments = allDocuments.slice(startIndex, endIndex);

			return {
				documents: paginatedDocuments,
				total: allDocuments.length,
			};
		} catch (error) {
			throw new RagError(
				`Failed to list documents: ${error instanceof Error ? error.message : "Unknown error"}`,
				"DOCUMENT_LIST_ERROR",
				{ indexName, limit, offset, filter }
			);
		}
	}

	private async chunkDocument(
		document: Document,
		options: Partial<ChunkingOptions> = {}
	): Promise<Chunk[]> {
		const chunkingOptions: ChunkingOptions = {
			strategy: options.strategy || "recursive",
			size: options.size || 512,
			overlap: options.overlap || 50,
			separator: options.separator,
			extractMetadata: options.extractMetadata ?? true,
		};

		const mdoc = MDocument.fromText(document.content, document.metadata);

		const chunks = await mdoc.chunk(chunkingOptions);

		return chunks.map((chunk, index) => ({
			id: randomUUID(),
			documentId: document.id,
			content: chunk.text,
			metadata: {
				...document.metadata,
				chunkIndex: index,
				startPosition: (chunk as any).startIndex || 0,
				endPosition: (chunk as any).endIndex || chunk.text.length,
			},
		}));
	}

	private async generateEmbeddings(texts: string[]): Promise<number[][]> {
		const { embeddings } = await embedMany({
			values: texts,
			model: this.getEmbeddingModel(),
		});
		return embeddings;
	}

	private async generateQueryEmbedding(query: string): Promise<number[]> {
		const { embedding } = await embed({
			value: query,
			model: this.getEmbeddingModel(),
		});
		return embedding;
	}

	private getEmbeddingModel() {
		switch (this.embeddingConfig.provider) {
			case "openai":
				return openai.embedding(this.embeddingConfig.model);
			case "google":
				return google.embedding(this.embeddingConfig.model);
			default:
				throw new RagError(
					`Unsupported embedding provider: ${this.embeddingConfig.provider}`,
					"UNSUPPORTED_PROVIDER"
				);
		}
	}

	private getDefaultDimensions(): number {
		if (this.embeddingConfig.dimensions) {
			return this.embeddingConfig.dimensions;
		}

		// プロバイダーとモデルに基づくデフォルト次元数
		switch (this.embeddingConfig.provider) {
			case "openai":
				if (
					this.embeddingConfig.model.includes(
						"text-embedding-3-small"
					)
				) {
					return 1536;
				} else if (
					this.embeddingConfig.model.includes(
						"text-embedding-3-large"
					)
				) {
					return 3072;
				}
				return 1536; // デフォルト
			case "google":
				if (this.embeddingConfig.model.includes("text-embedding-004")) {
					return 768;
				}
				return 768; // デフォルト
			case "anthropic":
				return 1024; // デフォルト（Anthropic Claude embedding）
			default:
				return 1536; // 一般的なデフォルト
		}
	}

	private async findExistingDocument(
		content: string,
		indexName: string
	): Promise<Document | null> {
		try {
			// コンテンツの最初の部分で検索して重複を確認
			const searchText = content.substring(0, 200);
			const results = await this.searchDocuments(searchText, indexName, {
				topK: 5,
			});

			for (const result of results) {
				if (result.content.includes(searchText) && result.score > 0.9) {
					return {
						id: result.metadata.documentId || result.id,
						content: result.content,
						metadata: result.metadata,
						createdAt: new Date(
							result.metadata.createdAt || new Date()
						),
						updatedAt: new Date(
							result.metadata.updatedAt || new Date()
						),
					};
				}
			}

			return null;
		} catch (error) {
			console.warn("Failed to check for existing document:", error);
			return null;
		}
	}

	private async deleteDocumentChunks(
		documentId: string,
		indexName: string
	): Promise<void> {
		try {
			// ドキュメントに属するチャンクを検索
			const dummyVector = new Array(this.getDefaultDimensions()).fill(0);
			const results = await this.vectorStore.query({
				indexName,
				queryVector: dummyVector,
				topK: 10000,
				filter: { documentId: { $eq: documentId } },
				includeVector: false,
			});

			// チャンクIDを抽出して削除
			const chunkIds = results.map((result) => result.id);
			for (const chunkId of chunkIds) {
				await this.vectorStore.deleteVector({
					indexName,
					id: chunkId,
				});
			}
		} catch (error) {
			throw new RagError(
				`Failed to delete document chunks: ${error instanceof Error ? error.message : "Unknown error"}`,
				"CHUNK_DELETE_ERROR",
				{ documentId, indexName }
			);
		}
	}
}
