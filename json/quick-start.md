# 🚀 RAG MCP サーバー クイックスタート

## 📋 3分で始める RAG システム

### ステップ 1: 構成を選択 ⚡

**初心者にオススメ** - セットアップ不要で即座に開始:
```
claude-desktop-libsql-openai-small.json
```

**本格運用なら** - 高性能で安定:
```
claude-desktop-qdrant-openai-large.json
```

### ステップ 2: 設定ファイルをコピー 📋

選択したJSONファイルを Claude Desktop の設定ファイルにコピー:

```bash
# Windows
copy json\claude-desktop-libsql-openai-small.json %APPDATA%\Claude\claude_desktop_config.json

# 設定完了後、Claude Desktop を再起動
```

### ステップ 3: API KEY を設定 🔑

設定ファイル内の `EMBEDDING_API_KEY` を実際のキーに変更:

```json
"EMBEDDING_API_KEY": "sk-your-actual-openai-key-here"
```

**API KEY の取得先:**
- OpenAI: https://platform.openai.com/api-keys
- Google: https://makersuite.google.com/app/apikey

### ステップ 4: サーバーをビルド 🔨

```bash
cd your-ragdb-mcp-path/rag-mcp
npm run build
```

### ステップ 5: テスト実行 🧪

Claude Desktop を再起動後、以下のコマンドを実行:

```
get_rag_info
```

成功すると以下のような情報が表示されます:
```
🔧 RAG システム情報
📊 ベクターデータベース: libsql
🧠 埋め込みプロバイダー: openai (text-embedding-3-small)
📐 埋め込み次元数: 1536
```

### ステップ 6: 最初のドキュメントを追加 📝

```
add_document content="こんにちは！これは最初のテストドキュメントです。RAGシステムが正常に動作しています。" metadata={"title": "テストドキュメント", "category": "初期設定"}
```

### ステップ 7: 検索してみる 🔍

```
rag_search query="テストドキュメント"
```

## 🎯 次に何をする？

### 📚 より多くのドキュメントを追加
```
add_document content="TypeScriptは静的型付けのJavaScriptです。" metadata={"title": "TypeScript", "category": "プログラミング"}
add_document content="Reactはユーザーインターフェースを構築するライブラリです。" metadata={"title": "React", "category": "プログラミング"}
```

### 🔍 高度な検索
```
# フィルタ付き検索
advanced_rag_search query="プログラミング" filter={"category": "プログラミング"}

# ドキュメント一覧
list_documents limit=5
```

### ⚙️ 設定をカスタマイズ
設定ファイルの環境変数を調整:
```json
"RAG_CHUNK_SIZE": "1024",        // より大きなチャンク
"RAG_TOP_K": "10",              // より多くの検索結果
"DUPLICATE_CHECK_ENABLED": "true" // 重複チェック有効
```

## 🚨 問題が発生した場合

### よくある問題と解決方法

**1. "Connection failed" エラー**
- LibSQL: ディスク容量を確認
- Qdrant: `docker run -p 6333:6333 qdrant/qdrant` でサーバー起動
- PgVector: PostgreSQLサービスが起動しているか確認

**2. "Invalid API key" エラー**  
- OpenAI/Google APIキーが正しく設定されているか確認
- APIキーに利用可能な残高があるか確認

**3. "Model not found" エラー**
- モデル名が正しいか確認 (`text-embedding-3-small` 等)
- プロバイダーとモデルの組み合わせが正しいか確認

### 📞 サポート情報

詳細な設定やトラブルシューティングは `complete-usage-guide.md` を参照してください。

---

**🎉 おめでとうございます！** RAGシステムが動作しています。この設定で文書の追加・検索・管理が可能になりました。 