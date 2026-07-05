#!/usr/bin/env node
/**
 * Generates assets/stats.svg and assets/top-langs.svg from the GitHub API.
 * Self-hosted replacement for github-readme-stats (no external service).
 * Env: GH_LOGIN (default TakCastel), GITHUB_TOKEN (optional, raises rate limit).
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const LOGIN = process.env.GH_LOGIN || "TakCastel";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT = `'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif`;

const headers = { "User-Agent": "profile-stats" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// ---- Fetch data ----
const user = await api(`/users/${LOGIN}`);

let repos = [];
for (let page = 1; ; page++) {
  const batch = await api(`/users/${LOGIN}/repos?per_page=100&page=${page}`);
  repos = repos.concat(batch);
  if (batch.length < 100) break;
}
const own = repos.filter((r) => !r.fork);

const totalStars = own.reduce((s, r) => s + r.stargazers_count, 0);
const totalForks = own.reduce((s, r) => s + r.forks_count, 0);

const langBytes = {};
for (const r of own) {
  try {
    const langs = await api(`/repos/${LOGIN}/${r.name}/languages`);
    for (const [lang, bytes] of Object.entries(langs)) {
      langBytes[lang] = (langBytes[lang] || 0) + bytes;
    }
  } catch {
    /* skip repos that error out */
  }
}
const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0);
const topLangs = Object.entries(langBytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, bytes]) => ({ name, pct: (bytes / totalBytes) * 100 }));

// ---- Shared style (theme-aware, same as project cards) ----
const themeCss = `
    .bg { fill: #ffffff; stroke: #d0d7de; }
    .t  { fill: #1f2328; }
    .d  { fill: #656d76; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #161b22; stroke: #30363d; }
      .t  { fill: #e6edf3; }
      .d  { fill: #8b949e; }
    }`;

const gradient = `
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>`;

// ---- Stats card ----
const since = new Date(user.created_at).getFullYear();
const stats = [
  { icon: "⭐", label: "Total stars", value: totalStars },
  { icon: "📦", label: "Public repos", value: user.public_repos },
  { icon: "👥", label: "Followers", value: user.followers },
  { icon: "🔀", label: "Forks of my repos", value: totalForks },
];
const statRows = stats
  .map(
    (s, i) => `
  <text x="34" y="${78 + i * 26}" font-family="${FONT}" font-size="14">${s.icon}</text>
  <text x="62" y="${78 + i * 26}" font-family="${FONT}" font-size="13.5" class="d">${s.label}</text>
  <text x="396" y="${78 + i * 26}" text-anchor="end" font-family="${FONT}" font-size="13.5" font-weight="700" class="t">${s.value}</text>`
  )
  .join("");

const statsSvg = `<svg width="420" height="195" viewBox="0 0 420 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats of ${LOGIN}">
  <style>${themeCss}
  </style>
  <defs>${gradient}
  </defs>
  <rect x="1" y="1" width="418" height="193" rx="12" class="bg" stroke-width="1"/>
  <rect x="1" y="1" width="6" height="193" rx="3" fill="url(#g)"/>
  <circle cx="40" cy="34" r="5" fill="url(#g)"/>
  <text x="56" y="40" font-family="${FONT}" font-size="16" font-weight="700" class="t">Tak's GitHub Stats</text>
  <text x="396" y="40" text-anchor="end" font-family="${FONT}" font-size="11.5" class="d">since ${since}</text>
${statRows}
</svg>
`;

// ---- Top languages card ----
const LANG_COLORS = {
  Vue: "#41b883", TypeScript: "#3178c6", JavaScript: "#f1e05a", HTML: "#e34c26",
  CSS: "#663399", SCSS: "#c6538c", PHP: "#4F5D95", Shell: "#89e051",
  Python: "#3572A5", Ruby: "#701516", Go: "#00ADD8", Rust: "#dea584",
};
const fallback = ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#22c55e", "#8b5cf6"];
const color = (name, i) => LANG_COLORS[name] || fallback[i % fallback.length];

const BAR_X = 34, BAR_W = 362, BAR_Y = 58;
let cursor = BAR_X;
const segments = topLangs
  .map((l, i) => {
    const w = Math.max(2, (l.pct / 100) * BAR_W);
    const seg = `  <rect x="${cursor.toFixed(1)}" y="${BAR_Y}" width="${w.toFixed(1)}" height="10" fill="${color(l.name, i)}"/>`;
    cursor += w;
    return seg;
  })
  .join("\n");

const legend = topLangs
  .map((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 34 + col * 185, y = 100 + row * 26;
    return `
  <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${color(l.name, i)}"/>
  <text x="${x + 18}" y="${y}" font-family="${FONT}" font-size="12.5" class="t">${l.name}</text>
  <text x="${x + 165}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="12" class="d">${l.pct.toFixed(1)}%</text>`;
  })
  .join("");

const langsSvg = `<svg width="420" height="195" viewBox="0 0 420 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Most used languages of ${LOGIN}">
  <style>${themeCss}
  </style>
  <defs>${gradient}
    <clipPath id="bar"><rect x="${BAR_X}" y="${BAR_Y}" width="${BAR_W}" height="10" rx="5"/></clipPath>
  </defs>
  <rect x="1" y="1" width="418" height="193" rx="12" class="bg" stroke-width="1"/>
  <rect x="1" y="1" width="6" height="193" rx="3" fill="url(#g)"/>
  <circle cx="40" cy="34" r="5" fill="url(#g)"/>
  <text x="56" y="40" font-family="${FONT}" font-size="16" font-weight="700" class="t">Most Used Languages</text>
  <g clip-path="url(#bar)">
${segments}
  </g>
${legend}
</svg>
`;

mkdirSync(join(ROOT, "assets"), { recursive: true });
writeFileSync(join(ROOT, "assets", "stats.svg"), statsSvg);
writeFileSync(join(ROOT, "assets", "top-langs.svg"), langsSvg);
console.log(`OK — stars:${totalStars} repos:${user.public_repos} followers:${user.followers} | langs: ${topLangs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}`);
