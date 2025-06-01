import { PgVector } from "@mastra/pg";
import { MDocument } from "@mastra/rag";
import { embedMany, embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
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
} from "../types/index.js";
import { RagError } from "../types/index.js";

/**
 * PgVector用RAGサービス - PostgreSQL + pgvectorを使用したドキュメント管理
 */
export class PgVectorRagService {
	private vectorStore: PgVector;
	private embeddingConfig: EmbeddingConfig;
	private markdown: MarkdownIt;
	private defaultIndexName = "documents";

	constructor(connectionString: string, embeddingConfig: EmbeddingConfig) {
		this.vectorStore = new PgVector({ connectionString });
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
	 * ベクターを更新
	 */
	async updateVector(
		indexName: string,
		id: string,
		vector?: number[],
		metadata?: Record<string, any>
	): Promise<void> {
		try {
			await this.vectorStore.updateVector({
				indexName,
				id,
				update: {
					...(vector && { vector }),
					...(metadata && { metadata }),
				},
			});
		} catch (error) {
			throw new RagError(
				`Failed to update vector: ${error instanceof Error ? error.message : "Unknown error"}`,
				"VECTOR_UPDATE_ERROR",
				{ indexName, id }
			);
		}
	}

	/**
	 * ベクターを削除
	 */
	async deleteVector(indexName: string, id: string): Promise<void> {
		try {
			await this.vectorStore.deleteVector({ indexName, id });
		} catch (error) {
			throw new RagError(
				`Failed to delete vector: ${error instanceof Error ? error.message : "Unknown error"}`,
				"VECTOR_DELETE_ERROR",
				{ indexName, id }
			);
		}
	}

	/**
	 * インデックスを切り詰め（全データ削除）
	 */
	async truncateIndex(indexName: string): Promise<void> {
		try {
			await this.vectorStore.truncateIndex({ indexName });
		} catch (error) {
			throw new RagError(
				`Failed to truncate index: ${error instanceof Error ? error.message : "Unknown error"}`,
				"INDEX_TRUNCATE_ERROR",
				{ indexName }
			);
		}
	}

	// 以下、LibSQL版と同じヘルパーメソッド群

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

		return chunks.map((chunk, index) => ({
			id: `${document.id}_chunk_${index}`,
			documentId: document.id,
			content: chunk.text,
			metadata: {
				...document.metadata,
				chunkIndex: index,
				startPosition: 0,
				endPosition: chunk.text.length,
			} as ChunkMetadata,
		}));
	}

	/**
	 * 埋め込みを生成
	 */
	private async generateEmbeddings(texts: string[]): Promise<number[][]> {
		const model = this.getEmbeddingModel();
		const { embeddings } = await embedMany({ model, values: texts });
		return embeddings;
	}

	/**
	 * クエリの埋め込みを生成
	 */
	private async generateQueryEmbedding(query: string): Promise<number[]> {
		const model = this.getEmbeddingModel();
		const { embedding } = await embed({ model, value: query });
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

		switch (provider) {
			case "openai":
				if (model.includes("text-embedding-3-small")) return 1536;
				if (model.includes("text-embedding-3-large")) return 3072;
				return 1536;
			case "google":
				if (model.includes("text-embedding-004")) return 768;
				return 768;
			default:
				return 1536;
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
			const searchQuery = content.substring(0, 100);
			const results = await this.searchDocuments(searchQuery, indexName, {
				topK: 1,
			});

			if (results.length > 0 && results[0].score > 0.95) {
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
			// PgVectorではフィルターによる検索で該当チャンクを特定
			const dummyEmbedding = Array(this.getDefaultDimensions()).fill(0);
			const results = await this.vectorStore.query({
				indexName,
				queryVector: dummyEmbedding,
				topK: 1000,
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
			console.warn(
				`Failed to delete chunks for document ${documentId}:`,
				error
			);
		}
	}
}
