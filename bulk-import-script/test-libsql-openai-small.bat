@echo off
set RAG_DATABASE_TYPE=libsql
set RAG_CONNECTION_URL=file:./rag.db
set EMBEDDING_PROVIDER=openai
set EMBEDDING_MODEL=text-embedding-3-small
set EMBEDDING_API_KEY=sk-your-openai-api-key-here
set EMBEDDING_DIMENSIONS=1536
set AUTO_CREATE_INDEXES=documents,technical,knowledge

echo ===== LibSQL + OpenAI text-embedding-3-small テスト =====
echo データベース: LibSQL (file:./rag.db)
echo 埋め込みモデル: OpenAI text-embedding-3-small (1536次元)
echo 環境変数設定完了
echo サーバーを起動中...
node dist/index.js 