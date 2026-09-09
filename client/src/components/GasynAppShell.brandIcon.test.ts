import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("./GasynAppShell.tsx", import.meta.url), "utf8");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("Gasyn brand icon", () => {
  it("uses the approved green Gasyn text icon in the shared header and as the browser favicon", () => {
    expect(shell).toContain("gasyn-text-shortcut-icon-preview_1bf92205.png");
    expect(shell).toContain('alt="가신"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain("gasyn-text-shortcut-icon-preview_1bf92205.png");
  });
});
