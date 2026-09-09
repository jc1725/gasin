import type { Request, Response } from "express";
import { appRouter } from "../routers";
import type { SsrPrefetch } from "../../client/src/ssr/prefetch";
import { createContext } from "./context";

export async function buildSsrPrefetch(req: Request, res: Response): Promise<SsrPrefetch> {
  const context = await createContext({ req, res } as any);
  const caller = appRouter.createCaller(context);
  return {
    siteStats: () => caller.siteStats.public(),
    homeFeatured: input => caller.catalog.homeFeatured(input),
    listProducts: input => caller.catalog.list(input),
    hotDeals: () => caller.hotDeals.list(),
    product: input => caller.catalog.product(input),
    collectedPriceHistory: input => caller.catalog.collectedPriceHistory(input),
    relatedVariants: input => caller.catalog.relatedVariants(input),
  };
}
