import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  chapters,
  checklist,
  finder,
  menuGuide,
  overview,
  questions,
} from "../src/app/(app)/guide/content";

/** Every internal link in the guide must open a real page (so a renamed screen cannot leave a dead link). */
const pageExists = (href: string) => {
  const route = href.split("?")[0].replace(/^\/|\/$/g, "");
  return ["page.tsx", "page.ts"].some((f) =>
    existsSync(path.resolve("src/app/(app)", route, f)),
  );
};
const allHrefs = [
  ...overview.flatMap((g) => g.features.map((f) => f.href)),
  ...menuGuide.map((m) => m.href),
  ...finder.map((f) => f.href),
  ...checklist.map((c) => c.href),
  ...chapters.map((c) => c.href),
];

describe("usage guide", () => {
  it("only links to screens that exist", () => {
    for (const h of new Set(allHrefs)) expect(pageExists(h), h).toBe(true);
  });

  it("has unique chapter anchors that do not collide with the page's own sections", () => {
    const ids = chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const reserved = [
      "overview",
      "first-steps",
      "menu",
      "finder",
      "chapters",
      "roles",
      "glossary",
      "faq",
      "main-content",
    ];
    for (const id of ids) expect(reserved).not.toContain(id);
  });

  it("describes every sidebar menu entry", async () => {
    const names = menuGuide.map((m) => m.name);
    for (const n of [
      "ダッシュボード",
      "請求書",
      "支払管理",
      "経費精算",
      "会計・帳簿",
      "取引先",
      "明細テンプレート",
      "メールテンプレート",
      "自社情報・設定",
      "お知らせ",
    ])
      expect(names).toContain(n);
  });

  it("every chapter says who can use it and has steps, a note and an entry link", () => {
    for (const c of chapters) {
      expect(c.role, c.id).toBeTruthy();
      expect(c.steps.length, c.id).toBeGreaterThan(0);
      expect(c.note, c.id).toBeTruthy();
      expect(c.href, c.id).toMatch(/^\//);
    }
  });

  it("keeps the required setup steps first and labelled", () => {
    expect(checklist.slice(0, 3).map((c) => c.need)).toEqual([
      "必須",
      "必須",
      "必須",
    ]);
    expect(checklist.slice(3).every((c) => c.need !== "必須")).toBe(true);
  });

  it("has no duplicate questions or tasks", () => {
    expect(new Set(questions.map((q) => q.q)).size).toBe(questions.length);
    expect(new Set(finder.map((f) => f.want)).size).toBe(finder.length);
  });
});
