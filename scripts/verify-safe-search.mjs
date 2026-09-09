import "dotenv/config";
import { searchCatalogSafely } from "../server/catalogSearch.ts";

const result = await searchCatalogSafely("비플레인", 10);
console.log(JSON.stringify({ source: result.source, count: result.products.length, message: result.message }, null, 2));
