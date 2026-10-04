import "server-only";

/**
 * 画像・PDFを Claude（既定は Haiku 4.5）に読ませる、共通の通信部分。
 * 領収書と請求書の読み取りで共有する。失敗の区別・再試行・連続失敗時の一時停止を、ここで行う。
 * APIキー（ANTHROPIC_API_KEY）がなければ「未設定」を返し、利用者は手入力で使える。
 */
export const DEFAULT_OCR_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 800;

/**
 * 読み取りが使えなかった理由。
 * - unconfigured: キー未設定（手入力で使う）
 * - busy: 混雑・通信の失敗（少し待てば使えることがある）
 * - rejected: 認証・利用上限などで、いまは使えない（管理者が確認する）
 * - unreadable: 画像から読み取れなかった（撮り直しか手入力）
 */
export type OcrFailureReason =
  "unconfigured" | "busy" | "rejected" | "unreadable";
export type OcrFailure = {
  ok: false;
  reason: OcrFailureReason;
  error: string;
  retryable: boolean;
};

const messages: Record<OcrFailureReason, string> = {
  unconfigured: "自動読み取りは、まだ設定されていません。手入力してください。",
  busy: "ただいま自動読み取りが混み合っています。少し待ってもう一度お試しいただくか、手入力してください。",
  rejected:
    "自動読み取りは、いま使えません。手入力してください（管理者の方は、設定と利用状況を確認してください）。",
  unreadable:
    "読み取れる内容が見つかりませんでした。写真を撮り直すか、手入力してください。",
};
export const failed = (
  reason: OcrFailureReason,
  text?: string,
): OcrFailure => ({
  ok: false,
  reason,
  error: text ?? messages[reason],
  retryable: reason === "busy" || reason === "unreadable",
});

// 続けて失敗しているときは、しばらく呼び出さない（毎回待たせないため）。
const BREAKER_FAILURES = 3;
const BREAKER_WINDOW_MS = 60_000;
let recentFailures: number[] = [];
const breakerOpen = (now: number) => {
  recentFailures = recentFailures.filter((t) => now - t < BREAKER_WINDOW_MS);
  return recentFailures.length >= BREAKER_FAILURES;
};
export const resetOcrState = () => {
  recentFailures = [];
};
export const markOcrSuccess = () => {
  recentFailures = [];
};

/** 接続先。上書き（テスト・開発用）は、本番では使わない（誤設定で、読み取りの内容が別の場所へ送られないように）。 */
const endpoint = () =>
  process.env.NODE_ENV !== "production" && process.env.ANTHROPIC_MESSAGES_URL
    ? process.env.ANTHROPIC_MESSAGES_URL
    : DEFAULT_ENDPOINT;

export const ocrConfigured = () => !!process.env.ANTHROPIC_API_KEY;

export type OcrDeps = {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/** 画像・PDFと指示を送り、返ってきた文章を返す。失敗は理由つきで返す（例外にしない）。 */
export async function askVision(
  input: {
    system: string;
    instruction: string;
    maxTokens: number;
    file: { data: Uint8Array; mimeType: string };
  },
  deps: OcrDeps = {},
): Promise<{ ok: true; text: string } | OcrFailure> {
  const fetcher = deps.fetcher ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return failed("unconfigured");
  if (breakerOpen(now())) return failed("busy");
  const b64 = Buffer.from(input.file.data).toString("base64");
  const block =
    input.file.mimeType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: b64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: input.file.mimeType,
            data: b64,
          },
        };
  const body = JSON.stringify({
    model: process.env.RECEIPT_OCR_MODEL || DEFAULT_OCR_MODEL,
    max_tokens: input.maxTokens,
    temperature: 0,
    system: input.system,
    messages: [
      {
        role: "user",
        content: [block, { type: "text", text: input.instruction }],
      },
    ],
  });
  const call = () =>
    fetcher(endpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  // 混雑・通信の失敗は、1回だけ待ってやり直す。認証・上限などは、やり直しても同じなので、すぐ諦める。
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await call();
    } catch {
      res = null;
    }
    const transient = !res || res.status === 429 || res.status >= 500;
    if (!transient) break;
    if (attempt === 0) await sleep(RETRY_DELAY_MS);
  }
  if (!res || res.status === 429 || res.status >= 500) {
    recentFailures.push(now());
    if (res) console.error("ocr: upstream status", res.status);
    return failed("busy");
  }
  if (!res.ok) {
    // 認証・残高・形式などの詳細は、利用者にもログにも出さない（状態だけ記録する）。
    console.error("ocr: upstream status", res.status);
    recentFailures.push(now());
    return failed("rejected");
  }
  try {
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    return { ok: true, text };
  } catch {
    return failed("unreadable");
  }
}
