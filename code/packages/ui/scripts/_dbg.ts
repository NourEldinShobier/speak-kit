import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { serveDir } from "./serve.ts";

const { url, server } = await serveDir(resolve(import.meta.dirname, "../out/gallery"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
await page.goto(url);
await page.waitForSelector("[data-spec]");
const code = process.argv[2] ?? "";
const out = await page.evaluate(async (c) => {
  // eslint-disable-next-line no-new-func
  return await new Function(`return (async()=>{${c}})()`)();
}, code);
console.log(JSON.stringify(out));
await browser.close();
server.close();
