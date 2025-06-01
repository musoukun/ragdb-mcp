#!/usr/bin/env node

/**
 * Markdown一括登録スクリプト
 *
 * 使用方法:
 * node bulk-import-markdown.js [markdownフォルダパス] [設定ファイル]
 *
 * 例:
 * node bulk-import-markdown.js ./docs libsql-openai-small
 * node bulk-import-markdown.js ./content qdrant-google
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
	StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

// 設定マッピング
const CONFIG_MAPPING = {
	"libsql-openai-small": {
		RAG_DATABASE_TYPE: "libsql",
		RAG_CONNECTION_URL: "file:./rag.db",
		EMBEDDING_PROVIDER: "openai",
		EMBEDDING_MODEL: "text-embedding-3-small",
		EMBEDDING_DIMENSIONS: "1536",
	},
	"libsql-openai-large": {
		RAG_DATABASE_TYPE: "libsql",
		RAG_CONNECTION_URL: "file:./rag.db",
		EMBEDDING_PROVIDER: "openai",
		EMBEDDING_MODEL: "text-embedding-3-large",
		EMBEDDING_DIMENSIONS: "3072",
	},
	"libsql-google": {
		RAG_DATABASE_TYPE: "libsql",
		RAG_CONNECTION_URL: "file:./rag.db",
		EMBEDDING_PROVIDER: "google",
		EMBEDDING_MODEL: "text-embedding-004",
		EMBEDDING_DIMENSIONS: "768",
	},
	"pgvector-openai-small": {
		RAG_DATABASE_TYPE: "pgvector",
		RAG_CONNECTION_STRING:
			"postgresql://username:password@localhost:5432/ragdb",
		EMBEDDING_PROVIDER: "openai",
		EMBEDDING_MODEL: "text-embedding-3-small",
		EMBEDDING_DIMENSIONS: "1536",
	},
	"pgvector-openai-large": {
		RAG_DATABASE_TYPE: "pgvector",
		RAG_CONNECTION_STRING:
			"postgresql://username:password@localhost:5432/ragdb",
		EMBEDDING_PROVIDER: "openai",
		EMBEDDING_MODEL: "text-embedding-3-large",
		EMBEDDING_DIMENSIONS: "3072",
	},
	"pgvector-google": {
		RAG_DATABASE_TYPE: "pgvector",
		RAG_CONNECTION_STRING:
			"postgresql://username:password@localhost:5432/ragdb",
		EMBEDDING_PROVIDER: "google",
		EMBEDDING_MODEL: "text-embedding-004",
		EMBEDDING_DIMENSIONS: "768",
	},
	"qdrant-openai-small": {
		RAG_DATABASE_TYPE: "qdrant",
		RAG_QDRANT_URL: "http://localhost:6333",
		QDRANT_API_KEY: "",
		EMBEDDING_PROVIDER: "openai",
		EMBEDDING_MODEL: "text-embedding-3-small",
		EMBEDDING_DIMENSIONS: "1536",
	},
	"qdrant-openai-large": {
		RAG_DATABASE_TYPE: "qdrant",
		RAG_QDRANT_URL: "http://localhost:6333",
		QDRANT_API_KEY: "",
		EMBEDDING_PROVIDER: "openai",
		EMBEDDING_MODEL: "text-embedding-3-large",
		EMBEDDING_DIMENSIONS: "3072",
	},
	"qdrant-google": {
		RAG_DATABASE_TYPE: "qdrant",
		RAG_QDRANT_URL: "http://localhost:6333",
		QDRANT_API_KEY: "",
		EMBEDDING_PROVIDER: "google",
		EMBEDDING_MODEL: "text-embedding-004",
		EMBEDDING_DIMENSIONS: "768",
	},
};

async function findMarkdownFiles(dirPath) {
	const files = [];

	async function walkDir(currentPath) {
		const entries = await fs.promises.readdir(currentPath, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name);

			if (entry.isDirectory()) {
				await walkDir(fullPath);
			} else if (
				entry.isFile() &&
				path.extname(entry.name).toLowerCase() === ".md"
			) {
				files.push(fullPath);
			}
		}
	}

	await walkDir(dirPath);
	return files;
}

function extractMetadataFromMarkdown(content, filePath) {
	const metadata = {
		title: path.basename(filePath, ".md"),
		source: filePath,
		category: "markdown",
		importDate: new Date().toISOString(),
	};

	// フロントマターの解析
	const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (frontMatterMatch) {
		const frontMatter = frontMatterMatch[1];
		const lines = frontMatter.split("\n");

		for (const line of lines) {
			const [key, ...valueParts] = line.split(":");
			if (key && valueParts.length > 0) {
				const value = valueParts
					.join(":")
					.trim()
					.replace(/^["']|["']$/g, "");
				metadata[key.trim()] = value;
			}
		}

		// フロントマターを本文から削除
		content = content.replace(/^---\n[\s\S]*?\n---\n/, "");
	}

	// ファイルパスからカテゴリを推測
	const pathParts = filePath.split(path.sep);
	if (pathParts.length > 1) {
		metadata.folder = pathParts[pathParts.length - 2];
	}

	return { content: content.trim(), metadata };
}

async function setupEnvironment(configName) {
	const config = CONFIG_MAPPING[configName];
	if (!config) {
		throw new Error(
			`未知の設定: ${configName}. 利用可能: ${Object.keys(CONFIG_MAPPING).join(", ")}`
		);
	}

	// 環境変数を設定
	Object.assign(process.env, {
		...config,
		AUTO_CREATE_INDEXES: "documents",
		RAG_CHUNK_SIZE: "512",
		RAG_CHUNK_OVERLAP: "50",
		RAG_TOP_K: "5",
		LOG_LEVEL: "info",
		DUPLICATE_CHECK_ENABLED: "true",
		DUPLICATE_THRESHOLD: "0.9",
	});

	// APIキーが必要な場合は環境変数から取得
	if (
		config.EMBEDDING_PROVIDER === "openai" &&
		!process.env.EMBEDDING_API_KEY
	) {
		process.env.EMBEDDING_API_KEY = process.env.OPENAI_API_KEY || "";
	} else if (
		config.EMBEDDING_PROVIDER === "google" &&
		!process.env.EMBEDDING_API_KEY
	) {
		process.env.EMBEDDING_API_KEY = process.env.GOOGLE_API_KEY || "";
	}

	return config;
}

async function addDocumentToRAG(content, metadata) {
	try {
		// MCPサーバーを直接実行する代わりに、RAGサービスを直接使用
		const {
			RagServiceFactory,
		} = require("../dist/services/rag-service-factory.js");
		const { ConfigManager } = require("../dist/config/index.js");

		const configManager = new ConfigManager();
		const ragService = await RagServiceFactory.create(configManager);

		const result = await ragService.addDocument(
			content,
			metadata,
			{
				strategy: "recursive",
				size: parseInt(process.env.RAG_CHUNK_SIZE || "512"),
				overlap: parseInt(process.env.RAG_CHUNK_OVERLAP || "50"),
			},
			"documents"
		);

		return result;
	} catch (error) {
		console.error(`ドキュメント追加エラー: ${error.message}`);
		throw error;
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log(`
📁 Markdown一括登録スクリプト

使用方法:
  node bulk-import-markdown.js <markdownフォルダ> <設定名>

利用可能な設定名:
  libsql-openai-small    - LibSQL + OpenAI Small (1536次元)
  libsql-openai-large    - LibSQL + OpenAI Large (3072次元)
  libsql-google          - LibSQL + Google (768次元)
  pgvector-openai-small  - PgVector + OpenAI Small (1536次元)
  pgvector-openai-large  - PgVector + OpenAI Large (3072次元)
  pgvector-google        - PgVector + Google (768次元)
  qdrant-openai-small    - Qdrant + OpenAI Small (1536次元)
  qdrant-openai-large    - Qdrant + OpenAI Large (3072次元)
  qdrant-google          - Qdrant + Google (768次元)

実行例:
  node bulk-import-markdown.js ./docs libsql-openai-small
  node bulk-import-markdown.js ./content qdrant-google

環境変数設定:
  EMBEDDING_API_KEY - APIキー (OpenAI: sk-xxx, Google: AIza-xxx)
  RAG_CONNECTION_STRING - PostgreSQL接続文字列 (pgvectorの場合)
  RAG_QDRANT_URL - QdrantサーバーURL (Qdrantの場合)
        `);
		process.exit(1);
	}

	const [markdownDir, configName] = args;

	console.log(`🚀 Markdown一括登録開始`);
	console.log(`📁 対象フォルダ: ${markdownDir}`);
	console.log(`⚙️ 設定: ${configName}`);

	try {
		// ディレクトリの存在確認
		if (!fs.existsSync(markdownDir)) {
			throw new Error(`フォルダが存在しません: ${markdownDir}`);
		}

		// 環境設定
		const config = await setupEnvironment(configName);
		console.log(
			`🔧 データベース: ${config.RAG_DATABASE_TYPE || config.EMBEDDING_PROVIDER}`
		);
		console.log(
			`🧠 埋め込みモデル: ${config.EMBEDDING_PROVIDER} ${config.EMBEDDING_MODEL}`
		);

		// APIキーの確認
		if (!process.env.EMBEDDING_API_KEY) {
			console.warn(`⚠️ 警告: EMBEDDING_API_KEYが設定されていません`);
		}

		// Markdownファイルを検索
		console.log(`🔍 Markdownファイルを検索中...`);
		const markdownFiles = await findMarkdownFiles(markdownDir);
		console.log(`📄 見つかったファイル数: ${markdownFiles.length}`);

		if (markdownFiles.length === 0) {
			console.log(`❌ Markdownファイルが見つかりませんでした`);
			process.exit(1);
		}

		// RAGサービスの初期化確認
		console.log(`🔌 RAGサービスに接続中...`);

		let successCount = 0;
		let errorCount = 0;

		// ファイルを1つずつ処理
		for (let i = 0; i < markdownFiles.length; i++) {
			const filePath = markdownFiles[i];
			const relativePath = path.relative(markdownDir, filePath);

			try {
				console.log(
					`\n📄 [${i + 1}/${markdownFiles.length}] ${relativePath}`
				);

				// ファイル読み込み
				const content = await fs.promises.readFile(filePath, "utf-8");

				// メタデータ抽出
				const { content: cleanContent, metadata } =
					extractMetadataFromMarkdown(content, relativePath);

				if (cleanContent.trim().length === 0) {
					console.log(`  ⚠️ スキップ: 空のファイル`);
					continue;
				}

				// ドキュメント追加
				console.log(`  📝 登録中... (${cleanContent.length}文字)`);
				const result = await addDocumentToRAG(cleanContent, metadata);

				console.log(`  ✅ 成功: ${result.document?.id || "ID不明"}`);
				if (result.duplicateCheck?.isDuplicate) {
					console.log(`  🔄 重複チェック: 類似文書検出`);
				}

				successCount++;
			} catch (error) {
				console.error(`  ❌ エラー: ${error.message}`);
				errorCount++;
			}

			// 進捗表示
			const progress = Math.round(((i + 1) / markdownFiles.length) * 100);
			console.log(
				`  📊 進捗: ${progress}% (成功: ${successCount}, エラー: ${errorCount})`
			);
		}

		console.log(`\n🎉 一括登録完了!`);
		console.log(`✅ 成功: ${successCount}件`);
		console.log(`❌ エラー: ${errorCount}件`);
		console.log(`📊 総ファイル数: ${markdownFiles.length}件`);

		if (errorCount > 0) {
			console.log(
				`\n⚠️ エラーが発生したファイルがあります。ログを確認してください。`
			);
			process.exit(1);
		}
	} catch (error) {
		console.error(`💥 致命的エラー: ${error.message}`);
		process.exit(1);
	}
}

// スクリプト実行
if (require.main === module) {
	main().catch(console.error);
}

module.exports = { main, CONFIG_MAPPING };
