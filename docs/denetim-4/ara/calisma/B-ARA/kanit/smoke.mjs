import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.setContent("<canvas id=c></canvas>");
const r = await page.evaluate(() => { const c = document.getElementById("c"); const gl = c.getContext("webgl2", {failIfMajorPerformanceCaveat:true}); const sw = c.getContext("webgl2"); const info = sw && sw.getExtension("WEBGL_debug_renderer_info"); return { hw: !!gl, sw: !!sw, renderer: sw ? sw.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : sw.RENDERER) : null, ua: navigator.userAgent }; });
console.log(JSON.stringify(r)); await browser.close();
