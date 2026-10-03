import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDraftMime,
  draftInputSchema,
  invoicePdfFilename,
  MAX_PDF_BYTES,
} from "@/lib/gmail/mime";
import { createGmailDraft, DraftResultUnknownError } from "@/lib/gmail/client";
import { draft } from "./fixtures";
const pdf = new TextEncoder().encode("%PDF-1.7\nsample\n%%EOF");
afterEach(() => vi.unstubAllGlobals());
describe("safe draft MIME", () => {
  it("contains UTF-8 text, correct recipients and exact PDF attachment bytes", () => {
    const raw = buildDraftMime(
      { ...draft, cc: "cc@example.com", bcc: "private@example.com" },
      pdf,
      "INV-001",
    );
    const mime = Buffer.from(raw, "base64url").toString();
    expect(mime).toContain("Content-Type: multipart/mixed");
    expect(mime).toContain("Bcc: private@example.com");
    expect(mime).toContain('filename="invoice-INV-001.pdf"');
    expect(mime).toContain(Buffer.from(pdf).toString("base64"));
    expect(mime.replace(/\r\n/g, "")).toContain(
      Buffer.from(draft.body).toString("base64"),
    );
    expect(mime).not.toContain("text/html");
    expect(raw).not.toMatch(/[+/=]/);
  });
  it.each(["from", "to", "cc", "bcc", "subject"])(
    "blocks header injection in %s",
    (key) => {
      expect(() =>
        buildDraftMime(
          {
            ...draft,
            [key]: "victim@example.com\r\nBcc: attacker@example.com",
          },
          pdf,
          "1",
        ),
      ).toThrow();
    },
  );
  it("rejects non-PDF and excessive attachments", () => {
    expect(() =>
      buildDraftMime(
        draft,
        new TextEncoder().encode("<html>error</html>"),
        "1",
      ),
    ).toThrow();
    expect(() =>
      buildDraftMime(draft, new Uint8Array(MAX_PDF_BYTES + 1), "1"),
    ).toThrow();
  });
  it("validates addresses and bounds message size", () => {
    expect(() => draftInputSchema.parse({ ...draft, to: "bad" })).toThrow();
    expect(() =>
      draftInputSchema.parse({ ...draft, body: "x".repeat(20001) }),
    ).toThrow();
    expect(() =>
      draftInputSchema.parse({
        ...draft,
        to: Array(21).fill("a@example.com").join(","),
      }),
    ).toThrow();
  });
  it("makes attachment names header/path safe", () => {
    expect(invoicePdfFilename('../../x\r\n".pdf')).not.toMatch(/[\/\r\n"]/);
  });
});
describe("Google draft-only integration", () => {
  const profile = () =>
    new Response(JSON.stringify({ email: draft.from, email_verified: true }), {
      status: 200,
    });
  it("calls only profile and drafts.create, never sends", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-123" })));
    vi.stubGlobal("fetch", fetcher);
    const result = await createGmailDraft("secret", draft, pdf, "INV-1");
    expect(result.id).toBe("draft-123");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    );
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
  });
  it.each([
    { email: "other@example.com", email_verified: true },
    { email: draft.from, email_verified: false },
  ])("rejects wrong or unverified sender %j", async (value) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(value)));
    vi.stubGlobal("fetch", fetcher);
    await expect(createGmailDraft("secret", draft, pdf, "1")).rejects.toThrow(
      "送信元が異なります",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not blindly retry an ambiguous network failure", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(profile())
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", f);
    await expect(
      createGmailDraft("secret", draft, pdf, "1"),
    ).rejects.toBeInstanceOf(DraftResultUnknownError);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 429])(
    "handles API rejection %s without exposing tokens",
    async (code) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(profile())
          .mockResolvedValueOnce(
            new Response("secret server data", { status: code }),
          ),
      );
      await expect(
        createGmailDraft("secret", draft, pdf, "1"),
      ).rejects.not.toThrow("secret");
    },
  );
});
