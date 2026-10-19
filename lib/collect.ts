import { score } from "./profile";
import type { Job } from "./types";

const s = (x: unknown) => (typeof x === "string" ? x : "");
const clean = (x: string) => decodeEntities(x.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();

function decodeEntities(x: string) {
  return x
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function getJson(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "HarshJobAgent/1.1" }, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function getText(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "HarshJobAgent/1.1" }, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

function xmlValue(block: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()) : "";
}

function parseRss(xml: string, source: string): Job[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return items.map((item, i) => {
    const title = clean(xmlValue(item, "title"));
    const url = xmlValue(item, "link").trim();
    const description = clean(xmlValue(item, "description") || xmlValue(item, "content:encoded"));
    const pubDate = xmlValue(item, "pubDate");
    const companyMatch = title.match(/\s[-–|]\s(.+)$/);
    const job: Job = {
      id: `${source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${url || title}`,
      source,
      source_id: url || `${source}:${i}:${title}`,
      title: companyMatch ? title.slice(0, companyMatch.index).trim() : title,
      company: companyMatch ? companyMatch[1].trim() : "See original listing",
      location: "Remote; confirm India eligibility on original listing",
      remote: true,
      url,
      description,
      posted_at: pubDate ? (Number.isNaN(Date.parse(pubDate)) ? null : new Date(pubDate).toISOString()) : null,
      salary: null,
      tags: [],
      status: "new",
    };
    job.match_score = score(job);
    return job;
  }).filter((job) => job.title && /^https?:\/\//i.test(job.url));
}

// Deliberately keep only roles that fit Harsh's support, FinTech, SaaS, customer success,
// and operations background. This blocks generic AI/software-engineering results.
function isRelevantRole(job: Job) {
  const title = (job.title || "").toLowerCase();
  const text = `${job.title || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  const excludedTitle = /\b(ai engineer|machine learning|ml engineer|data scientist|software engineer|frontend engineer|front-end engineer|backend engineer|back-end engineer|full[- ]stack|devops|site reliability|sre|cloud engineer|ios engineer|android engineer|qa automation|test automation|robotics|research scientist|quantitative researcher|embedded engineer)\b/i;
  if (excludedTitle.test(title)) return false;

  const relevantTitle = /customer support|customer service|customer experience|customer success|technical support|product support|saas support|application support|help ?desk|service desk|support specialist|support associate|support analyst|client support|client services|customer operations|customer onboarding|customer care|email support|chat support|escalation|fintech|financial operations|payment operations|payments support|banking operations|fraud operations|transaction support|account support|account manager|account management|sales operations|revenue operations|sales development representative|business development representative|inside sales|sales associate|crm operations|operations associate|operations specialist|operations coordinator|implementation specialist|onboarding specialist|technical account manager|customer success manager/i;
  if (relevantTitle.test(title)) return true;

  // Some job boards use broad titles; require a support/customer/finance function in the title,
  // not merely a keyword buried in the description.
  return false;
}

function looksRestrictedToOtherCountries(job: Job) {
  const text = `${job.location || ""} ${job.description || ""}`.toLowerCase();
  const global = /worldwide|anywhere in the world|work from anywhere|global remote|remote worldwide|remote - global|remote \(global\)|india remote|remote india|based anywhere/i.test(text);
  if (global || /india|asia[- ]pacific|apac/i.test(job.location || "")) return false;
  // Do not reject a listing just because the board omits location; flag it for user verification.
  const hasSpecificRestriction = /\b(us only|usa only|united states only|must reside in the us|u\.s\. only|canada only|uk only|united kingdom only|europe only|eu only|must be based in (the )?(us|usa|canada|uk|europe))\b/i.test(text);
  return hasSpecificRestriction;
}

function finalize(jobs: Job[]) {
  const unique = new Map<string, Job>();
  for (const job of jobs) {
    if (!job.url || !isRelevantRole(job) || looksRestrictedToOtherCountries(job)) continue;
    job.match_score = score(job);
    if (!unique.has(job.url)) unique.set(job.url, job);
  }
  return [...unique.values()];
}

export async function collect() {
  const jobs: Job[] = [];
  const errors: string[] = [];
  const run = async (name: string, fn: () => Promise<Job[]>) => {
    try { jobs.push(...await fn()); }
    catch (error) { errors.push(`${name}: ${error instanceof Error ? error.message : "error"}`); }
  };

  const greenhouseBoards = [...new Set(["readdle70", ...(process.env.GREENHOUSE_BOARDS || "").split(",").map((x) => x.trim()).filter(Boolean)])];

  await Promise.all([
    run("Arbeitnow", async () => {
      const data = await getJson("https://www.arbeitnow.com/api/job-board-api");
      return (data.data || []).map((x: any) => {
        const url = s(x.url);
        const job: Job = { id: `arbeit:${url}`, source: "Arbeitnow", source_id: s(x.slug) || url, title: s(x.title), company: s(x.company_name) || "Unknown", location: s(x.location) || "Not specified", remote: !!x.remote || /remote/i.test(s(x.location)), url, description: clean(s(x.description)), posted_at: x.created_at || null, tags: x.tags || [], status: "new" };
        job.match_score = score(job); return job;
      }).filter((job: Job) => job.title && job.url);
    }),
    run("Remotive", async () => {
      const data = await getJson("https://remotive.com/api/remote-jobs?limit=100");
      return (data.jobs || []).map((x: any) => {
        const url = s(x.url);
        const job: Job = { id: `remotive:${url}`, source: "Remotive", source_id: String(x.id || url), title: s(x.title), company: s(x.company_name) || "Unknown", location: s(x.candidate_required_location) || "Remote; confirm India eligibility on original listing", remote: true, url, description: clean(s(x.description)), salary: s(x.salary) || null, posted_at: x.publication_date || null, tags: x.tags || [], status: "new" };
        job.match_score = score(job); return job;
      }).filter((job: Job) => job.title && job.url);
    }),
    run("Remote OK", async () => {
      const data = await getJson("https://remoteok.com/api");
      return (Array.isArray(data) ? data.slice(1) : []).map((x: any) => {
        const url = s(x.url) || `https://remoteok.com/remote-jobs/${x.id}`;
        const job: Job = { id: `remoteok:${url}`, source: "Remote OK", source_id: String(x.id || url), title: s(x.position), company: s(x.company) || "Unknown", location: s(x.location) || "Remote; confirm India eligibility on original listing", remote: true, url, description: clean(s(x.description)), salary: [s(x.salary_min), s(x.salary_max)].filter(Boolean).join(" - ") || null, posted_at: x.date || null, tags: x.tags || [], status: "new" };
        job.match_score = score(job); return job;
      }).filter((job: Job) => job.title && job.url);
    }),
    run("We Work Remotely · Customer Support", async () => parseRss(await getText("https://weworkremotely.com/categories/remote-customer-support-jobs.rss"), "We Work Remotely")),
    run("We Work Remotely · Sales and Marketing", async () => parseRss(await getText("https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss"), "We Work Remotely")),
    run("We Work Remotely · Management and Finance", async () => parseRss(await getText("https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss"), "We Work Remotely")),
    run("Himalayas RSS", async () => parseRss(await getText("https://himalayas.app/jobs/rss"), "Himalayas")),
    run("Greenhouse", async () => {
      const out: Job[] = [];
      for (const board of greenhouseBoards) {
        try {
          const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
          for (const x of data.jobs || []) {
            const url = s(x.absolute_url);
            const job: Job = { id: `gh:${board}:${url}`, source: `Greenhouse · ${board}`, source_id: String(x.id || url), title: s(x.title), company: board === "readdle70" ? "Readdle" : board, location: s(x.location?.name) || "Not specified; verify India eligibility", remote: /remote|india|worldwide/i.test(s(x.location?.name)), url, description: clean(s(x.content)), posted_at: x.updated_at || null, tags: [], status: "new" };
            job.match_score = score(job); out.push(job);
          }
        } catch (error) {
          errors.push(`Greenhouse (${board}): ${error instanceof Error ? error.message : "error"}`);
        }
      }
      return out;
    }),
    run("Lever", async () => {
      const out: Job[] = [];
      for (const board of (process.env.LEVER_SITES || "").split(",").map((x) => x.trim()).filter(Boolean)) {
        const data = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`);
        for (const x of Array.isArray(data) ? data : []) {
          const url = s(x.hostedUrl);
          const job: Job = { id: `lever:${board}:${url}`, source: `Lever · ${board}`, source_id: String(x.id || url), title: s(x.text), company: board, location: s(x.categories?.location) || "Not specified; verify India eligibility", remote: /remote|india|worldwide/i.test(s(x.categories?.location)), url, description: clean(`${s(x.description)} ${s(x.additional)}`), posted_at: x.createdAt ? new Date(x.createdAt).toISOString() : null, tags: [], status: "new" };
          job.match_score = score(job); out.push(job);
        }
      }
      return out;
    }),
  ]);

  return { jobs: finalize(jobs), errors };
}
