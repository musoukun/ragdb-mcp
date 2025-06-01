import { z } from "zod";
import { resolve } from "path";
import type {
	RagConfig,
	VectorStoreConfig,
	LibSQLConfig,
	PgVectorConfig,
	QdrantConfig,
	EmbeddingConfig,
	DuplicateCheckConfig,
} from "../types/index.js";

// 環境変数バリデーション用スキーマ
const LibSQLConfigSchema = z.object({
	connectionUrl: z.string().min(1, "LibSQL connection URL is required"),
	authToken: z.string().optional(),
	syncUrl: z.string().optional(),
	syncInterval: z.number().optional(),
});

const PgVectorConfigSchema = z.object({
	connectionString: z
		.string()
		.min(1, "PostgreSQL connection string is required"),
	maxConnections: z.number().optional(),
	ssl: z.boolean().optional(),
});

const QdrantConfigSchema = z.object({
	url: z.string().min(1, "Qdrant URL is required"),
	apiKey: z.string().optional(),
	https: z.boolean().optional(),
});

const VectorStoreConfigSchema = z
	.object({
		type: z.enum(["libsql", "pgvector", "qdrant"]),
		libsql: LibSQLConfigSchema.optional(),
		pgvector: PgVectorConfigSchema.optional(),
		qdrant: QdrantConfigSchema.optional(),
	})
	.refine(
		(data) =>
			(data.type === "libsql" && !!data.libsql) ||
			(data.type === "pgvector" && !!data.pgvector) ||
			(data.type === "qdrant" && !!data.qdrant),
		{
			message: "Vector store configuration must match the selected type",
		}
	);

const EmbeddingConfigSchema = z.object({
	provider: z.enum(["openai", "anthropic", "google"]),
	model: z.string().min(1, "Embedding model is required"),
	apiKey: z.string().min(1, "API key is required"),
	dimensions: z.number().optional(),
});

const RagConfigSchema = z.object({
	libsqlConfig: LibSQLConfigSchema,
	embeddingConfig: EmbeddingConfigSchema,
	vectorStore: VectorStoreConfigSchema,
	ragConfig: z.object({
		defaultChunkSize: z.number().default(512),
		defaultChunkOverlap: z.number().default(50),
		defaultTopK: z.number().default(5),
	}),
});

/**
 * 環境変数ベースの設定管理クラス
 */
export class ConfigManager {
	private static instance: ConfigManager;
	private config: RagConfig;

	private constructor() {
		// 必須環境変数をバリデーション
		this.validateRequiredEnvVars();
		this.config = this.loadFromEnvironment();
	}

	public static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	private validateRequiredEnvVars(): void {
		const databaseType = process.env.RAG_DATABASE_TYPE;
		const required = [
			"RAG_DATABASE_TYPE",
			"EMBEDDING_PROVIDER",
			"EMBEDDING_MODEL",
			"EMBEDDING_API_KEY",
		];

		// データベースタイプに応じて必要な環境変数を追加
		if (databaseType === "qdrant") {
			required.push("RAG_QDRANT_URL");
		} else {
			required.push("RAG_CONNECTION_URL");
		}

		const missing = required.filter((key) => !process.env[key]);
		if (missing.length > 0) {
			throw new Error(
				`Missing required environment variables: ${missing.join(", ")}`
			);
		}
	}

	private loadFromEnvironment(): RagConfig {
		// データベースタイプを決定
		const databaseType = process.env.RAG_DATABASE_TYPE as
			| "libsql"
			| "pgvector"
			| "qdrant";

		// 接続URLを取得（Qdrantの場合は専用の環境変数を使用）
		const connectionUrl =
			databaseType === "qdrant"
				? process.env.RAG_QDRANT_URL!
				: process.env.RAG_CONNECTION_URL!;

		// VectorStoreConfigを生成
		const vectorStoreConfig = this.parseConnectionUrl(
			databaseType,
			connectionUrl
		);

		// EmbeddingConfigを生成
		const embeddingConfig: EmbeddingConfig = {
			provider: process.env.EMBEDDING_PROVIDER as
				| "openai"
				| "anthropic"
				| "google",
			model: process.env.EMBEDDING_MODEL!,
			apiKey: process.env.EMBEDDING_API_KEY!,
			dimensions: process.env.EMBEDDING_DIMENSIONS
				? parseInt(process.env.EMBEDDING_DIMENSIONS)
				: undefined,
		};

		// RAG設定を生成
		const ragConfig = {
			defaultChunkSize: process.env.RAG_CHUNK_SIZE
				? parseInt(process.env.RAG_CHUNK_SIZE)
				: 512,
			defaultChunkOverlap: process.env.RAG_CHUNK_OVERLAP
				? parseInt(process.env.RAG_CHUNK_OVERLAP)
				: 50,
			defaultTopK: process.env.RAG_TOP_K
				? parseInt(process.env.RAG_TOP_K)
				: 5,
		};

		// LibSQL設定（互換性のため）
		const libsqlConfig: LibSQLConfig =
			vectorStoreConfig.type === "libsql" && vectorStoreConfig.libsql
				? vectorStoreConfig.libsql
				: {
						connectionUrl: ":memory:",
						authToken: undefined,
						syncUrl: undefined,
						syncInterval: undefined,
					};

		const config = {
			libsqlConfig,
			vectorStore: vectorStoreConfig,
			embeddingConfig,
			ragConfig,
		};

		// バリデーション
		try {
			return RagConfigSchema.parse(config);
		} catch (error) {
			if (error instanceof z.ZodError) {
				const issues = error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join(", ");
				throw new Error(`Configuration validation failed: ${issues}`);
			}
			throw error;
		}
	}

	private parseConnectionUrl(
		type: "pgvector" | "libsql" | "qdrant",
		url: string
	): VectorStoreConfig {
		if (type === "pgvector") {
			return {
				type: "pgvector",
				pgvector: {
					connectionString: url,
					ssl: url.includes("ssl=true"),
					maxConnections: 10, // デフォルト値
				},
			};
		} else if (type === "libsql") {
			return {
				type: "libsql",
				libsql: this.parseLibSQLConnectionUrl(url),
			};
		} else {
			return {
				type: "qdrant",
				qdrant: {
					url: url,
					apiKey: process.env.QDRANT_API_KEY,
					https: url.includes("https=true"),
				},
			};
		}
	}

	private parseLibSQLConnectionUrl(connectionUrl: string): LibSQLConfig {
		// libsql://remote-url または file:./path のパース
		if (connectionUrl.startsWith("libsql://")) {
			return {
				connectionUrl: connectionUrl,
				authToken: process.env.LIBSQL_AUTH_TOKEN,
				syncUrl: undefined,
				syncInterval: undefined,
			};
		} else if (connectionUrl.startsWith("file:")) {
			return {
				connectionUrl: connectionUrl,
				authToken: undefined,
				syncUrl: undefined,
				syncInterval: undefined,
			};
		} else {
			// 相対パスの場合はfile:プレフィックスを追加
			return {
				connectionUrl: `file:${connectionUrl}`,
				authToken: undefined,
				syncUrl: undefined,
				syncInterval: undefined,
			};
		}
	}

	// Getter methods
	public getConfig(): RagConfig {
		return this.config;
	}

	public getConfigSource(): "env" {
		return "env";
	}

	public getVectorStoreConfig(): VectorStoreConfig {
		return this.config.vectorStore;
	}

	public getLibSQLConfig(): LibSQLConfig {
		if (
			this.config.vectorStore.type !== "libsql" ||
			!this.config.vectorStore.libsql
		) {
			throw new Error("LibSQL configuration not available");
		}
		return this.config.vectorStore.libsql;
	}

	public getPgVectorConfig(): PgVectorConfig {
		if (
			this.config.vectorStore.type !== "pgvector" ||
			!this.config.vectorStore.pgvector
		) {
			throw new Error("PgVector configuration not available");
		}
		return this.config.vectorStore.pgvector;
	}

	public getEmbeddingConfig(): EmbeddingConfig {
		return this.config.embeddingConfig;
	}

	public getRagConfig() {
		return this.config.ragConfig;
	}

	/**
	 * 設定を更新（テスト用）
	 */
	public updateConfig(newConfig: Partial<RagConfig>): void {
		this.config = { ...this.config, ...newConfig };
	}

	/**
	 * 自動作成対象のインデックス一覧を取得
	 */
	public getAutoCreateIndexes(): {
		[indexName: string]: { dimension?: number; description?: string };
	} {
		const indexString = process.env.AUTO_CREATE_INDEXES;
		if (!indexString) {
			return {};
		}

		const indexNames = this.parseAutoCreateIndexes(indexString);
		const autoCreateIndexes: {
			[indexName: string]: { dimension?: number; description?: string };
		} = {};

		// デフォルト次元数を取得
		const defaultDimension = this.getDefaultDimensions();

		for (const indexName of indexNames) {
			autoCreateIndexes[indexName] = {
				dimension: defaultDimension,
				description: undefined,
			};
		}

		return autoCreateIndexes;
	}

	private parseAutoCreateIndexes(indexString: string): string[] {
		return indexString
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	private getDefaultDimensions(): number {
		const embeddingConfig = this.config.embeddingConfig;

		if (embeddingConfig.dimensions) {
			return embeddingConfig.dimensions;
		}

		const { provider, model } = embeddingConfig;

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
	 * ログレベルを取得
	 */
	public getLogLevel(): "debug" | "info" | "warn" | "error" {
		const level = process.env.LOG_LEVEL as
			| "debug"
			| "info"
			| "warn"
			| "error";
		return level || "info";
	}

	/**
	 * ログファイルパスを取得（固定化）
	 */
	public getLogFile(): string {
		return resolve(process.cwd(), "rag-server.log");
	}

	/**
	 * サーバー名を取得
	 */
	public getServerName(): string {
		return process.env.RAG_SERVER_NAME || "rag-mcp-server";
	}

	/**
	 * サーバーバージョンを取得
	 */
	public getServerVersion(): string {
		return process.env.RAG_SERVER_VERSION || "1.0.0";
	}

	/**
	 * 🆕 重複検知設定を取得
	 */
	public getDuplicateCheckConfig(): DuplicateCheckConfig {
		return {
			enabled: process.env.DUPLICATE_CHECK_ENABLED === "true",
			threshold: process.env.DUPLICATE_THRESHOLD
				? parseFloat(process.env.DUPLICATE_THRESHOLD)
				: 0.9, // デフォルト閾値
			strategy:
				(process.env.DUPLICATE_CHECK_STRATEGY as
					| "semantic"
					| "metadata"
					| "hybrid") || "semantic",
			topK: process.env.DUPLICATE_CHECK_TOP_K
				? parseInt(process.env.DUPLICATE_CHECK_TOP_K)
				: 10, // デフォルトで上位10件をチェック
		};
	}

	/**
	 * 🆕 重複検知が有効かどうかを確認
	 */
	public isDuplicateCheckEnabled(): boolean {
		return process.env.DUPLICATE_CHECK_ENABLED === "true";
	}

	/**
	 * 🆕 AI判断機能が有効かどうかを確認
	 */
	public isAIDecisionEnabled(): boolean {
		return process.env.AI_DECISION_ENABLED !== "false"; // デフォルトで有効
	}

	public getQdrantConfig(): QdrantConfig {
		const vectorStoreConfig = this.getVectorStoreConfig();
		if (vectorStoreConfig.type !== "qdrant" || !vectorStoreConfig.qdrant) {
			throw new Error("Qdrant configuration is not available");
		}
		return vectorStoreConfig.qdrant;
	}
}

// デフォルトのエクスポート
export default ConfigManager;
