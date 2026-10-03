import { buildDraftMime, type DraftInput } from "./mime";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
const SCOPE = `openid email ${GMAIL_SCOPE}`;
type TokenResponse = { access_token?: string; scope?: string; error?: string };
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        hint: string;
        include_granted_scopes: boolean;
        callback: (response: TokenResponse) => void;
        error_callback: () => void;
      }) => { requestAccessToken: (options: { prompt: string }) => void };
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
let loading: Promise<void> | null = null;
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const timeout = setTimeout(() => {
      script.remove();
      reject(
        new Error(
          "Googleの読み込みがタイムアウトしました。再読み込みしてください。",
        ),
      );
    }, 15000);
    script.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(
        new Error("Googleを読み込めませんでした。通信状況を確認してください。"),
      );
    };
    document.head.append(script);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}
/** Must run directly in a click handler. Tokens stay in memory for this one operation. */
export function authorizeGmail(
  clientId: string,
  sender: string,
): Promise<string> {
  if (!clientId || !window.google?.accounts.oauth2)
    return Promise.reject(
      new Error("Google連携を準備できていません。設定を確認してください。"),
    );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Google連携がタイムアウトしました。もう一度お試しください。",
          ),
        ),
      120000,
    );
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      hint: sender,
      include_granted_scopes: false,
      callback: (response) => {
        clearTimeout(timer);
        if (
          response.error ||
          !response.access_token ||
          !response.scope?.split(" ").includes(GMAIL_SCOPE)
        ) {
          reject(
            new Error(
              "下書き作成の許可が得られませんでした。Google連携の権限をご確認ください。",
            ),
          );
          return;
        }
        resolve(response.access_token);
      },
      error_callback: () => {
        clearTimeout(timer);
        reject(
          new Error(
            "Google連携を完了できませんでした。ポップアップを許可して再試行してください。",
          ),
        );
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}
export class DraftResultUnknownError extends Error {
  constructor() {
    super(
      "下書きの作成結果を確認できませんでした。重複を防ぐため、Gmailの下書きを確認してから再試行してください。",
    );
  }
}
export async function createGmailDraft(
  token: string,
  input: DraftInput,
  pdf: Uint8Array,
  invoiceNumber: string,
) {
  // Validate everything before making requests or accepting an OAuth account as the sender.
  const raw = buildDraftMime(input, pdf, invoiceNumber);
  const profileResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!profileResponse.ok)
    throw new Error(
      "Googleアカウントを確認できませんでした。もう一度連携してください。",
    );
  const profile = await profileResponse.json();
  if (
    profile.email_verified !== true ||
    typeof profile.email !== "string" ||
    profile.email.toLowerCase() !== input.from.trim().toLowerCase()
  )
    throw new Error(
      "連携したGoogleアカウントと登録済みの送信元が異なります。送信元と同じアカウントを選択してください。",
    );
  let response: Response;
  try {
    response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: { raw } }),
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch {
    throw new DraftResultUnknownError();
  }
  if (!response.ok) {
    if (response.status >= 500) throw new DraftResultUnknownError();
    throw new Error(
      response.status === 401
        ? "Google連携の有効期限が切れました。もう一度連携してください。"
        : response.status === 429
          ? "Gmailの利用上限に達しました。時間をおいて再試行してください。"
          : "Gmailに下書きを作成できませんでした。Gmail APIの有効化と利用権限をご確認ください。",
    );
  }
  let result: { id?: string };
  try {
    result = await response.json();
  } catch {
    throw new DraftResultUnknownError();
  }
  if (!result.id) throw new DraftResultUnknownError();
  return { id: result.id, url: gmailDraftsUrl(input.from) };
}
export function gmailDraftsUrl(sender: string) {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(sender)}#drafts`;
}
