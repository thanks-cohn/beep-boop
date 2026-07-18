import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const entries = ["index.html", "reveal.html"];
const failures = [];
const docs = new Map();

for (const entry of entries) {
  const html = await readFile(entry, "utf8");
  docs.set(entry, html);
  const required = ["<script type=\"module\" src=\"/src/main.js\"></script>", "id=\"app\"", "id=\"reader-container\"", "startup-shell", "#000000", "Doku-Doujin"];
  const forbidden = ["<title>Maintenance</title>", "15gzfnndqaod1.jpeg", "background: #111", "<<<<<<<", "=======", ">>>>>>>", "reveal.html?account", "index.html?account"];
  for (const item of required) if (!html.includes(item)) failures.push(`${entry}: missing ${item}`);
  for (const item of forbidden) if (html.includes(item)) failures.push(`${entry}: forbidden marker ${item}`);
  const module = html.match(/<script\s+type="module"\s+src="([^"]+)"/i)?.[1];
  if (module !== "/src/main.js") failures.push(`${entry}: application module is ${module || "missing"}`);
  for (const href of [...html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="([^"]+)"/gi)].map(m => m[1])) {
    if (/^(https?:)?\/\//.test(href) || href.startsWith("data:")) continue;
    const diskPath = href.startsWith("/") ? href.slice(1) : join(dirname(entry), href);
    await access(diskPath).catch(() => failures.push(`${entry}: unresolved asset ${href}`));
  }
}
if (docs.get("index.html") !== docs.get("reveal.html")) failures.push("index.html and reveal.html are not aligned to the same application shell");
const tmp = await mkdtemp(join(tmpdir(), "reveal-copy-"));
await writeFile(join(tmp, "index.html"), docs.get("reveal.html"));
const copied = await readFile(join(tmp, "index.html"), "utf8");
await rm(tmp, { recursive: true, force: true });
if (copied !== docs.get("reveal.html")) failures.push("reveal.html did not round-trip as index.html");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("dual entry application shells validated");
