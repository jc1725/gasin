import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ markProductViewed: vi.fn() }));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, markProductViewed: mocks.markProductViewed };
});

import { appRouter } from "./routers";

describe("catalog.markViewed", () => {
  it("forwards a public product-detail view to the persistence helper", async () => {
    mocks.markProductViewed.mockResolvedValue(undefined);
    const ctx = { user: null, req: { headers: {} }, res: {} } as TrpcContext;

    await expect(appRouter.createCaller(ctx).catalog.markViewed({ productId: 74 })).resolves.toBeUndefined();
    expect(mocks.markProductViewed).toHaveBeenCalledWith(74);
  });
});
