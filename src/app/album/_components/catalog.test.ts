import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  catalogCategories,
  catalogEntries,
  excludedComponentSources,
  getCatalogEntry,
  searchCatalog,
  sortCatalogEntries,
} from "@/app/album/_components/catalog";

function componentSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return componentSourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [relative(join(process.cwd(), "src/components"), path).replaceAll("\\", "/")];
  });
}

describe("Album catalog", () => {
  it("keeps required fields, slugs and category ordering stable", () => {
    expect(new Set(catalogEntries.map((entry) => entry.slug)).size).toBe(catalogEntries.length);
    expect(catalogCategories.map((category) => category.order)).toEqual(
      [...catalogCategories].map((category) => category.order).sort((a, b) => a - b)
    );
    expect(new Set(catalogCategories.map((category) => category.id)).size).toBe(
      catalogCategories.length
    );
    expect(new Set(catalogCategories.map((category) => category.order)).size).toBe(
      catalogCategories.length
    );

    for (const category of catalogCategories) {
      const entries = catalogEntries.filter((entry) => entry.categoryId === category.id);
      const originalOrder = entries.map((entry) => entry.slug);
      const sortedEntries = sortCatalogEntries(entries);
      expect(entries.length).toBeGreaterThan(0);
      expect(new Set(entries.map((entry) => entry.order)).size).toBe(entries.length);
      expect(sortedEntries.map((entry) => entry.order)).toEqual(
        entries.map((entry) => entry.order).sort((a, b) => a - b)
      );
      expect(entries.map((entry) => entry.slug)).toEqual(originalOrder);
      expect(sortCatalogEntries(sortedEntries)).toEqual(sortedEntries);
    }

    for (const entry of catalogEntries) {
      expect(entry.slug).not.toBe("");
      expect(entry.nameZh).not.toBe("");
      expect(entry.codeName).not.toBe("");
      expect(entry.description).not.toBe("");
      expect(entry.useCases.length).toBeGreaterThan(0);
      expect(entry.importPath).not.toBe("");
      expect(entry.sourceFiles.length).toBeGreaterThan(0);
      expect(catalogCategories.some((category) => category.id === entry.categoryId)).toBe(true);
      expect(entry.keywords.length).toBeGreaterThan(0);
      expect(entry.capabilities.sizes.length).toBeGreaterThan(0);
      expect(entry.capabilities.variants.length).toBeGreaterThan(0);
      expect(entry.capabilities.states.length).toBeGreaterThan(0);

      if (entry.status === "ready") {
        const scenarioIds = entry.scenarios.map((scenario) => scenario.scenarioId);
        expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
        expect(entry.scenarios.some((scenario) => scenario.dimension === "default")).toBe(true);
        expect(
          entry.scenarios
            .filter((scenario) => scenario.dimension === "size")
            .map((scenario) => scenario.label)
        ).toEqual(entry.capabilities.sizes);
        expect(
          entry.scenarios
            .filter((scenario) => scenario.dimension === "variant")
            .map((scenario) => scenario.label)
        ).toEqual(entry.capabilities.variants);
        expect(
          entry.scenarios
            .filter((scenario) => scenario.dimension === "state")
            .map((scenario) => scenario.label)
        ).toEqual(entry.capabilities.states);
        expect(entry.scenarios.every((scenario) => typeof scenario.render === "object")).toBe(true);
        expect(entry.capabilities.themeComparison.length).toBeGreaterThan(0);
        for (const scenarioId of entry.capabilities.themeComparison) {
          expect(scenarioIds).toContain(scenarioId);
        }
      } else {
        expect(entry.pendingReason).not.toBe("");
        expect(entry.integrationNeeds).not.toBe("");
        expect(entry.capabilities.themeComparison).toEqual([]);
      }
    }
  });

  it("resolves default entries and searches Chinese, English, category and import path", () => {
    expect(getCatalogEntry("button")?.nameZh).toBe("按钮与链接操作");
    expect(getCatalogEntry("button-group")?.slug).toBe("button");
    expect(getCatalogEntry("checkbox-field")?.slug).toBe("input-field");
    expect(getCatalogEntry("theme-switcher")?.slug).toBe("feedback-status");
    expect(getCatalogEntry("content-shell")?.status).toBe("ready");
    expect(getCatalogEntry("menus")?.status).toBe("ready");
    expect(getCatalogEntry("calendar")?.status).toBe("ready");
    expect(searchCatalog("按钮").map((entry) => entry.slug)).toContain("button");
    expect(searchCatalog("INPUT").map((entry) => entry.slug)).toContain("input-field");
    expect(searchCatalog("复选框").map((entry) => entry.slug)).toEqual(["input-field"]);
    expect(searchCatalog("浮层").map((entry) => entry.slug)).toContain("dialogs");
    expect(searchCatalog("ui/card").map((entry) => entry.slug)).toContain("card-data");
    expect(searchCatalog("日期范围").map((entry) => entry.slug)).toContain("calendar");
    expect(searchCatalog("")).toEqual(catalogEntries);
    expect(searchCatalog("   ")).toEqual(catalogEntries);
  });

  it("requires every component source file to have a catalog family or exclusion reason", () => {
    const covered = new Set(catalogEntries.flatMap((entry) => entry.sourceFiles));
    const excluded = new Set<string>(excludedComponentSources);
    const missing = componentSourceFiles(join(process.cwd(), "src/components")).filter(
      (file) => !covered.has(file) && !excluded.has(file)
    );

    expect(missing).toEqual([]);
  });
});
