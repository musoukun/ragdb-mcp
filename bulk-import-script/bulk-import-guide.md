# 📁 Markdown一括登録スクリプト 使用ガイド

## 📋 概要

`bulk-import-markdown.js`は、フォルダ内のMarkdownファイルをRAGデータベースに一括登録するスクリプトです。すべてのファイルは`documents`インデックスに登録されます。

## 🚀 クイックスタート

### 1. 基本的な使用方法

```bash
# 基本構文
node bulk-import-markdown.js <markdownフォルダ> <設定名>

# 例: docsフォルダのMarkdownファイルをLibSQL + OpenAI Smallで登録
set EMBEDDING_API_KEY=sk-your-openai-api-key-here
node bulk-import-markdown.js ./docs libsql-openai-small
```

### 2. 利用可能な設定

| 設定名 | データベース | 埋め込みモデル | 次元数 | 特徴 |
|--------|-------------|--------------|--------|------|
| `libsql-openai-small` | LibSQL | OpenAI text-embedding-3-small | 1536 | 初心者向け・簡単 |
| `libsql-openai-large` | LibSQL | OpenAI text-embedding-3-large | 3072 | 高精度 |
| `libsql-google` | LibSQL | Google text-embedding-004 | 768 | 多言語・コスト効率 |
| `pgvector-openai-small` | PgVector | OpenAI text-embedding-3-small | 1536 | スケーラブル ⚠️ 動作確認中 |
| `pgvector-openai-large` | PgVector | OpenAI text-embedding-3-large | 3072 | 高性能・高精度 ⚠️ 動作確認中 |
| `pgvector-google` | PgVector | Google text-embedding-004 | 768 | 多言語・スケーラブル ⚠️ 動作確認中 |
| `qdrant-openai-small` | Qdrant | OpenAI text-embedding-3-small | 1536 | 高速・高性能 |
| `qdrant-openai-large` | Qdrant | OpenAI text-embedding-3-large | 3072 | 最高性能・最高精度 |
| `qdrant-google` | Qdrant | Google text-embedding-004 | 768 | 最高性能・多言語 |

## ⚙️ 環境変数設定

### 必須環境変数

#### OpenAI使用の場合
```bash
set EMBEDDING_API_KEY=your-openai-api-key-here
```

#### Google使用の場合
```bash
set EMBEDDING_API_KEY=your-google-api-key-here
```

### データベース別追加設定

#### PgVector使用の場合
```bash
set RAG_CONNECTION_STRING=postgresql://username:password@localhost:5432/ragdb
```

#### Qdrant使用の場合 (カスタムURL)
```bash
set RAG_QDRANT_URL=http://your-qdrant-server:6333
# またはクラウド使用の場合
set QDRANT_API_KEY=your-qdrant-api-key
```

## 📝 実行例

### 例1: 開発・プロトタイピング (推奨初心者)

```bash
# LibSQL + OpenAI Small
set EMBEDDING_API_KEY=sk-your-openai-api-key-here
node bulk-import-markdown.js ./docs libsql-openai-small
```

### 例2: 多言語対応・コスト重視

```bash
# Qdrant + Google
set EMBEDDING_API_KEY=your-google-api-key-here
node bulk-import-markdown.js ./content qdrant-google
```

### 例3: 高性能・本番環境

```bash
# Qdrant + OpenAI Large
set EMBEDDING_API_KEY=sk-your-openai-api-key-here
node bulk-import-markdown.js ./documents qdrant-openai-large
```

### 例4: PostgreSQL環境

```bash
# PgVector + OpenAI Small (動作確認中)
set RAG_CONNECTION_STRING=postgresql://username:password@localhost:5432/ragdb
set EMBEDDING_API_KEY=sk-your-openai-api-key-here
node bulk-import-markdown.js ./documents pgvector-openai-small
```

## 📄 Markdownファイル処理

### サポートされる機能

#### 1. フロントマター解析
```markdown
---
title: サンプル文書
author: 開発者
category: プログラミング
tags: ["JavaScript", "Node.js"]
---

# 本文開始
ここから本文が始まります。
```

#### 2. 自動メタデータ生成
- **title**: ファイル名から自動生成
- **source**: ファイルパス
- **category**: "markdown"
- **folder**: 親フォルダ名
- **importDate**: 登録日時

#### 3. 再帰的フォルダ検索
```
docs/
├── guide/
│   ├── setup.md      ✅ 登録対象
│   └── usage.md      ✅ 登録対象
├── api/
│   └── reference.md  ✅ 登録対象
└── README.md         ✅ 登録対象
```

## 🔧 高度な設定

### チャンキング設定

スクリプト内で以下のデフォルト設定が使用されます：

```javascript
RAG_CHUNK_SIZE: '512'        // チャンクサイズ
RAG_CHUNK_OVERLAP: '50'      // オーバーラップ
DUPLICATE_CHECK_ENABLED: 'true'  // 重複チェック有効
DUPLICATE_THRESHOLD: '0.9'   // 重複判定閾値
```

### 環境変数での設定変更

```bash
# カスタムチャンキング設定
set RAG_CHUNK_SIZE=1024
set RAG_CHUNK_OVERLAP=100
set DUPLICATE_THRESHOLD=0.85

node bulk-import-markdown.js ./docs libsql-openai-small
```

## 📊 実行結果の見方

### 成功例
```
🚀 Markdown一括登録開始
📁 対象フォルダ: ./docs
⚙️ 設定: libsql-openai-small
🔧 データベース: libsql
🧠 埋め込みモデル: openai text-embedding-3-small
🔍 Markdownファイルを検索中...
📄 見つかったファイル数: 15

📄 [1/15] guide/setup.md
  📝 登録中... (2345文字)
  ✅ 成功: doc_abc123
  📊 進捗: 7% (成功: 1, エラー: 0)

...

🎉 一括登録完了!
✅ 成功: 15件
❌ エラー: 0件
📊 総ファイル数: 15件
```

### エラー例と対処法

#### 1. APIキーエラー
```
❌ エラー: Invalid API key
```
**対処法**: `EMBEDDING_API_KEY`を正しく設定

#### 2. データベース接続エラー
```
❌ エラー: Connection failed
```
**対処法**: 
- LibSQL: ディスク容量確認
- Qdrant: `docker run -p 6333:6333 qdrant/qdrant`でサーバー起動
- PgVector: PostgreSQLサービス確認

#### 3. フォルダが見つからない
```
💥 致命的エラー: フォルダが存在しません: ./docs
```
**対処法**: 正しいフォルダパスを指定

## 🛠️ トラブルシューティング

### よくある問題

#### 1. 空のファイルがスキップされる
```
⚠️ スキップ: 空のファイル
```
これは正常動作です。空のMarkdownファイルは登録されません。

#### 2. 重複文書の検出
```
🔄 重複チェック: 類似文書検出
```
これは正常動作です。類似文書が検出されましたが、設定に応じて処理されます。

#### 3. 大量ファイルでの制限
- OpenAI APIには利用制限があります
- 大量ファイル処理時は時間間隔を空けることを推奨

### デバッグ情報

ログレベルを変更してより詳細な情報を取得：

```bash
set LOG_LEVEL=debug
node bulk-import-markdown.js ./docs libsql-openai-small
```

## 📚 関連ドキュメント

- [クイックスタートガイド](quick-start.md)
- [完全設定ガイド](complete-usage-guide.md)
- [設定ファイル集 README](README.md)

## 🎯 使用例集

### ドキュメントサイト移行
```bash
# Hugo/Jekyll等からの移行
node bulk-import-markdown.js ./content libsql-openai-small
```

### 技術ノート一括登録
```bash
# Obsidian/Notion exportからの移行
node bulk-import-markdown.js ./exported-notes qdrant-google
```

### API仕様書登録
```bash
# OpenAPI/Swagger documentationの登録
node bulk-import-markdown.js ./api-docs qdrant-openai-large
```

---

**🎉 これで簡単にMarkdownファイルをRAGシステムに一括登録できます！** 