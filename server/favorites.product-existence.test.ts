import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ getProductById: vi.fn(), toggleFavorite: vi.fn() }));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getProductById: mocks.getProductById, toggleFavorite: mocks.toggleFavorite };
});

import { appRouter } from "./routers";

describe("favorites.toggle", () => {
  it("rejects an authenticated Google user when the product does not exist", async () => {
    mocks.getProductById.mockResolvedValue(undefined);
    const ctx = {
      user: {
        id: 7,
        openId: "google-user",
        name: "Google User",
        email: "google@example.com",
        loginMethod: "google",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} },
      res: {},
    } as TrpcContext;

    await expect(appRouter.createCaller(ctx).favorites.toggle({ productId: 999999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.toggleFavorite).not.toHaveBeenCalled();
  });
});
