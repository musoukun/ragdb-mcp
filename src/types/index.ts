/**
 * RAG MCP Server 型定義
 */

// 設定関連の型
export interface RagConfig {
	libsqlConfig: LibSQLConfig;
	embeddingConfig: EmbeddingConfig;
	vectorStore: VectorStoreConfig;
	ragConfig: {
		defaultChunkSize: number;
		defaultChunkOverlap: number;
		defaultTopK: number;
	};
}

// 新しい複数データベース対応の設定型
export interface RagDatabasesConfig {
	ragDatabases: Record<string, DatabaseConfig>;
	server: ServerConfig;
}

export interface DatabaseConfig {
	type: "libsql" | "pgvector" | "qdrant";
	options: LibSQLOptions | PgVectorOptions | QdrantOptions;
	embedding: EmbeddingConfig;
	config: DatabaseRagConfig;
	autoIndexes?: string[];
	description?: string;
}

export interface ServerConfig {
	defaultDatabase: string;
	logging?: LoggingConfig;
}

export interface LoggingConfig {
	level: "debug" | "info" | "warn" | "error";
	file?: string;
}

export interface DatabaseRagConfig {
	chunkSize: number;
	chunkOverlap: number;
	topK: number;
	strategy?: ChunkingStrategy;
}

export interface LibSQLOptions {
	connectionUrl: string;
	authToken?: string | null;
	syncUrl?: string | null;
	syncInterval?: number;
}

export interface PgVectorOptions {
	connectionString: string;
	ssl?: boolean;
	maxConnections?: number;
}

export interface QdrantOptions {
	url: string;
	apiKey?: string;
	https?: boolean;
}

export interface LibSQLConfig {
	connectionUrl: string;
	authToken?: string;
	syncUrl?: string;
	syncInterval?: number;
}

// 既存の互換性のためのVectorStoreConfig
export interface VectorStoreConfig {
	type: "libsql" | "pgvector" | "qdrant";
	libsql?: LibSQLConfig;
	pgvector?: PgVectorConfig;
	qdrant?: QdrantConfig;
}

export interface PgVectorConfig {
	connectionString: string;
	maxConnections?: number;
	ssl?: boolean;
}

export interface QdrantConfig {
	url: string;
	apiKey?: string;
	https?: boolean;
}

export interface EmbeddingConfig {
	provider: "openai" | "anthropic" | "google";
	model: string;
	apiKey: string;
	dimensions?: number;
}

// ドキュメント関連の型
export interface Document {
	id: string;
	content: string;
	metadata: DocumentMetadata;
	createdAt: Date;
	updatedAt: Date;
}

export interface DocumentMetadata {
	title?: string;
	source?: string;
	author?: string;
	category?: string;
	tags?: string[];
	[key: string]: any;
}

// チャンク関連の型
export interface Chunk {
	id: string;
	documentId: string;
	content: string;
	metadata: ChunkMetadata;
	embedding?: number[];
}

export interface ChunkMetadata extends DocumentMetadata {
	chunkIndex: number;
	startPosition: number;
	endPosition: number;
}

// 検索関連の型
export interface SearchOptions {
	topK?: number;
	filter?: Record<string, any>;
	includeMetadata?: boolean;
	minScore?: number;
}

export interface SearchResult {
	id: string;
	content: string;
	metadata: ChunkMetadata;
	score: number;
}

// チャンキング戦略の型
export type ChunkingStrategy =
	| "recursive"
	| "character"
	| "token"
	| "markdown"
	| "html"
	| "json"
	| "latex";

export interface ChunkingOptions {
	strategy: ChunkingStrategy;
	size: number;
	overlap: number;
	separator?: string;
	extractMetadata?: boolean;
}

// MCP Tool の入力スキーマ型
export interface AddDocumentInput {
	content: string;
	metadata?: DocumentMetadata;
	chunkingOptions?: Partial<ChunkingOptions>;
	indexName?: string;
}

export interface UpdateDocumentInput {
	documentId: string;
	content?: string;
	metadata?: Partial<DocumentMetadata>;
	chunkingOptions?: Partial<ChunkingOptions>;
	indexName?: string;
}

export interface DeleteDocumentInput {
	documentId: string;
	indexName?: string;
}

export interface SearchDocumentsInput {
	query: string;
	indexName?: string;
	options?: SearchOptions;
}

export interface ListDocumentsInput {
	indexName?: string;
	limit?: number;
	offset?: number;
	filter?: Record<string, any>;
}

export interface CreateIndexInput {
	indexName: string;
	dimension?: number;
}

export interface DeleteIndexInput {
	indexName: string;
}

// エラー型
export class RagError extends Error {
	constructor(
		message: string,
		public code: string,
		public details?: Record<string, any>
	) {
		super(message);
		this.name = "RagError";
	}
}

// 🆕 重複検知関連の型定義
export interface DuplicateCheckConfig {
	enabled: boolean;
	threshold: number; // 0.0-1.0の類似度閾値
	strategy: "semantic" | "metadata" | "hybrid";
	topK?: number; // 類似度チェック対象の上位件数
}

export interface SimilarDocument {
	documentId: string;
	content: string;
	metadata: DocumentMetadata;
	score: number; // 類似度スコア
	chunkId?: string;
}

export interface DuplicateCheckResult {
	isDuplicate: boolean;
	similarDocuments: SimilarDocument[];
	decision?: AIDecision;
	threshold: number;
}

export interface AIDecision {
	action: "skip" | "update" | "add";
	reason: string;
	targetDocumentId?: string; // updateの場合のみ
	confidence: number; // 0.0-1.0の判断信頼度
}

// AI判断用のプロンプトコンテキスト
export interface AIDecisionContext {
	newDocument: {
		content: string;
		metadata: DocumentMetadata;
	};
	similarDocuments: SimilarDocument[];
	threshold: number;
}

// add_documentツールの拡張入力（重複検知対応）
export interface AddDocumentWithDuplicateCheckInput extends AddDocumentInput {
	duplicateCheck?: {
		enabled?: boolean;
		threshold?: number;
		strategy?: "semantic" | "metadata" | "hybrid";
		allowAIDecision?: boolean; // AI判断を許可するか
	};
}

// add_documentツールの拡張レスポンス（重複検知結果を含む）
export interface AddDocumentResult {
	document: Document;
	duplicateCheck?: DuplicateCheckResult;
	action: "added" | "updated" | "skipped";
	message: string;
}
