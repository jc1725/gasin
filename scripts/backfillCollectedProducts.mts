import { desc } from "drizzle-orm";
import { collectedPriceHistory } from "../drizzle/schema";
import { getDb, recordCollectedPriceItems } from "../server/db";

const database = await getDb();
if (!database) throw new Error("Database is unavailable");

const observations = await database
  .select({
    productId: collectedPriceHistory.externalProductId,
    name: collectedPriceHistory.name,
    brand: collectedPriceHistory.brand,
    price: collectedPriceHistory.price,
    url: collectedPriceHistory.url,
    pageType: collectedPriceHistory.pageType,
    source: collectedPriceHistory.source,
    collectedAt: collectedPriceHistory.collectedAt,
  })
  .from(collectedPriceHistory)
  .orderBy(desc(collectedPriceHistory.collectedAt), desc(collectedPriceHistory.id));

const latestByProductId = new Map<string, (typeof observations)[number]>();
for (const observation of observations) {
  if (!latestByProductId.has(observation.productId)) latestByProductId.set(observation.productId, observation);
}

const result = await recordCollectedPriceItems(Array.from(latestByProductId.values()));
console.log(JSON.stringify({ distinctCollectedProductIds: latestByProductId.size, ...result }, null, 2));
