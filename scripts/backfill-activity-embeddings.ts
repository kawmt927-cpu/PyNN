/**
 * 回填日志/往来语义索引。
 * 用法: node --import tsx scripts/backfill-activity-embeddings.ts
 * 或: npx tsx scripts/backfill-activity-embeddings.ts
 */
import { backfillActivityEmbeddings } from "../src/lib/sales-log/activity-embedding-index";
import { getEmbeddingProviderConfig } from "../src/lib/search/embeddings";

async function main() {
  const provider = await getEmbeddingProviderConfig();
  if (!provider) {
    console.error("未配置 Embedding API Key（LLM_API_KEY / EMBEDDING_API_KEY）");
    process.exit(1);
  }
  console.log(`model=${provider.model} base=${provider.apiBase}`);

  let cursor: string | null = null;
  let round = 0;
  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  for (;;) {
    round += 1;
    const result = await backfillActivityEmbeddings({ cursor });
    indexed += result.indexed;
    skipped += result.skipped;
    failed += result.failed;
    console.log(
      `#${round} scanned=${result.scanned} +indexed=${result.indexed} skipped=${result.skipped} failed=${result.failed} cursor=${result.nextCursor}`
    );
    if (result.errors.length) {
      for (const e of result.errors.slice(0, 5)) console.error(" ", e);
    }
    if (result.done) break;
    cursor = result.nextCursor;
  }
  console.log(`done indexed=${indexed} skipped=${skipped} failed=${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
