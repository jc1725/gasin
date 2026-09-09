import "dotenv/config";
import { getGoldBoxProducts } from "../server/coupang.ts";

const products = await getGoldBoxProducts();
const sample = products[0] ?? {};
console.log(JSON.stringify({ productCount: products.length, responseFields: Object.keys(sample).sort() }, null, 2));
