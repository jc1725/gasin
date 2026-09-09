import { refreshDeferredSearchPrices } from "../server/scheduledJobs";

const outcome = await refreshDeferredSearchPrices();
console.log(JSON.stringify(outcome, null, 2));
