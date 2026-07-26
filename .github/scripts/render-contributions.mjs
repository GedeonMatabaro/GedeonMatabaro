import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const login = process.argv[2] || "guidegdm";
const output = resolve(process.argv[3] || "assets/contribution-field.svg");
const to = new Date();
const from = new Date(to);
from.setUTCDate(from.getUTCDate() - 364);

const query = `
  query ContributionField($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays { contributionCount date weekday }
          }
        }
      }
    }
  }
`;

async function loadCalendar() {
  const variables = { login, from: from.toISOString(), to: to.toISOString() };
  if (process.env.GITHUB_TOKEN) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "content-type": "application/json",
        "user-agent": "guidegdm-public-practice",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`GitHub GraphQL returned ${response.status}`);
    const body = await response.json();
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data.user.contributionsCollection.contributionCalendar;
  }

  const raw = execFileSync(
    "gh",
    [
      "api",
      "graphql",
      "-f", `query=${query}`,
      "-f", `login=${login}`,
      "-f", `from=${variables.from}`,
      "-f", `to=${variables.to}`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(raw).data.user.contributionsCollection.contributionCalendar;
}

function longestStreak(days) {
  let current = 0;
  let longest = 0;
  for (const day of days) {
    current = day.contributionCount > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render(calendar) {
  const weeks = calendar.weeks.slice(-53);
  const days = weeks.flatMap((week) => week.contributionDays);
  const positives = days.map((day) => day.contributionCount).filter(Boolean).sort((a, b) => a - b);
  const percentile = (ratio) => positives[Math.floor((positives.length - 1) * ratio)] || 1;
  const thresholds = [0, 1, percentile(0.45), percentile(0.75), percentile(0.92)];
  const colors = ["#242322", "#5e4034", "#a94e37", "#ee6848", "#f2bd52"];
  const level = (count) => {
    if (!count) return 0;
    if (count <= thresholds[1]) return 1;
    if (count <= thresholds[2]) return 2;
    if (count <= thresholds[3]) return 3;
    return 4;
  };

  const width = 1200;
  const height = 300;
  const startX = 244;
  const startY = 112;
  const cell = 13;
  const gap = 4;
  const step = cell + gap;
  const activeDays = positives.length;
  const maximum = Math.max(0, ...positives);
  const streak = longestStreak(days);

  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, column) => {
    const date = new Date(`${week.firstDay}T00:00:00Z`);
    const month = date.getUTCMonth();
    if (month !== lastMonth && column < weeks.length - 2) {
      monthLabels.push(`<text x="${startX + column * step}" y="91">${date.toLocaleString("en", { month: "short", timeZone: "UTC" }).toUpperCase()}</text>`);
      lastMonth = month;
    }
  });

  const cells = [];
  weeks.forEach((week, column) => {
    week.contributionDays.forEach((day) => {
      const x = startX + column * step;
      const y = startY + day.weekday * step;
      const count = day.contributionCount;
      cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colors[level(count)]}"><title>${escapeXml(day.date)}: ${count} contribution${count === 1 ? "" : "s"}</title></rect>`);
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(login)} public GitHub practice</title>
  <desc id="desc">A custom 52-week contribution matrix showing ${calendar.totalContributions} contributions across ${activeDays} active days.</desc>
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0e0f10"/><stop offset="1" stop-color="#181411"/></linearGradient>
    <pattern id="microgrid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".5" fill="#f4ead9" opacity=".05"/></pattern>
  </defs>
  <rect width="1200" height="300" rx="24" fill="url(#panel)"/>
  <rect width="1200" height="300" rx="24" fill="url(#microgrid)"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">
    <text x="42" y="48" fill="#938b82" font-size="11" letter-spacing="2.5">PRACTICE, IN PUBLIC / 52 WEEKS</text>
    <text x="42" y="88" fill="#f3eadc" font-family="ui-sans-serif, system-ui, sans-serif" font-size="25" font-weight="700">Returning to the work.</text>
    <text x="42" y="118" fill="#a39a91" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">Not a score. A rhythm.</text>
    <g fill="#7d756f" font-size="9" letter-spacing="1.1">${monthLabels.join("")}</g>
    <g fill="#6e6863" font-size="9"><text x="211" y="139">MON</text><text x="211" y="173">WED</text><text x="211" y="207">FRI</text></g>
    <g>${cells.join("")}</g>
    <g transform="translate(42 164)">
      <text y="0" fill="#766f68" font-size="9" letter-spacing="1.5">TOTAL</text>
      <text y="25" fill="#f3eadc" font-size="20" font-weight="700">${calendar.totalContributions}</text>
      <text x="82" y="0" fill="#766f68" font-size="9" letter-spacing="1.5">ACTIVE DAYS</text>
      <text x="82" y="25" fill="#f3eadc" font-size="20" font-weight="700">${activeDays}</text>
      <text y="67" fill="#766f68" font-size="9" letter-spacing="1.5">LONGEST RUN</text>
      <text y="92" fill="#f3eadc" font-size="20" font-weight="700">${streak}<tspan fill="#7d756f" font-size="9"> DAYS</tspan></text>
      <text x="82" y="67" fill="#766f68" font-size="9" letter-spacing="1.5">PEAK</text>
      <text x="82" y="92" fill="#f3eadc" font-size="20" font-weight="700">${maximum}<tspan fill="#7d756f" font-size="9"> / DAY</tspan></text>
    </g>
    <g transform="translate(1008 262)" fill="#776f68" font-size="9"><text x="-53" y="10">QUIET</text>${colors.map((color, index) => `<rect x="${index * 18}" width="12" height="12" rx="3" fill="${color}"/>`).join("")}<text x="98" y="10">INTENSE</text></g>
    <text x="42" y="278" fill="#5e5853" font-size="8" letter-spacing="1.2">UPDATED ${to.toISOString().slice(0, 10)} UTC · SOURCE GITHUB GRAPHQL</text>
  </g>
</svg>`;
}

const calendar = await loadCalendar();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, render(calendar), "utf8");
console.log(`Rendered ${output}`);
