import "dotenv/config";
import { searchCatalogSafely } from "../server/catalogSearch.ts";

const result = await searchCatalogSafely("비플레인 녹두 약산성 클렌징폼", 10);
console.log(`Safe related option lookup completed: ${result.products.length} products via ${result.source}`);
