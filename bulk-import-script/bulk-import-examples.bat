@echo off
echo ===== Markdown 一括登録スクリプト 実行例 =====
echo.

echo 使用方法:
echo   node bulk-import-markdown.js [markdownフォルダ] [設定名]
echo.

echo 実行例:
echo   1. LibSQL + OpenAI Small (初心者向け)
echo      node bulk-import-markdown.js ./docs libsql-openai-small
echo.

echo   2. Qdrant + Google (多言語対応)
echo      node bulk-import-markdown.js ./content qdrant-google
echo.

echo   3. PgVector + OpenAI Large (本番環境)
echo      node bulk-import-markdown.js ./documents pgvector-openai-large
echo.

echo 環境変数設定が必要です:
echo   set EMBEDDING_API_KEY=your-api-key-here
echo.

echo 実際に実行する場合は、以下のコマンドのコメントアウトを外してください:
echo.

REM ===== 実行例1: LibSQL + OpenAI Small =====
REM set EMBEDDING_API_KEY=sk-your-openai-api-key-here
REM node bulk-import-markdown.js ./docs libsql-openai-small

REM ===== 実行例2: Qdrant + Google =====
REM set EMBEDDING_API_KEY=your-google-api-key-here
REM node bulk-import-markdown.js ./content qdrant-google

REM ===== 実行例3: PgVector + OpenAI Large =====
REM set RAG_CONNECTION_STRING=postgresql://username:password@localhost:5432/ragdb
REM set EMBEDDING_API_KEY=sk-your-openai-api-key-here
REM node bulk-import-markdown.js ./documents pgvector-openai-large

echo.
echo 実行が完了しました。
pause 