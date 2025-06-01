#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigManager } from "./config/index.js";
import {
	RagServiceFactory,
	type IRagService,
} from "./services/rag-service-factory.js";
import { registerRagTools } from "./tools/rag-tools.js";

/**
 * RAG MCP Server
 * LibSQL Vector Store / PgVector を使用したRAGドキュメント管理サーバー
 */
class RagMcpServer {
	private server: McpServer;
	private ragService: IRagService;
	private config: ConfigManager;

	constructor() {
		try {
			console.error("RAG MCP Server 初期化を開始...");

			// 設定を読み込み
			console.error("ConfigManager インスタンスを取得中...");
			this.config = ConfigManager.getInstance();
			console.error("ConfigManager インスタンス取得完了");

			// RAGサービスを初期化（ファクトリーパターン）
			console.error("RAGサービスを初期化中...");
			this.ragService = RagServiceFactory.createService(
				this.config.getVectorStoreConfig(),
				this.config.getEmbeddingConfig()
			);
			console.error("RAGサービス初期化完了");

			// MCPサーバーを初期化
			console.error("MCPサーバーを初期化中...");
			this.server = new McpServer({
				name: this.config.getServerName(),
				version: this.config.getServerVersion(),
			});
			console.error("MCPサーバー初期化完了");

			// ツールを登録（型エラー回避のため、as anyを使用）
			console.error("ツールを登録中...");
			registerRagTools(this.server, this.ragService as any);
			console.error("ツール登録完了");

			// リソースを登録
			console.error("リソースを登録中...");
			this.registerResources();
			console.error("リソース登録完了");

			console.error("RAG MCP Server 初期化完了");
		} catch (error) {
			console.error("RAG MCP Server 初期化エラー:", error);
			throw error;
		}
	}

	/**
	 * リソースを登録
	 */
	private registerResources(): void {
		// RAG設定情報のリソース
		this.server.resource("rag-config", "rag://config", async () => {
			const config = this.config.getConfig();
			const vectorStoreConfig = this.config.getVectorStoreConfig();

			const configInfo: any = {
				configSource: this.config.getConfigSource(),
				vectorStore: {
					type: vectorStoreConfig.type,
				},
				embedding: {
					provider: config.embeddingConfig.provider,
					model: config.embeddingConfig.model,
					hasApiKey: !!config.embeddingConfig.apiKey,
					dimensions: config.embeddingConfig.dimensions,
				},
				rag: config.ragConfig,
			};

			// ベクターストア固有の設定を追加
			if (
				vectorStoreConfig.type === "libsql" &&
				vectorStoreConfig.libsql
			) {
				configInfo.vectorStore.libsql = {
					connectionUrl: vectorStoreConfig.libsql.connectionUrl,
					hasAuthToken: !!vectorStoreConfig.libsql.authToken,
					hasSyncUrl: !!vectorStoreConfig.libsql.syncUrl,
					syncInterval: vectorStoreConfig.libsql.syncInterval,
				};
			} else if (
				vectorStoreConfig.type === "pgvector" &&
				vectorStoreConfig.pgvector
			) {
				configInfo.vectorStore.pgvector = {
					connectionString: this.maskConnectionString(
						vectorStoreConfig.pgvector.connectionString
					),
					maxConnections: vectorStoreConfig.pgvector.maxConnections,
					ssl: vectorStoreConfig.pgvector.ssl,
				};
			} else if (
				vectorStoreConfig.type === "qdrant" &&
				vectorStoreConfig.qdrant
			) {
				configInfo.vectorStore.qdrant = {
					url: vectorStoreConfig.qdrant.url,
					hasApiKey: !!vectorStoreConfig.qdrant.apiKey,
					https: vectorStoreConfig.qdrant.https,
				};
			}

			// 環境変数ベース設定情報を追加
			configInfo.server = {
				name: this.config.getServerName(),
				version: this.config.getServerVersion(),
			};
			configInfo.autoCreateIndexes = this.config.getAutoCreateIndexes();
			configInfo.logging = {
				level: this.config.getLogLevel(),
				file: this.config.getLogFile(),
			};

			return {
				contents: [
					{
						uri: "rag://config",
						text: JSON.stringify(configInfo, null, 2),
						mimeType: "application/json",
					},
				],
			};
		});

		// 利用可能なインデックス一覧のリソース
		this.server.resource("indexes", "rag://indexes", async () => {
			try {
				const indexes = await this.ragService.listIndexes();
				return {
					contents: [
						{
							uri: "rag://indexes",
							text: JSON.stringify(
								{
									indexes,
									count: indexes.length,
									timestamp: new Date().toISOString(),
								},
								null,
								2
							),
							mimeType: "application/json",
						},
					],
				};
			} catch (error) {
				return {
					contents: [
						{
							uri: "rag://indexes",
							text: JSON.stringify(
								{
									error:
										error instanceof Error
											? error.message
											: "Unknown error",
									timestamp: new Date().toISOString(),
								},
								null,
								2
							),
							mimeType: "application/json",
						},
					],
				};
			}
		});

		// ヘルプドキュメントのリソース
		this.server.resource("help", "rag://help", async () => {
			const helpContent = `# RAG MCP Server ヘルプ

## 概要
このサーバーは、LibSQL Vector Store または PgVector を使用したRAG（検索拡張生成）データベース管理機能を提供します。

## サポートされているベクターストア
- **LibSQL**: SQLite互換の軽量ベクターデータベース（Turso対応）
- **PgVector**: PostgreSQL拡張によるベクターデータベース
- **Qdrant**: 高性能ベクターデータベース

## 設定方法

### MCP設定（Claude Desktop）
Claude Desktopの設定ファイルに以下の形式で設定してください：

\`\`\`json
{
  "mcpServers": {
    "rag-server": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "RAG_DATABASE_TYPE": "libsql",
        "RAG_CONNECTION_URL": "file:./rag.db",
        "EMBEDDING_PROVIDER": "openai",
        "EMBEDDING_MODEL": "text-embedding-3-small",
        "EMBEDDING_API_KEY": "sk-your-api-key",
        "AUTO_CREATE_INDEXES": "documents,technical"
      }
    }
  }
}
\`\`\`

### 必須環境変数
- \`RAG_DATABASE_TYPE\`: データベースタイプ（libsql または pgvector）
- \`RAG_CONNECTION_URL\`: 接続URL
  - LibSQL: \`file:./rag.db\` または \`libsql://remote-url\`
  - PgVector: \`postgresql://user:pass@host:port/db\`
- \`EMBEDDING_PROVIDER\`: openai, anthropic, google
- \`EMBEDDING_MODEL\`: モデル名
- \`EMBEDDING_API_KEY\`: APIキー

### オプション環境変数
- \`EMBEDDING_DIMENSIONS\`: 埋め込み次元数
- \`RAG_CHUNK_SIZE\`: チャンクサイズ（デフォルト: 512）
- \`RAG_CHUNK_OVERLAP\`: チャンクオーバーラップ（デフォルト: 50）
- \`RAG_TOP_K\`: 検索結果数（デフォルト: 5）
- \`AUTO_CREATE_INDEXES\`: 自動作成インデックス（カンマ区切り）
- \`LOG_LEVEL\`: ログレベル（debug, info, warn, error）

## 利用可能なツール

### インデックス管理
- \`create_index\`: 新しいベクターインデックスを作成
- \`delete_index\`: 既存のインデックスを削除
- \`list_indexes\`: 利用可能なインデックス一覧を表示

### ドキュメント管理
- \`add_document\`: Markdownドキュメントを追加
- \`update_document\`: 既存ドキュメントを更新
- \`delete_document\`: ドキュメントを削除

### RAG検索機能
- \`rag_search\`: 質問応答形式のRAG検索（推奨）
- \`advanced_rag_search\`: フィルター機能付き高度検索
- \`semantic_similarity_search\`: セマンティック類似検索
- \`search_documents\`: 基本的なドキュメント検索

### 情報取得
- \`get_rag_info\`: RAGシステムの現在の状態を表示
`;

			return {
				contents: [
					{
						uri: "rag://help",
						text: helpContent,
						mimeType: "text/markdown",
					},
				],
			};
		});
	}

	/**
	 * 接続文字列をマスクしてセキュリティを保つ
	 */
	private maskConnectionString(connectionString: string): string {
		// postgresql://username:password@host:port/database のパスワード部分をマスク
		return connectionString.replace(/(:)([^:@]+)(@)/, "$1***$3");
	}

	/**
	 * 自動作成インデックスを処理
	 */
	private async createAutoIndexes(): Promise<void> {
		const autoCreateIndexes = this.config.getAutoCreateIndexes();

		if (Object.keys(autoCreateIndexes).length === 0) {
			return;
		}

		console.error("自動作成インデックスを処理しています...");

		for (const [indexName, indexConfig] of Object.entries(
			autoCreateIndexes
		)) {
			try {
				const indexes = await this.ragService.listIndexes();
				if (!indexes.includes(indexName)) {
					console.error(
						`インデックス "${indexName}" を作成しています...`
					);
					await this.ragService.createIndex(
						indexName,
						indexConfig.dimension
					);
					console.error(
						`インデックス "${indexName}" を作成しました。`
					);
				} else {
					console.error(
						`インデックス "${indexName}" は既に存在します。`
					);
				}
			} catch (error) {
				console.error(
					`インデックス "${indexName}" の作成に失敗しました:`,
					error instanceof Error ? error.message : "Unknown error"
				);
			}
		}
	}

	/**
	 * サーバーを開始
	 */
	async start(): Promise<void> {
		try {
			console.error("RAG MCP Server を開始しています...");

			// 設定を検証と表示
			const config = this.config.getConfig();
			const vectorStoreConfig = this.config.getVectorStoreConfig();

			console.error(`設定ソース: ${this.config.getConfigSource()}`);
			console.error(`ベクターストア: ${vectorStoreConfig.type}`);
			console.error(
				`埋め込みプロバイダー: ${config.embeddingConfig.provider}`
			);
			console.error(`埋め込みモデル: ${config.embeddingConfig.model}`);

			if (
				vectorStoreConfig.type === "libsql" &&
				vectorStoreConfig.libsql
			) {
				console.error(
					`LibSQL接続URL: ${vectorStoreConfig.libsql.connectionUrl}`
				);
			} else if (
				vectorStoreConfig.type === "pgvector" &&
				vectorStoreConfig.pgvector
			) {
				console.error(
					`PostgreSQL接続: ${this.maskConnectionString(vectorStoreConfig.pgvector.connectionString)}`
				);
			}

			// 自動作成インデックスの処理
			await this.createAutoIndexes();

			// デフォルトインデックスの作成を試行（JSON設定にない場合のみ）
			const autoIndexes = this.config.getAutoCreateIndexes();
			if (!autoIndexes.documents) {
				try {
					const indexes = await this.ragService.listIndexes();
					if (!indexes.includes("documents")) {
						console.error(
							'デフォルトインデックス "documents" を作成しています...'
						);
						await this.ragService.createIndex("documents");
						console.error("デフォルトインデックスを作成しました。");
					}
				} catch (error) {
					console.error(
						"デフォルトインデックス作成をスキップしました:",
						error instanceof Error ? error.message : "Unknown error"
					);
				}
			}

			// Stdio transportで接続
			const transport = new StdioServerTransport();
			await this.server.connect(transport);

			console.error("RAG MCP Server が正常に開始されました。");
		} catch (error) {
			console.error("サーバー開始に失敗しました:", error);
			process.exit(1);
		}
	}

	/**
	 * サーバーを停止
	 */
	async stop(): Promise<void> {
		try {
			await this.server.close();
			console.error("RAG MCP Server を停止しました。");
		} catch (error) {
			console.error("サーバー停止中にエラーが発生しました:", error);
		}
	}
}

// メイン実行
async function main(): Promise<void> {
	const server = new RagMcpServer();

	// シグナルハンドラーを設定
	process.on("SIGINT", async () => {
		console.error("SIGINT received, shutting down...");
		await server.stop();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		console.error("SIGTERM received, shutting down...");
		await server.stop();
		process.exit(0);
	});

	// 未処理のエラーハンドラー
	process.on("uncaughtException", (error) => {
		console.error("Uncaught Exception:", error);
		process.exit(1);
	});

	process.on("unhandledRejection", (reason, promise) => {
		console.error("Unhandled Rejection at:", promise, "reason:", reason);
		process.exit(1);
	});

	// サーバーを開始
	await server.start();
}

// スクリプトが直接実行された場合のみmainを実行
console.error("スクリプト実行チェック:", {
	"import.meta.url": import.meta.url,
	"process.argv[1]": process.argv[1],
	"__filename equivalent": new URL(import.meta.url).pathname,
});

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});

export { RagMcpServer };
