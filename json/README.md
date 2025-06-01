# 📁 RAG MCP サーバー 設定ファイル集

## 📋 概要

このフォルダには、RAG MCPサーバーのすべてのデータベースと埋め込みモデルの組み合わせに対応したClaude Desktop設定ファイルが含まれています。

## 🗂️ ファイル構成

### 📄 Claude Desktop 設定ファイル (9種類)

#### LibSQL 構成
- `claude-desktop-libsql-openai-small.json` - LibSQL + OpenAI text-embedding-3-small (1536次元)
- `claude-desktop-libsql-openai-large.json` - LibSQL + OpenAI text-embedding-3-large (3072次元) 
- `claude-desktop-libsql-google.json` - LibSQL + Google text-embedding-004 (768次元)

#### PgVector 構成 ⚠️ **動作確認中**
- `claude-desktop-pgvector-openai-small.json` - PgVector + OpenAI text-embedding-3-small (1536次元)
- `claude-desktop-pgvector-openai-large.json` - PgVector + OpenAI text-embedding-3-large (3072次元)
- `claude-desktop-pgvector-google.json` - PgVector + Google text-embedding-004 (768次元)

#### Qdrant 構成
- `claude-desktop-qdrant-openai-small.json` - Qdrant + OpenAI text-embedding-3-small (1536次元)
- `claude-desktop-qdrant-openai-large.json` - Qdrant + OpenAI text-embedding-3-large (3072次元)
- `claude-desktop-qdrant-google.json` - Qdrant + Google text-embedding-004 (768次元)

### 🧪 テストスクリプト (3種類)
- `test-libsql-openai-small.bat` - LibSQL + OpenAI小モデルのテスト
- `test-pgvector-openai-large.bat` - PgVector + OpenAI大モデルのテスト
- `test-qdrant-google.bat` - Qdrant + Googleモデルのテスト

### 📚 ドキュメント (3種類)
- `quick-start.md` - 3分で始められるクイックスタートガイド
- `complete-usage-guide.md` - 全機能を網羅した完全ガイド
- `README.md` - このファイル（フォルダ概要）

## 🚀 使用方法

### 1. 設定ファイルの選択

お好みの組み合わせを選択してください：

**🏃‍♂️ 初心者・プロトタイピング向け:**
```
claude-desktop-libsql-openai-small.json
```

**🏢 本番環境・大規模データ向け:**
```
claude-desktop-pgvector-openai-large.json
```

**⚡ 最高性能・リアルタイム向け:**
```
claude-desktop-qdrant-openai-large.json
```

### 2. Claude Desktop設定

選択したファイルを以下の場所にコピー：
```
%APPDATA%\Claude\claude_desktop_config.json
```

### 3. APIキーの設定

ファイル内の `EMBEDDING_API_KEY` を実際のAPIキーに変更してください。

### 4. Claude Desktop再起動

設定変更後は必ずClaude Desktopを再起動してください。

## 📊 データベース比較

| データベース | セットアップ | パフォーマンス | スケーラビリティ | 推奨用途 | ステータス |
|-------------|-------------|---------------|----------------|----------|------------|
| **LibSQL** | ⭐⭐⭐⭐⭐ 不要 | ⭐⭐⭐ 標準 | ⭐⭐ 小規模 | 開発・プロトタイプ | ✅ **動作確認済み** |
| **PgVector** | ⭐⭐⭐ 中程度 | ⭐⭐⭐⭐ 高速 | ⭐⭐⭐⭐⭐ 大規模 | 本番環境 | ⚠️ **動作確認中** |
| **Qdrant** | ⭐⭐⭐⭐ 簡単 | ⭐⭐⭐⭐⭐ 最高 | ⭐⭐⭐⭐⭐ 大規模 | 高性能・本番 | ✅ **動作確認済み** |

## 🧠 埋め込みモデル比較

| モデル | 次元数 | 速度 | 精度 | コスト | 推奨用途 |
|--------|--------|------|------|--------|----------|
| **OpenAI Small** | 1536 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | バランス重視 |
| **OpenAI Large** | 3072 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 精度重視 |
| **Google** | 768 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 多言語・コスト重視 |

## ⚙️ 推奨構成

### 💡 用途別推奨

**🔬 研究・実験**
```
LibSQL + OpenAI Small
```

**🏗️ 開発・テスト**
```
Qdrant + OpenAI Small
```

**🚀 本番環境**
```
PgVector + OpenAI Large
```

**🌍 多言語対応**
```
Qdrant + Google
```

**💰 コスト最適化**
```
LibSQL + Google
```

## 🔧 カスタマイズ

各設定ファイルの環境変数を調整することで、動作をカスタマイズできます：

```json
"RAG_CHUNK_SIZE": "512",          // チャンクサイズ
"RAG_CHUNK_OVERLAP": "50",        // オーバーラップ
"RAG_TOP_K": "5",                 // 検索結果件数
"DUPLICATE_CHECK_ENABLED": "true", // 重複チェック
"LOG_LEVEL": "info"               // ログレベル
```

## 📞 サポート

- **クイックスタート**: `quick-start.md`を参照
- **詳細ガイド**: `complete-usage-guide.md`を参照
- **テスト実行**: 対応する`.bat`ファイルを実行

---

**🎯 目標**: すべての用途とスキルレベルに対応した、使いやすいRAGシステムの提供 