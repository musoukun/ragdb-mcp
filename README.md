# RAG MCP Server（RAGDB)

**MCP対応チャットで、RAGDBを管理/検索できるMCPです。**

### 🤖 MCP対応チャットでとMCPについて

-   このシステムをインストールすると、MCP対応チャットで文書をRAGDBに保存・ベクトル検索ができるようになります。
-   コマンドを入力するだけで、MCP対応チャットで文書を管理できます。
-   Markdown形式のドキュメントをベクトル化して保存します。
## ✨ できること

### 📚 文書の保存と検索

-   **文書を保存**: Markdownファイルをemmbeddingでベクトル化してRAGDBに保存
-   **質問で検索**: 「この技術の使い方は？」のような質問で検索
-   **Markdownファイル一括登録**: スクリプトMarkdownファイルをRAGDBに一括登録できます。

### 💾 3つのデータベース選択肢

-   **LibSQL** :ローカルファイルで動作し、DBサーバーを必要としません。
-   **Qdrant** :クラウド対応で、大量データ対応です。
-   **PostgreSQL**: 大量データ対応（テスト中ですが動作確認済）

## 🚀 始め方

### 前提条件

-   libsqlを利用する場合は、libsqlのデータベースファイルが自動作成されます。
-   PgvectorやQdrantを利用する場合はDBサーバーが必要です。（Docker環境をお勧めします。）
-   埋め込みプロバイダーのAPIキー（OpenAI または Google）

### VS CodeおよびClaude Desktopでの使用

手動インストールの場合、VS CodeのUser Settings (JSON)ファイルに以下のJSONブロックを追加してください。`Ctrl + Shift + P`を押して`Preferences: Open User Settings (JSON)`と入力することで設定ファイルを開けます。

そのほかのDBの例は、jsonフォルダのサンプルをご覧ください。

```json
{
    "mcpServers": {
        "rag-server": {
            "command": "node",
            "args": ["your-ragdb-mcp-path/rag-mcp/dist/index.js"],
            "env": {
                "RAG_DATABASE_TYPE": "libsql",
                "RAG_CONNECTION_URL": "file:your-ragdb-mcp-path/rag-mcp/libsql/rag.db",
                "EMBEDDING_PROVIDER": "google",
                "EMBEDDING_MODEL": "text-embedding-004",
                "EMBEDDING_API_KEY": "your-google-api-key",
                "EMBEDDING_DIMENSIONS": "768",
                "RAG_CHUNK_SIZE": "512",
                "RAG_CHUNK_OVERLAP": "50",
                "RAG_TOP_K": "5",
                "RAG_STRATEGY": "markdown",
                "AUTO_CREATE_INDEXES": "documents,technical", // defalut: documents 必要に応じて追加してください。
                "LOG_LEVEL": "info"
            }
        }
    }
}
```

### 環境変数の設定

| 環境変数             | 説明                                 | 例                                                        |
| -------------------- | ------------------------------------ | --------------------------------------------------------- |
| `RAG_DATABASE_TYPE`  | データベースタイプ                   | `libsql`, `pgvector`, `qdrant`                            |
| `RAG_CONNECTION_URL` | データベース接続URL                  | `./database.db` (LibSQL), `postgresql://...` (PostgreSQL) |
| `RAG_QDRANT_URL`     | Qdrant接続URL（Qdrant使用時）        | `http://localhost:6333`                                   |
| `EMBEDDING_PROVIDER` | 埋め込みプロバイダー                 | `openai`, `google`                                        |
| `EMBEDDING_MODEL`    | 埋め込みモデル                       | `text-embedding-3-small`, `text-embedding-gecko@003`      |
| `EMBEDDING_API_KEY`  | APIキー                              | OpenAIまたはGoogleのAPIキー                               |
| `RAG_CHUNK_SIZE`     | チャンクサイズ（オプション）         | `512`                                                     |
| `RAG_CHUNK_OVERLAP`  | チャンクオーバーラップ（オプション） | `50`                                                      |
| `RAG_TOP_K`          | 検索結果数（オプション）             | `5`                                                       |

### 利用可能なツール

| ツール名                     | 説明                       | パラメータ                                                                                 |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| `create_index`               | インデックスを作成         | `indexName`: インデックス名, `dimension?`: ベクター次元数                                  |
| `delete_index`               | インデックスを削除         | `indexName`: インデックス名                                                                |
| `list_indexes`               | インデックス一覧を表示     | なし                                                                                       |
| `add_document`               | Markdownドキュメントを追加 | `content`: 文書内容, `metadata?`: メタデータ, `chunkingOptions?`: チャンキング設定         |
| `update_document`            | ドキュメントを更新         | `documentId`: ドキュメントID, `content?`: 新しい内容, `metadata?`: メタデータ              |
| `delete_document`            | ドキュメントを削除         | `documentId`: ドキュメントID, `indexName?`: インデックス名                                 |
| `search_documents`           | 基本的なドキュメント検索   | `query`: 検索クエリ, `indexName?`: インデックス名, `options?`: 検索オプション              |
| `rag_search`                 | 質問応答形式のRAG検索      | `question`: 質問, `indexName?`: インデックス名, `options?`: 検索オプション                 |
| `advanced_rag_search`        | フィルター機能付き高度検索 | `query`: 検索クエリ, `filters?`: メタデータフィルター, `searchOptions?`: 検索設定          |
| `semantic_similarity_search` | セマンティック類似検索     | `referenceText`: 参照テキスト, `indexName?`: インデックス名, `options?`: 検索オプション    |
| `list_documents`             | ドキュメント一覧を表示     | `indexName?`: インデックス名, `limit?`: 取得数, `offset?`: 開始位置, `filter?`: フィルター |
| `get_rag_info`               | RAGシステム情報を表示      | なし                                                                                       |

### 基本的な使用例

1. **インデックス作成**：

    ```
    create_index indexName="my-docs"
    ```

2. **ドキュメント追加**：

    ```
    add_document content="# プロジェクト概要\n\nこのプロジェクトは..." metadata={"title": "プロジェクト概要", "category": "技術文書"}
    ```

3. **質問で検索**：

    ```
    rag_search question="このプロジェクトの目的は何ですか？"
    ```

4. **ドキュメント一覧表示**：
    ```
    list_documents limit=10
    ```

## 📄 ライセンス

自由に使用・改変・商用利用可能です。
MCPを通常使用する場合、商用利用は可能ですが

ただしRAGDBとのやり取りや処理は、mastraのライブラリを利用して実装しています。

mastraはElastic License 2.0のため、例えばMastraのPlayground部分をそのままSaasサービスとして
提供したりすることできないので注意してください。

詳しくは以下もご覧ください。
https://mastra.ai/ja/docs/faq#elastic-license-20-elv2

## 🤝 改善提案・バグ報告

不具合を見つけた方、改善アイデアをお持ちの方は、GitHubのIssuesまでお知らせください。

---

**🎉 MCP対応チャットでがあなた専用の文書検索アシスタントになります！**
