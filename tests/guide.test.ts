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
import { audiences } from "../src/app/(app)/guide/guides";

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
  ...audiences.flatMap((a) => a.chapters.map((c) => c.href)),
];
const audienceChapters = audiences.flatMap((a) => a.chapters);

describe("usage guide", () => {
  it("only links to screens that exist", () => {
    for (const h of new Set(allHrefs)) expect(pageExists(h), h).toBe(true);
  });

  it("has unique chapter anchors that do not collide with the page's own sections", () => {
    const ids = chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const reserved = [
      "steps",
      "audiences",
      "other-chapters",
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
      "売上管理表",
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

describe("audience guides", () => {
  it("covers the four audiences, each with chapters, start steps and questions", () => {
    expect(audiences.map((a) => a.id)).toEqual([
      "admin",
      "staff",
      "applicant",
      "contractor",
    ]);
    for (const a of audiences) {
      expect(a.chapters.length, a.id).toBeGreaterThan(2);
      expect(a.start.length, a.id).toBeGreaterThan(1);
      expect(a.faq.length, a.id).toBeGreaterThan(1);
    }
  });

  it("has unique chapter ids, and every chapter has steps", () => {
    const ids = audienceChapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(chapters.map((c) => c.id)).not.toContain(id);
    for (const c of audienceChapters) {
      expect(c.steps.length, c.id).toBeGreaterThan(1);
      expect(c.href, c.id).toMatch(/^\//);
    }
  });

  it("every step screenshot exists and has alt text", () => {
    let shots = 0;
    for (const c of audienceChapters)
      for (const st of c.steps)
        if (st.shot) {
          shots++;
          expect(
            existsSync(path.resolve("public/guide", `${st.shot.id}.webp`)),
            st.shot.id,
          ).toBe(true);
          expect(st.shot.alt.length, st.shot.id).toBeGreaterThan(5);
        }
    expect(shots).toBeGreaterThan(30);
  });
});

describe("usage guide page", () => {
  it("renders each audience with expandable, closed chapters and working in-page links", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("../src/app/(app)/guide/page");
    for (const a of audiences) {
      const el = await mod.default({
        searchParams: Promise.resolve({ for: a.id }),
      });
      const html = renderToStaticMarkup(createElement(() => el));
      const targets = [...html.matchAll(/href="#([^"]+)"/g)]
        .map((m) => m[1])
        .filter((id) => id !== "main-content");
      for (const id of new Set(targets))
        expect(html.includes(`id="${id}"`), `${a.id}:${id}`).toBe(true);
      for (const c of a.chapters) {
        const tag = html.match(
          new RegExp(`<details[^>]*id="${c.id}"[^>]*>`),
        )?.[0];
        expect(tag, c.id).toBeTruthy();
        expect(tag).toContain("data-guide");
        expect(tag).not.toMatch(/\sopen(=|\s|>)/);
      }
      expect(html).toContain("/guide/");
    }
  });
});
