import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../scripts/ingest-work.py", import.meta.url).pathname;

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), "ingest-meta-"));
  const data = join(root, "src/data");
  await mkdir(join(data, "works"), { recursive: true });
  const manifest = { version: 1, slug: "Work_Slug", display: "Work Slug", source: "e", thumb: "https://example.invalid/t.webp", chapters: ["chapter_1"], tags: ["old-tag"], public: false };
  await writeFile(join(data, "works/Work_Slug.json"), JSON.stringify(manifest, null, 2));
  await writeFile(join(data, "fetch.json"), JSON.stringify({ version: 2, works: [{ slug: "Work_Slug", keep: true }] }, null, 2));
  await writeFile(join(data, "rotunda.json"), JSON.stringify({ version: 2, works: [{ slug: "Work_Slug", keep: true }] }, null, 2));
  return { root, data };
}

function run(args, cwd) {
  return spawnSync("python", [script, ...args], { cwd, encoding: "utf8" });
}

test("blank metadata tags preserve existing tags and visibility", async () => {
  const { root, data } = await makeRepo();
  const r = run(["--metadata-only", "--repo-data", data, "--slug", "Work_Slug", "--tags", ""], root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const manifest = JSON.parse(await readFile(join(data, "works/Work_Slug.json"), "utf8"));
  assert.deepEqual(manifest.tags, ["old-tag"]);
  assert.equal(manifest.public, false);
});

test("explicit clear-tags clears and metadata-only does not run upload/search", async () => {
  const { root, data } = await makeRepo();
  const r = run(["--metadata-only", "--repo-data", data, "--slug", "Work_Slug", "--clear-tags", "--public"], root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const manifest = JSON.parse(await readFile(join(data, "works/Work_Slug.json"), "utf8"));
  assert.deepEqual(manifest.tags, []);
  assert.equal(manifest.public, true);
  assert.match(r.stdout, /No chapter images, upload remotes, or search generation were touched/);
  assert.doesNotMatch(r.stdout, /generate_search|rclone|rsync|renumber|thumb:/);
});
