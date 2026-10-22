import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const docs = new URL("docs/", root);

await mkdir(docs, { recursive: true });
await copyFile(new URL("dist/PHASE.html", root), new URL("index.html", docs));
await writeFile(new URL(".nojekyll", docs), "");
await copyFile(new URL("dist/PHASE.html", root), new URL("index.html", root));
await writeFile(new URL(".nojekyll", root), "");
await mkdir(new URL("release/", root), { recursive: true });
await copyFile(
  new URL("dist/PHASE.html", root),
  new URL("release/PHASE.html", root),
);

console.log(
  `GitHub Pages output written to ${fileURLToPath(docs)} and repository root.`,
);
