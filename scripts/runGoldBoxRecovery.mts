import { collectGoldBoxProducts } from "../server/scheduledJobs";

const result = await collectGoldBoxProducts();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
