// 画面ごとの、ボタン・入力欄・見出しの一覧を出す（撮影の指定を書くための調査用）。
//   node scripts/guide/dump.mjs <persona> <path> [...]
import { SignJWT } from "jose";
import { launchChrome, newPage, sleep } from "./cdp.mjs";

const BASE = process.env.GUIDE_BASE ?? "http://127.0.0.1:8774";
const SECRET = process.env.AUTH_SECRET ?? "seiq-local-accounting-development-only-20260927";
const personas = { admin: ["guide-admin", "ADMIN"], admin2: ["guide-admin2", "ADMIN"], approver: ["guide-approver", "USER"], editor: ["guide-editor", "USER"], contractor: ["guide-contractor", "USER"], applicant: ["guide-applicant", "USER"] };
const [persona, ...paths] = process.argv.slice(2);
const chrome = await launchChrome();
const page = await newPage(chrome.port);
await page.viewport(1280, 900);
if (personas[persona]) {
  const [sub, role] = personas[persona];
  const token = await new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
  await page.cookie(BASE, "invoice_session", token);
}
for (const p of paths) {
  await page.goto(BASE + p); await sleep(1200);
  const out = await page.eval(`(() => {
    const t = (e) => (e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' ').slice(0,50);
    const rows = [];
    document.querySelectorAll('main h1,main h2,main h3').forEach(e => rows.push('H  ' + t(e)));
    document.querySelectorAll('main label').forEach(e => rows.push('L  ' + t(e).slice(0,40)));
    document.querySelectorAll('main button,main a[href]').forEach(e => rows.push((e.tagName==='A'?'A  ':'B  ') + t(e) + (e.tagName==='A' ? ' -> '+e.getAttribute('href') : '')));
    return location.pathname + '\\n' + rows.join('\\n');
  })()`);
  console.log("=== " + p + "\n" + out + "\n");
}
chrome.proc.kill(); process.exit(0);
