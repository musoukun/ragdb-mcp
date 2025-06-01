import { embed, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type {
	DuplicateCheckConfig,
	DuplicateCheckResult,
	SimilarDocument,
	AIDecision,
	AIDecisionContext,
	DocumentMetadata,
	EmbeddingConfig,
	SearchResult,
} from "../types/index.js";

/**
 * 重複検知サービス - セマンティック類似度とAI判断機能
 */
export class DuplicateCheckService {
	private embeddingConfig: EmbeddingConfig;

	constructor(embeddingConfig: EmbeddingConfig) {
		this.embeddingConfig = embeddingConfig;
	}

	/**
	 * セマンティック類似度による重複チェック
	 */
	async checkForDuplicates(
		newContent: string,
		newMetadata: DocumentMetadata,
		existingSearchResults: SearchResult[],
		config: DuplicateCheckConfig
	): Promise<DuplicateCheckResult> {
		// 類似ドキュメントを抽出
		const similarDocuments: SimilarDocument[] = existingSearchResults
			.filter((result) => result.score >= config.threshold)
			.map((result) => ({
				documentId: result.metadata.documentId || result.id,
				content: result.content,
				metadata: result.metadata,
				score: result.score,
				chunkId: result.id,
			}));

		const isDuplicate = similarDocuments.length > 0;

		// AI判断実行（重複が検知された場合）
		let decision: AIDecision | undefined;
		if (isDuplicate) {
			decision = await this.makeAIDecision({
				newDocument: {
					content: newContent,
					metadata: newMetadata,
				},
				similarDocuments,
				threshold: config.threshold,
			});
		}

		return {
			isDuplicate,
			similarDocuments,
			decision,
			threshold: config.threshold,
		};
	}

	/**
	 * AI判断機能 - LLMによる自動判断
	 */
	private async makeAIDecision(
		context: AIDecisionContext
	): Promise<AIDecision> {
		try {
			const prompt = this.createAIDecisionPrompt(context);
			const model = this.getLanguageModel();

			const result = await generateText({
				model,
				prompt: prompt + "\n\nJSON形式で回答してください。",
			});

			// JSONレスポンスをパース
			const jsonMatch = result.text.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error("AI回答からJSONを抽出できませんでした");
			}

			const parsed = JSON.parse(jsonMatch[0]);

			return {
				action: parsed.action as "skip" | "update" | "add",
				reason: parsed.reason || "理由が提供されませんでした",
				targetDocumentId: parsed.targetDocumentId,
				confidence:
					typeof parsed.confidence === "number"
						? parsed.confidence
						: 0.7,
			};
		} catch (error) {
			console.warn("AI判断でエラーが発生しました:", error);
			// エラー時のフォールバック: 保守的に新規追加を推奨
			return {
				action: "add",
				reason: "AI判断でエラーが発生したため、安全のため新規追加を推奨します。",
				confidence: 0.5,
			};
		}
	}

	/**
	 * AI判断用プロンプトを生成
	 */
	private createAIDecisionPrompt(context: AIDecisionContext): string {
		const { newDocument, similarDocuments, threshold } = context;

		const similarDocsText = similarDocuments
			.map(
				(doc, index) =>
					`--- 類似ドキュメント ${index + 1} (類似度: ${doc.score.toFixed(3)}) ---
タイトル: ${doc.metadata.title || "未設定"}
作成者: ${doc.metadata.author || "未設定"}
カテゴリ: ${doc.metadata.category || "未設定"}
内容: ${doc.content.substring(0, 500)}${doc.content.length > 500 ? "..." : ""}
`
			)
			.join("\n\n");

		return `以下の新規ドキュメントと既存の類似ドキュメントを比較し、最適なアクションを判断してください。

# 新規ドキュメント
タイトル: ${newDocument.metadata.title || "未設定"}
作成者: ${newDocument.metadata.author || "未設定"}
カテゴリ: ${newDocument.metadata.category || "未設定"}
内容: ${newDocument.content.substring(0, 500)}${newDocument.content.length > 500 ? "..." : ""}

# 類似する既存ドキュメント（類似度閾値: ${threshold}）
${similarDocsText}

# 判断基準
1. **skip** - 内容が実質的に同じで、新規ドキュメントが既存より劣る場合
2. **update** - 新規ドキュメントが既存ドキュメントの改良版や更新版の場合
3. **add** - 類似しているが異なる観点の有用な情報、または補完的な内容の場合

# 考慮事項
- 内容の質と鮮度
- メタデータ（タイトル、作成者、カテゴリ）の違い
- 情報の完全性と正確性
- ユーザーにとっての価値

適切なアクションを選択し、その理由と判断の信頼度を回答してください。以下のJSON形式で回答:

{
  "action": "skip|update|add",
  "reason": "判断理由",
  "targetDocumentId": "更新対象のID（updateの場合のみ）",
  "confidence": 0.0-1.0の数値
}`;
	}

	/**
	 * 言語モデルを取得（AI判断用）
	 */
	private getLanguageModel() {
		const { provider, apiKey } = this.embeddingConfig;

		switch (provider) {
			case "openai":
				return openai("gpt-4o-mini"); // 高速で精度の良いモデル
			case "google":
				const googleAI = createGoogleGenerativeAI({
					apiKey: apiKey,
				});
				return googleAI("gemini-1.5-flash"); // 高速モデル
			case "anthropic":
				// Anthropicはまだサポート外、OpenAIにフォールバック
				console.warn(
					"Anthropic AI decision not supported, falling back to OpenAI"
				);
				return openai("gpt-4o-mini");
			default:
				throw new Error(
					`Unsupported provider for AI decision: ${provider}`
				);
		}
	}

	/**
	 * メタデータベースの類似度チェック（補助機能）
	 */
	checkMetadataSimilarity(
		newMetadata: DocumentMetadata,
		existingMetadata: DocumentMetadata
	): number {
		let score = 0;
		let factors = 0;

		// タイトルの類似度
		if (newMetadata.title && existingMetadata.title) {
			factors++;
			if (newMetadata.title === existingMetadata.title) {
				score += 1;
			} else if (
				newMetadata.title.toLowerCase() ===
				existingMetadata.title.toLowerCase()
			) {
				score += 0.9;
			} else if (
				newMetadata.title
					.toLowerCase()
					.includes(existingMetadata.title.toLowerCase()) ||
				existingMetadata.title
					.toLowerCase()
					.includes(newMetadata.title.toLowerCase())
			) {
				score += 0.7;
			}
		}

		// 作成者の類似度
		if (newMetadata.author && existingMetadata.author) {
			factors++;
			if (newMetadata.author === existingMetadata.author) {
				score += 1;
			}
		}

		// カテゴリの類似度
		if (newMetadata.category && existingMetadata.category) {
			factors++;
			if (newMetadata.category === existingMetadata.category) {
				score += 1;
			}
		}

		// タグの類似度
		if (newMetadata.tags && existingMetadata.tags) {
			factors++;
			const newTags = new Set(newMetadata.tags);
			const existingTags = new Set(existingMetadata.tags);
			const intersection = new Set(
				[...newTags].filter((tag) => existingTags.has(tag))
			);
			const union = new Set([...newTags, ...existingTags]);
			score += intersection.size / union.size; // Jaccard類似度
		}

		return factors > 0 ? score / factors : 0;
	}
}
