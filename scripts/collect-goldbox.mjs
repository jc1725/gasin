import "dotenv/config";
import { collectGoldBoxProducts } from "../server/scheduledJobs.ts";

const products = await collectGoldBoxProducts();
console.log(`Initial GoldBox collection completed: ${products.length} products`);
