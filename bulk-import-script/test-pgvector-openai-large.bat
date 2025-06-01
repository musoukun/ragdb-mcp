@echo off
set RAG_DATABASE_TYPE=pgvector
set RAG_CONNECTION_STRING=postgresql://username:password@localhost:5432/ragdb
set EMBEDDING_PROVIDER=openai
set EMBEDDING_MODEL=text-embedding-3-large
set EMBEDDING_API_KEY=sk-your-openai-api-key-here
set EMBEDDING_DIMENSIONS=3072
set AUTO_CREATE_INDEXES=documents,technical,knowledge

echo ===== PgVector + OpenAI text-embedding-3-large テスト =====
echo データベース: PostgreSQL with pgvector (localhost:5432/ragdb)
echo 埋め込みモデル: OpenAI text-embedding-3-large (3072次元)
echo 環境変数設定完了
echo サーバーを起動中...
node dist/index.js 