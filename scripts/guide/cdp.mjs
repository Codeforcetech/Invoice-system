// Chrome を動かして画面を撮るための、最小限の操作部品（Chrome DevTools Protocol）。
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome(port = 9333) {
  const dir = mkdtempSync(join(tmpdir(), "guide-chrome-"));
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", 
    "--force-device-scale-factor=1", "--lang=ja-JP", "--disable-extensions", "about:blank",
  ], { stdio: "ignore" });
  for (let i = 0; i < 200; i++) {
    try {
      const v = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      return { proc, port, ws: v.webSocketDebuggerUrl };
    } catch { await sleep(200); }
  }
  proc.kill();
  throw new Error("Chrome を起動できませんでした");
}

export async function newPage(port) {
  const t = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method) (listeners.get(d.method) ?? []).forEach((f) => f(d.params));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const once = (method) => new Promise((res) => { const f = (p) => { listeners.set(method, (listeners.get(method) ?? []).filter((x) => x !== f)); res(p); }; listeners.set(method, [...(listeners.get(method) ?? []), f]); });
  await send("Page.enable"); await send("Network.enable"); await send("Runtime.enable");
  return {
    send,
    async goto(url) { const loaded = once("Page.loadEventFired"); await send("Page.navigate", { url }); await Promise.race([loaded, sleep(15000)]); },
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); },
    async cookie(base, name, value) { await send("Network.setCookie", { name, value, url: base, httpOnly: true, sameSite: "Lax" }); },
    async clearCookies() { await send("Network.clearBrowserCookies"); },
    async shot(clip) {
      const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip });
      return Buffer.from(r.data, "base64");
    },
    close() { try { ws.close(); } catch {} },
  };
}
export { sleep };
