import { chromium } from "@playwright/test";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
const [, , SCREENS, OUT] = process.argv;
for (const d of ["", "/pc", "/mobile", "/compositions"]) mkdirSync(OUT + d, { recursive: true });
const img = (f) => `data:image/png;base64,${readFileSync(`${SCREENS}/${f}`).toString("base64")}`;
const css = `
*{box-sizing:border-box;margin:0}html,body{background:transparent}
.stage{position:relative;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden}
.bg{background:radial-gradient(60% 70% at 25% 30%,#3a1f7a 0%,transparent 60%),radial-gradient(55% 60% at 80% 75%,#0f4c75 0%,transparent 60%),radial-gradient(40% 40% at 70% 20%,#7a1f5c 0%,transparent 60%),#07070c}
.laptop{position:relative;width:var(--w)}
.laptop .lid{background:linear-gradient(#2a2a31,#151519);border-radius:calc(var(--w)*.022);padding:calc(var(--w)*.016) calc(var(--w)*.016) calc(var(--w)*.022);box-shadow:0 0 0 2px #3a3a42 inset,0 60px 120px -30px rgba(0,0,0,.8)}
.laptop .lid img{display:block;width:100%;border-radius:calc(var(--w)*.006)}
.laptop .cam{position:absolute;top:calc(var(--w)*.0065);left:50%;width:calc(var(--w)*.006);height:calc(var(--w)*.006);margin-left:calc(var(--w)*-.003);border-radius:50%;background:#0b0b0e;box-shadow:0 0 0 1px #2c2c33}
.laptop .base{position:relative;height:calc(var(--w)*.03);margin:0 calc(var(--w)*-.075);background:linear-gradient(#cfd0d6,#8e9099 55%,#5d5f66);border-radius:0 0 calc(var(--w)*.03) calc(var(--w)*.03) / 0 0 calc(var(--w)*.022) calc(var(--w)*.022)}
.laptop .base:after{content:"";position:absolute;left:50%;top:0;width:calc(var(--w)*.16);height:calc(var(--w)*.009);margin-left:calc(var(--w)*-.08);background:#77798280;border-radius:0 0 calc(var(--w)*.01) calc(var(--w)*.01)}
.phone{position:relative;width:var(--pw);border-radius:calc(var(--pw)*.16);padding:calc(var(--pw)*.035);background:linear-gradient(145deg,#3b3b44,#141418 40%,#2b2b33);box-shadow:0 0 0 2px #50505a inset,0 50px 110px -25px rgba(0,0,0,.85)}
.phone img{display:block;width:100%;border-radius:calc(var(--pw)*.13)}
.phone .island{position:absolute;top:calc(var(--pw)*.065);left:50%;width:calc(var(--pw)*.3);height:calc(var(--pw)*.085);margin-left:calc(var(--pw)*-.15);background:#000;border-radius:999px}
.phone .btn{position:absolute;right:calc(var(--pw)*-.012);top:28%;width:calc(var(--pw)*.014);height:12%;background:#2c2c33;border-radius:4px}
`;
const laptop = (src, w) => `<div class="laptop" style="--w:${w}px"><div class="lid"><div class="cam"></div><img src="${src}"></div><div class="base"></div></div>`;
const STATUS_ICONS = `<svg viewBox="0 0 68 12" width="100%" height="100%" fill="#fff"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/><path d="M30 3.2a10 10 0 0 1 13 0l-1.6 1.7a7.6 7.6 0 0 0-9.8 0zM32.8 6.2a6 6 0 0 1 7.4 0l-1.7 1.8a3.5 3.5 0 0 0-4 0zM35.2 9.4h2.6L36.5 11z"/><rect x="48" y="1" width="17" height="10" rx="3" fill="none" stroke="#fff" stroke-opacity=".6"/><rect x="50" y="3" width="11" height="6" rx="1.5"/><rect x="66" y="4.5" width="1.6" height="3" rx=".8" fill-opacity=".6"/></svg>`;
const phone = (src, w, extra = "") => `<div class="phone" style="--pw:${w}px;${extra}"><div class="island"></div><div class="btn"></div>
  <div style="position:relative;border-radius:calc(var(--pw)*.13);overflow:hidden;background:#07070c">
    <div style="position:relative;height:calc(var(--pw)*.13);overflow:hidden">
      <div style="position:absolute;inset:-40%;background:url(${src}) top/100% auto no-repeat;filter:blur(18px) brightness(.85)"></div>
      <span style="position:absolute;left:calc(var(--pw)*.11);top:calc(var(--pw)*.045);font:600 calc(var(--pw)*.042)/1 -apple-system,'Segoe UI',Arial,sans-serif;color:#fff">9:41</span>
      <span style="position:absolute;right:calc(var(--pw)*.08);top:calc(var(--pw)*.05);width:calc(var(--pw)*.17);height:calc(var(--pw)*.032)">${STATUS_ICONS}</span>
    </div>
    <img src="${src}" style="border-radius:0">
  </div></div>`;
const b = await chromium.launch({ channel: "msedge" });
const page = await b.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
async function render(name, body, { bg = false, size = [3840, 2160] } = {}) {
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.setContent(`<html><head><style>${css}</style></head><body><div class="stage ${bg ? "bg" : ""}">${body}</div></body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}.png`, omitBackground: !bg });
  console.log("✓", name);
}
const files = readdirSync(SCREENS);
for (const f of files.filter((f) => f.startsWith("pc-"))) await render(`pc/${f.replace(".png", "")}`, laptop(img(f), 3000), { size: [3840, 2400] });
for (const f of files.filter((f) => f.startsWith("mobile-"))) await render(`mobile/${f.replace(".png", "")}`, phone(img(f), 900), { size: [1200, 2400] });
await render("compositions/01-pc-et-mobile", `<div style="position:relative;display:flex;align-items:flex-end">${laptop(img("pc-03-scene-borealis.png"), 2700)}<div style="margin-left:-420px;margin-bottom:-60px">${phone(img("mobile-03-lecteur.png"), 640)}</div></div>`, { bg: true });
await render("compositions/02-pc-et-mobile-transparent", `<div style="position:relative;display:flex;align-items:flex-end">${laptop(img("pc-03-scene-borealis.png"), 2700)}<div style="margin-left:-420px;margin-bottom:-60px">${phone(img("mobile-03-lecteur.png"), 640)}</div></div>`);
await render("compositions/03-trois-telephones", `<div style="display:flex;gap:160px;align-items:center">${phone(img("mobile-04-scene-prism.png"), 700, "transform:rotate(-6deg) translateY(60px)")}${phone(img("mobile-05-en-lecture.png"), 760)}${phone(img("mobile-07-paroles.png"), 700, "transform:rotate(6deg) translateY(60px)")}</div>`, { bg: true });
await render("compositions/04-scenes-visuelles", `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:70px;width:3400px">${["borealis","prism","liquid","warp","vinyl","spectrum"].map((m) => `<img src="${img(`pc-03-scene-${m}.png`)}" style="width:100%;border-radius:28px;box-shadow:0 40px 90px -20px #000">`).join("")}</div>`, { bg: true });
await render("compositions/05-recherche-et-paroles", `<div style="display:flex;gap:420px;align-items:center">${laptop(img("pc-02-recherche.png"), 1560)}${laptop(img("pc-05-paroles.png"), 1560)}</div>`, { bg: true });
await b.close();
