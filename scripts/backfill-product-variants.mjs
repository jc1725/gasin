import "dotenv/config";
import { backfillProductVariantMetadata } from "../server/db.ts";

const updated = await backfillProductVariantMetadata();
console.log(`Product variant metadata backfill completed: ${updated} products`);
