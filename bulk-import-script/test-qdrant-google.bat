@echo off
set RAG_DATABASE_TYPE=qdrant
set RAG_QDRANT_URL=http://localhost:6333
set QDRANT_API_KEY=
set EMBEDDING_PROVIDER=google
set EMBEDDING_MODEL=text-embedding-004
set EMBEDDING_API_KEY=your-google-api-key-here
set EMBEDDING_DIMENSIONS=768
set AUTO_CREATE_INDEXES=documents,technical,knowledge

echo ===== Qdrant + Google text-embedding-004 テスト =====
echo データベース: Qdrant (http://localhost:6333)
echo 埋め込みモデル: Google text-embedding-004 (768次元)
echo 環境変数設定完了
echo サーバーを起動中...
node dist/index.js 