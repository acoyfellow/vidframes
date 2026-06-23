import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const root = join(import.meta.dirname, '..');

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

function page(title: string, description: string, path: string, body: string): string {
  const url = `https://vidframes.coey.dev${path}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b1118" />
    <meta name="color-scheme" content="dark" />
    <title>${title} — vidframes</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="/favicon.png" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="vidframes" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="vidframes" />
    <meta property="og:title" content="${title} — vidframes" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="https://vidframes.coey.dev/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:creator" content="@acoyfellow" />
    <meta name="twitter:title" content="${title} — vidframes" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="https://vidframes.coey.dev/og.png" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        "headline": "${title} — vidframes",
        "description": "${description}",
        "url": "${url}",
        "isPartOf": {
          "@type": "WebSite",
          "name": "vidframes",
          "url": "https://vidframes.coey.dev/"
        }
      }
    </script>
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
    path: '/architecture',
    description: 'System design, module layout, and design decisions for vidframes.',
  },
  {
    src: 'docs/costs.md',
    out: 'site/costs.html',
    title: 'Cost model',
    path: '/costs',
    description: 'Frame-count comparisons, resize impact, and example cost scenarios.',
  },
];

for (const doc of docs) {
  const md = readFileSync(join(root, doc.src), 'utf8');
  const html = marked.parse(md, { gfm: true, async: false }) as string;
  writeFileSync(join(root, doc.out), page(doc.title, doc.description, doc.path, html));
  console.log(`rendered ${doc.src} -> ${doc.out}`);
}
