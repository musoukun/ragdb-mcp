# RAG MCP サーバー 完全設定ガイド

## 🔧 サポートされている構成

### データベース
- **LibSQL**: SQLiteベースの軽量データベース（ローカルファイル）
- **PgVector**: PostgreSQL + pgvector拡張（スケーラブル）
- **Qdrant**: 高性能ベクターデータベース（クラウド対応）

### 埋め込みモデル
- **OpenAI text-embedding-3-small**: 1536次元、高速・コスト効率
- **OpenAI text-embedding-3-large**: 3072次元、最高精度
- **Google text-embedding-004**: 768次元、多言語対応

## 📁 設定ファイル一覧

### LibSQL構成
| ファイル | データベース | モデル | 次元数 | 特徴 |
|---------|-------------|--------|---------|------|
| `claude-desktop-libsql-openai-small.json` | LibSQL | text-embedding-3-small | 1536 | 軽量・高速 |
| `claude-desktop-libsql-openai-large.json` | LibSQL | text-embedding-3-large | 3072 | 最高精度 |
| `claude-desktop-libsql-google.json` | LibSQL | text-embedding-004 | 768 | 多言語対応 |

### PgVector構成
| ファイル | データベース | モデル | 次元数 | 特徴 |
|---------|-------------|--------|---------|------|
| `claude-desktop-pgvector-openai-small.json` | PgVector | text-embedding-3-small | 1536 | スケーラブル・高速 |
| `claude-desktop-pgvector-openai-large.json` | PgVector | text-embedding-3-large | 3072 | スケーラブル・最高精度 |
| `claude-desktop-pgvector-google.json` | PgVector | text-embedding-004 | 768 | スケーラブル・多言語 |

### Qdrant構成
| ファイル | データベース | モデル | 次元数 | 特徴 |
|---------|-------------|--------|---------|------|
| `claude-desktop-qdrant-openai-small.json` | Qdrant | text-embedding-3-small | 1536 | 高性能・高速 |
| `claude-desktop-qdrant-openai-large.json` | Qdrant | text-embedding-3-large | 3072 | 高性能・最高精度 |
| `claude-desktop-qdrant-google.json` | Qdrant | text-embedding-004 | 768 | 高性能・多言語 |

## 🚀 セットアップ手順

### 1. データベースサーバーの準備

#### LibSQL (SQLite)
```bash
# 追加設定不要 - ローカルファイルとして動作
# ファイルパス: ./rag.db
```

#### PgVector (PostgreSQL)
```bash
# PostgreSQLをインストール
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# pgvector拡張をインストール
sudo apt-get install postgresql-15-pgvector

# データベース作成
sudo -u postgres createdb ragdb
sudo -u postgres psql ragdb -c "CREATE EXTENSION vector;"
```

#### Qdrant
```bash
# Dockerでの起動（推奨）
docker run -p 6333:6333 -p 6334:6334 \
    -v "$(pwd)/qdrant_storage:/qdrant/storage:z" \
    qdrant/qdrant

# クラウドサービス
# https://cloud.qdrant.io/ でアカウント作成
```

### 2. RAG MCPサーバーのビルド

```bash
cd D:/develop/rag-mcp
npm install
npm run build
```

### 3. Claude Desktop設定

お好みの構成ファイルを選択し、`%APPDATA%\Claude\claude_desktop_config.json` にコピー：

```bash
# 例: Qdrant + OpenAI小モデル構成
copy json\claude-desktop-qdrant-openai-small.json %APPDATA%\Claude\claude_desktop_config.json
```

### 4. API KEYの設定

各設定ファイルの `EMBEDDING_API_KEY` を実際のAPIキーに変更：

#### OpenAI API Key
```json
"EMBEDDING_API_KEY": "your-openai-api-key-here"
```

#### Google API Key
```json
"EMBEDDING_API_KEY": "your-google-api-key-here"
```

## 💡 使用ケース別推奨構成

### 🏃‍♂️ 高速開発・プロトタイピング
**推奨**: LibSQL + OpenAI Small
- ファイル: `claude-desktop-libsql-openai-small.json`
- 理由: セットアップ不要、高速、コスト効率

### 🏢 本番環境・大規模データ
**推奨**: PgVector + OpenAI Large
- ファイル: `claude-desktop-pgvector-openai-large.json`
- 理由: スケーラビリティ、最高精度、本番環境対応

### ⚡ 最高性能・リアルタイム検索
**推奨**: Qdrant + OpenAI Large
- ファイル: `claude-desktop-qdrant-openai-large.json`
- 理由: 最高のベクター検索性能、最高精度

### 🌍 多言語対応・国際化
**推奨**: Qdrant + Google
- ファイル: `claude-desktop-qdrant-google.json`
- 理由: 多言語対応、高性能

### 💰 コスト最適化
**推奨**: LibSQL + Google
- ファイル: `claude-desktop-libsql-google.json`
- 理由: 無料データベース、コスト効率的な埋め込み

## 🧪 基本的な使用方法

### システム情報確認
```
get_rag_info
```

### ドキュメント追加
```
add_document content="サンプルドキュメント内容" metadata={"title": "サンプル", "category": "テスト"}
```

### セマンティック検索
```
rag_search query="検索したい内容"
```

### フィルタリング検索
```
advanced_rag_search query="検索内容" filter={"category": "テスト"}
```

### ドキュメント一覧
```
list_documents limit=10
```

## 📊 パフォーマンス比較

| データベース | 検索速度 | スケーラビリティ | セットアップ | メンテナンス |
|-------------|---------|----------------|-------------|-------------|
| LibSQL | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| PgVector | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Qdrant | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

| モデル | 精度 | 速度 | コスト | 多言語 |
|--------|------|------|--------|--------|
| OpenAI Small | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| OpenAI Large | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Google | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## 🔧 高度な設定オプション

### チャンキング設定
```json
"RAG_CHUNK_SIZE": "512",      // チャンクサイズ（トークン数）
"RAG_CHUNK_OVERLAP": "50",    // チャンク間のオーバーラップ
```

### 検索設定
```json
"RAG_TOP_K": "5",             // 検索結果の最大件数
```

### 重複チェック
```json
"DUPLICATE_CHECK_ENABLED": "true",  // 重複チェック有効化
"DUPLICATE_THRESHOLD": "0.9"        // 重複判定の閾値
```

### ログ設定
```json
"LOG_LEVEL": "info"           // debug, info, warn, error
```

## 🚨 トラブルシューティング

### よくある問題と解決方法

#### 1. 接続エラー
- **LibSQL**: ファイルパスとディスク容量を確認
- **PgVector**: PostgreSQLサービスとネットワーク接続を確認
- **Qdrant**: Dockerコンテナの起動状態を確認

#### 2. API KEYエラー
- OpenAI: APIキーの有効性と利用制限を確認
- Google: Google Cloud Consoleでの設定を確認

#### 3. パフォーマンス問題
- チャンクサイズを調整（512-2048推奨）
- 検索結果件数を調整（3-10推奨）
- より高性能なデータベースに変更

### ログ確認方法
```bash
# Claude Desktopのログ確認
# Windows: %APPDATA%\Claude\logs\
```

## 📚 参考リンク

- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [Google AI Embeddings](https://ai.google.dev/docs/embeddings_guide)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [LibSQL Documentation](https://turso.tech/libsql)

すべての構成ファイルがjsonフォルダに準備されているので、お好みの組み合わせを選択してすぐに使用開始できます！ 