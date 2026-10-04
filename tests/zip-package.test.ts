import { describe, expect, it } from "vitest";
import { createZip, crc32 } from "@/lib/zip";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("createZip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
  const entries = [
    {
      name: "領収書/山田太郎_2026-09_1200円.pdf",
      data: new Uint8Array([37, 80, 68, 70, 0, 255]),
    },
    {
      name: "請求書/佐藤デザイン_2026-09_110000円.pdf",
      data: new Uint8Array([1, 2, 3]),
    },
    { name: "一覧.csv", data: new TextEncoder().encode("a,b\r\n1,2") },
    { name: "empty.txt", data: new Uint8Array() },
  ];
  it("is a valid archive that the system's unzip can test and extract, with Japanese names intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const file = join(dir, "t.zip");
    writeFileSync(file, createZip(entries));
    const has = (cmd: string) => {
      try {
        execFileSync("which", [cmd]);
        return true;
      } catch {
        return false;
      }
    };
    if (!has("unzip") && !has("python3")) return;
    if (has("python3")) {
      const out = execFileSync("python3", [
        "-c",
        "import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps({n:list(z.read(n)) for n in z.namelist()},ensure_ascii=False))",
        file,
      ]).toString();
      const got = JSON.parse(out) as Record<string, number[]>;
      expect(Object.keys(got)).toEqual(entries.map((e) => e.name));
      for (const e of entries) expect(got[e.name]).toEqual([...e.data]);
    }
    expect(existsSync(file) && readFileSync(file).length).toBeGreaterThan(100);
  });
  it("rejects absurdly many files", () => {
    expect(() =>
      createZip(
        Array.from({ length: 65536 }, (_, i) => ({
          name: `f${i}`,
          data: new Uint8Array(),
        })),
      ),
    ).toThrow();
  });
});
