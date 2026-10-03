import { expect, it, vi, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderInvoicePdf } from "@/lib/pdf/render-invoice";
import { loadPdfStamp } from "@/lib/pdf/stamp";
import { extractGoogleDriveFileId } from "@/lib/invoice/resolveStampImageUrl";
import { invoice, settings } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
it("renders real Japanese invoice and multipage PDFs", async () => {
  const pdf = await renderInvoicePdf(invoice, settings);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const folder = path.resolve("../work/pdf");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "invoice-sample.pdf"), pdf);
  const many = {
    ...invoice,
    items: Array.from({ length: 50 }, (_, i) => ({
      ...invoice.items[0],
      id: `row-${i}`,
      productName: `${i + 1}：制作明細・長い日本語の品目名を含むサンプル`,
      note: "備考：複数ページにわたる帳票の折り返しと改ページを確認します。",
    })),
  };
  const multi = await renderInvoicePdf(many, settings);
  expect(
    (multi.toString("latin1").match(/\/Type \/Page\b/g) || []).length,
  ).toBeGreaterThan(1);
  await writeFile(path.join(folder, "invoice-multipage.pdf"), multi);
});
it.each([
  "http://127.0.0.1/private",
  "https://169.254.169.254/latest/meta-data",
  "https://evil.example/stamp.png",
  "data:image/svg+xml;base64,PHN2Zz4=",
  "https://lh3.googleusercontent.com.evil.example/d/abc=s400",
])("blocks unsafe stamp fetch: %s", async (url) => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(loadPdfStamp(url)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not interpret a Drive-looking path on another host", () => {
  expect(
    extractGoogleDriveFileId("https://evil.example/file/d/abc/view"),
  ).toBeNull();
  expect(
    extractGoogleDriveFileId("https://drive.google.com/file/d/abc_123/view"),
  ).toBe("abc_123");
});
it("blocks redirects and unbounded remote images", async () => {
  const f = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array(600000), {
        headers: { "content-type": "image/png" },
      }),
    );
  vi.stubGlobal("fetch", f);
  await expect(
    loadPdfStamp("https://drive.google.com/file/d/abc/view"),
  ).rejects.toThrow();
  expect(f.mock.calls[0][1].redirect).toBe("error");
});
