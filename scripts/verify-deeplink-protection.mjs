import "dotenv/config";
import { generatePendingDeepLinks } from "../server/deepLinks.ts";

const result = await generatePendingDeepLinks();
console.log(JSON.stringify(result, null, 2));
