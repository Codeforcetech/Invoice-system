// 使い方ガイドの画面写真を、本物の画面から撮る。押す場所には、番号つきの赤い枠を付ける。
//
//   1) 見本データを作る:  GUIDE_SEED=1 DATABASE_URL=<見本DB> npx vitest run tests/guide-seed.test.ts
//   2) 見本DBに接続した、本番ビルドのサーバーを起動する（例: http://127.0.0.1:8774）
//   3) node scripts/guide/capture.mjs [撮影ID ...]      （省略すると、すべて撮る）
//
// 写真は public/guide/<ID>.webp に保存される（幅1100px）。画面を変えたら、撮り直せばよい。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { SignJWT } from "jose";
import { launchChrome, newPage, sleep } from "./cdp.mjs";
import { shots } from "./shots.mjs";

const BASE = process.env.GUIDE_BASE ?? "http://127.0.0.1:8774";
const SECRET = process.env.AUTH_SECRET ?? "seiq-local-accounting-development-only-20260927";
const IDS = JSON.parse(readFileSync(process.env.GUIDE_IDS ?? "/tmp/guide-ids.json", "utf8"));
const OUT = "public/guide";
const personas = {
  admin: ["guide-admin", "ADMIN"], admin2: ["guide-admin2", "ADMIN"], approver: ["guide-approver", "USER"],
  editor: ["guide-editor", "USER"], contractor: ["guide-contractor", "USER"], applicant: ["guide-applicant", "USER"],
};
const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => { if (!(k in IDS)) throw new Error(`見本データに ${k} がありません`); return IDS[k]; });

// ページの中で動く、要素を探す部品
const HELPERS = `
window.__norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
window.__find = (spec) => {
  const norm = window.__norm;
  const all = (sel) => [...document.querySelectorAll(sel)];
  let list = [];
  if (spec.sel) list = all(spec.sel);
  else if (spec.label) {
    // 見出し（label）から、入力欄を探す: 関連づけ → 中にある → 同じ囲みの中
    const FIELD = 'input,select,textarea';
    const ctl = (l) => {
      if (l.control) return l.control;
      if (l.querySelector(FIELD)) return l.querySelector(FIELD);
      const p = l.parentElement;
      // 見出しと入力欄が同じ囲みの中に1組だけなら、囲み全体（見出し＋入力欄）を指す
      if (p && p.querySelectorAll(FIELD).length === 1) return p;
      // 見出しのあとに最初に出てくる入力欄（見出しと入力欄が別の囲みにあるとき）
      const after = [...document.querySelectorAll(FIELD)].find((f) => l.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING && f.type !== 'hidden');
      return after || l;
    };
    list = all('label').filter((l) => norm(l.textContent).includes(spec.label)).map(ctl);
    if (spec.block) list = list.map((e) => e.closest('label') || e);
  } else if (spec.text) {
    const tags = spec.tag || 'a,button,label,h1,h2,h3,summary';
    list = all(tags).filter((e) => norm(e.innerText || e.textContent).includes(spec.text));
    if (spec.within) list = list.filter((e) => e.closest(spec.within));
    // いちばん内側（細かい）ものを優先
    list = list.filter((e) => !list.some((o) => o !== e && e.contains(o)));
  }
  const el = list[spec.nth ?? 0];
  if (!el) throw new Error('見つかりません: ' + JSON.stringify(spec));
  return el;
};
window.__marks = (marks, pad) => {
  document.querySelectorAll('.__mark').forEach((n) => n.remove());
  const rects = [];
  marks.forEach((m, i) => {
    const el = window.__find(m);
    const r = el.getBoundingClientRect();
    const x = r.left + window.scrollX, y = r.top + window.scrollY;
    const box = document.createElement('div');
    box.className = '__mark';
    box.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483000;border:3px solid #e11d48;border-radius:10px;box-shadow:0 0 0 3px rgba(255,255,255,.85);' +
      'left:' + (x - pad) + 'px;top:' + (y - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px;';
    const b = document.createElement('div');
    b.textContent = String(m.n ?? i + 1);
    b.style.cssText = 'position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;background:#e11d48;color:#fff;font:700 15px/28px sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.4);';
    box.appendChild(b);
    document.body.appendChild(box);
    rects.push({ x, y, w: r.width, h: r.height });
  });
  return rects;
};
`;

const chrome = await launchChrome();
const page = await newPage(chrome.port);
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const failed = [];

async function login(persona) {
  await page.clearCookies();
  if (!persona || persona === "none") return;
  const [sub, role] = personas[persona];
  const token = await new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
  await page.cookie(BASE, "invoice_session", token);
}

for (const s of shots) {
  if (only.length && !only.includes(s.id)) continue;
  try {
    await login(s.persona);
    await page.viewport(1280, s.height ?? 800);
    await page.goto(BASE + fill(s.path));
    await sleep(s.wait ?? 1300);
    await page.eval(HELPERS);
    for (const st of s.steps ?? []) {
      if (st.click) await page.eval(`window.__find(${JSON.stringify(st.click)}).click()`);
      else if (st.fill) await page.eval(`(() => { const el = window.__find(${JSON.stringify(st.fill)}); const p = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, ${JSON.stringify(fill(st.value))}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
      else if (st.check) await page.eval(`window.__find(${JSON.stringify(st.check)}).click()`);
      else if (st.upload) await page.eval(`(async () => { const el = window.__find(${JSON.stringify(st.upload)}); const f = new File([new Uint8Array([37,80,68,70,45,49,46,52,10,37,37,69,79,70,10])], ${JSON.stringify(st.name ?? "請求書.pdf")}, { type: 'application/pdf' }); const dt = new DataTransfer(); dt.items.add(f); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      else if (st.eval) await page.eval(fill(st.eval));
      else if (st.goto) { await page.goto(BASE + fill(st.goto)); await sleep(1200); await page.eval(HELPERS); }
      await sleep(st.wait ?? 500);
    }
    // 手順の途中でページが切り替わったときは、部品を入れ直す
    await page.eval(HELPERS);
    // 見せたい場所を、画面の上のほうへ
    if (s.scrollTo) {
      await page.eval(`(() => { const r = window.__find(${JSON.stringify(s.scrollTo)}).getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - ${s.scrollMargin ?? 140}); })()`);
      await sleep(300);
    }
    const rects = s.marks?.length ? await page.eval(`JSON.stringify(window.__marks(${JSON.stringify(s.marks)}, 4))`).then(JSON.parse) : [];
    const scrollY = await page.eval("window.scrollY");
    const w = 1280, h = s.height ?? 800;
    const png = await page.shot({ x: 0, y: scrollY, width: w, height: h });
    const outPng = s.crop ? await sharp(png).extract({ left: s.crop.x, top: s.crop.y, width: s.crop.w, height: s.crop.h }).toBuffer() : png;
    await sharp(outPng).resize({ width: 1100, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${OUT}/${s.id}.webp`);
    const outside = rects.filter((r) => r.y - scrollY < 0 || r.y - scrollY + r.h > h);
    console.log(`✓ ${s.id}${outside.length ? "  （注意: 画面の外に出た印があります）" : ""}`);
  } catch (e) {
    failed.push(s.id);
    console.log(`✗ ${s.id}: ${e.message}`);
  }
}
chrome.proc.kill();
writeFileSync("/tmp/guide-capture-failed.txt", failed.join("\n"));
process.exit(failed.length ? 1 : 0);
