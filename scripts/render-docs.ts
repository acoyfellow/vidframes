import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const root = join(import.meta.dirname, '..');

const ICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎬</text></svg>";

const TOPBAR = `<nav class="topbar">
  <a href="/" class="topbar-brand"><span class="dot"></span> vidframes</a>
  <div class="topbar-links">
    <a href="/#quick-start">Quick start</a>
    <a href="/architecture">Architecture</a>
    <a href="/costs">Costs</a>
    <a href="https://github.com/acoyfellow/vidframes">GitHub</a>
  </div>
</nav>`;

const FOOTER = `<footer>
  <p><a href="/">Home</a> · <a href="https://github.com/acoyfellow/vidframes">GitHub</a> · <a href="https://x.com/acoyfellow">@acoyfellow</a> · MIT</p>
</footer>`;

function page(title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b1118" />
    <meta name="color-scheme" content="dark" />
    <title>${title} — vidframes</title>
    <meta name="description" content="${description}" />
    <link rel="icon" href="${ICON}" />
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    ${TOPBAR}
    <main>
      <article class="doc">
${body}
      </article>
      ${FOOTER}
    </main>
  </body>
</html>
`;
}

const docs = [
  {
    src: 'docs/architecture.md',
    out: 'site/architecture.html',
    title: 'Architecture',
    description: 'System design, module layout, and design decisions for vidframes.',
  },
  {
    src: 'docs/costs.md',
    out: 'site/costs.html',
    title: 'Cost model',
    description: 'Frame-count comparisons, resize impact, and example cost scenarios.',
  },
];

for (const doc of docs) {
  const md = readFileSync(join(root, doc.src), 'utf8');
  const html = marked.parse(md, { gfm: true, async: false }) as string;
  writeFileSync(join(root, doc.out), page(doc.title, doc.description, html));
  console.log(`rendered ${doc.src} -> ${doc.out}`);
}
