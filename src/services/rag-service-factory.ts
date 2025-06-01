import { RagService } from "./rag-service.js";
import { PgVectorRagService } from "./pgvector-rag-service.js";
import { QdrantRagService } from "./qdrant-rag-service.js";
import type { VectorStoreConfig, EmbeddingConfig } from "../types/index.js";

/**
 * RAGサービスファクトリー
 * 設定に基づいて適切なRAGサービスインスタンスを作成
 */
export class RagServiceFactory {
	/**
	 * 設定に基づいてRAGサービスを作成
	 */
	static createService(
		vectorStoreConfig: VectorStoreConfig,
		embeddingConfig: EmbeddingConfig
	): RagService | PgVectorRagService | QdrantRagService {
		switch (vectorStoreConfig.type) {
			case "libsql":
				if (!vectorStoreConfig.libsql) {
					throw new Error(
						"LibSQL configuration is required when type is libsql"
					);
				}
				return new RagService(
					vectorStoreConfig.libsql,
					embeddingConfig
				);

			case "pgvector":
				if (!vectorStoreConfig.pgvector) {
					throw new Error(
						"PgVector configuration is required when type is pgvector"
					);
				}
				return new PgVectorRagService(
					vectorStoreConfig.pgvector.connectionString,
					embeddingConfig
				);

			case "qdrant":
				if (!vectorStoreConfig.qdrant) {
					throw new Error(
						"Qdrant configuration is required when type is qdrant"
					);
				}
				return new QdrantRagService(
					vectorStoreConfig.qdrant,
					embeddingConfig
				);

			default:
				throw new Error(
					`Unsupported vector store type: ${(vectorStoreConfig as any).type}`
				);
		}
	}
}

/**
 * 共通のRAGサービスインターフェース
 */
export interface IRagService {
	createIndex(indexName: string, dimension?: number): Promise<void>;
	deleteIndex(indexName: string): Promise<void>;
	listIndexes(): Promise<string[]>;
	addDocument(
		content: string,
		metadata?: any,
		chunkingOptions?: any,
		indexName?: string
	): Promise<any>;
	updateDocument(
		documentId: string,
		content?: string,
		metadata?: any,
		chunkingOptions?: any,
		indexName?: string
	): Promise<any>;
	deleteDocument(documentId: string, indexName?: string): Promise<void>;
	searchDocuments(
		query: string,
		indexName?: string,
		options?: any
	): Promise<any[]>;
}
