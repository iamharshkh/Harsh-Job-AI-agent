import { isRelevantTitle, score } from "./profile";
import type { Job } from "./types";

const s = (x: unknown) => (typeof x === "string" ? x : x == null ? "" : String(x));
const clean = (x: string) => decodeEntities(x.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
function decodeEntities(x: string) {
  return x.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } });
}
async function getJson(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "HarshJobAgent/1.2 (+job discovery) ", Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(18000) });
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}: ${body.slice(0, 110).replace(/\s+/g, " ")}`);
  try { return JSON.parse(body); }
  catch { throw new Error(`Non-JSON response from ${new URL(url).hostname}: ${body.slice(0, 90).replace(/\s+/g, " ")}`); }
}
async function getText(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "HarshJobAgent/1.2 (+job discovery)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain, */*" }, cache: "no-store", signal: AbortSignal.timeout(18000) });
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}: ${body.slice(0, 110).replace(/\s+/g, " ")}`);
  if (/<rss|<feed|<\?xml|<channel/i.test(body.slice(0, 1000))) return body;
  throw new Error(`Expected RSS/XML from ${new URL(url).hostname}, got HTML/non-feed response: ${body.slice(0, 90).replace(/\s+/g, " ")}`);
}
function xmlValue(block: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()) : "";
}
function parseRss(xml: string, source: string): Job[] {
  const items = [...(xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []), ...(xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [])];
  return items.map((item, i) => {
    const title = clean(xmlValue(item, "title"));
    const url = xmlValue(item, "link").trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    const description = clean(xmlValue(item, "description") || xmlValue(item, "content:encoded") || xmlValue(item, "summary") || xmlValue(item, "content"));
    const pubDate = xmlValue(item, "pubDate") || xmlValue(item, "published") || xmlValue(item, "updated");
    const companyMatch = title.match(/\s[-–|]\s(.+)$/);
    return {
      id: `${source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${url || title}`,
      source, source_id: url || `${source}:${i}:${title}`,
      title: companyMatch ? title.slice(0, companyMatch.index).trim() : title,
      company: companyMatch ? companyMatch[1].trim() : "See original listing",
      location: "Remote; confirm India eligibility on original listing", remote: true, url,
      description, posted_at: pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : null,
      salary: extractSalary(`${title} ${description}`), tags: [], status: "new", match_score: 0
    } as Job;
  }).filter(job => job.title && /^https?:\/\//i.test(job.url));
}
function extractSalary(text: string): string | null {
  const patterns = [
    /(?:USD\s*)?\$\s?[\d,]+(?:\s?(?:-|–|to)\s?\$?\s?[\d,]+)?(?:\s*(?:per year|\/year|annually|per month|\/month|monthly|hourly|\/hr))?/i,
    /(?:INR\s*)?₹\s?[\d,]+(?:\s?(?:-|–|to)\s?₹?\s?[\d,]+)?(?:\s*(?:LPA|per year|\/year|per month|\/month|monthly|CTC))?/i,
    /(?:INR\s*)?Rs\.?\s?[\d,]+(?:\s?(?:-|–|to)\s?Rs\.?\s?[\d,]+)?(?:\s*(?:LPA|per year|\/year|per month|\/month|monthly|CTC))?/i,
    /\b\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*(?:LPA|lakhs? per annum|per year|\/year|USD|INR)\b/i
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[0].trim(); }
  return null;
}
function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "number") { const d = new Date(value > 1e12 ? value : value * 1000); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function fromGeneric(x: any, source: string, defaults: Partial<Job> = {}): Job {
  const title = s(x.title || x.position || x.name || x.text);
  const url = s(x.url || x.jobUrl || x.job_url || x.hostedUrl || x.absolute_url || x.link);
  const description = clean(s(x.description || x.jobDescription || x.content || x.descriptionHtml || x.job_description));
  const salary = s(x.salary || x.salaryText || x.salary_text) || extractSalary(`${title} ${description}`);
  const location = s(x.location || x.locationName || x.candidate_required_location || x.jobLocation) || "Remote; confirm India eligibility on original listing";
  const job: Job = {
    id: `${source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${url}`,
    source, source_id: s(x.id || x.slug || url), title,
    company: s(x.company_name || x.company || x.companyName || x.employer_name) || "See original listing",
    location, remote: x.remote === true || /remote|worldwide|anywhere/i.test(location), url, description, salary: salary || null,
    posted_at: normalizeDate(x.publication_date || x.created_at || x.date || x.pubDate || x.createdAt || x.posted_at || x.publishedAt),
    tags: Array.isArray(x.tags) ? x.tags.map(s) : [], status: "new", ...defaults
  };
  job.match_score = score(job);
  return job;
}
function explicitlyRestrictedToOtherCountries(job: Job) {
  const text = `${job.location || ""} ${job.description || ""}`.toLowerCase();
  const countryRestricted = /\b(us only|usa only|united states only|must reside in the us|u\.s\. only|canada only|uk only|united kingdom only|europe only|eu only|must be based in (the )?(us|usa|canada|uk|europe))\b/i.test(text);
  const mandatoryBachelor = /\b(bachelor(?:'s)? degree required|must have (a )?bachelor(?:'s)? degree|graduation is mandatory|graduation required|degree is mandatory)\b/i.test(text);
  return countryRestricted || mandatoryBachelor;
}
function finalize(jobs: Job[]) {
  const unique = new Map<string, Job>();
  // A 14-day freshness window gives the agent a broader live pool while prioritizing the newest listings.
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const job of jobs) {
    if (!job.url || !/^https?:\/\//i.test(job.url) || !isRelevantTitle(job.title) || explicitlyRestrictedToOtherCountries(job)) continue;
    const posted = job.posted_at ? Date.parse(job.posted_at) : NaN;
    if (Number.isFinite(posted) && posted < cutoff) continue;
    job.match_score = score(job);
    if (job.match_score < 70) continue;
    if (!unique.has(job.url)) unique.set(job.url, job);
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.posted_at || "") - Date.parse(a.posted_at || ""));
}

export async function collect() {
  const jobs: Job[] = [];
  const errors: string[] = [];
  let successfulSources = 0;
  const run = async (name: string, fn: () => Promise<Job[]>) => {
    try { jobs.push(...await fn()); successfulSources += 1; }
    catch (error) { errors.push(`${name}: ${error instanceof Error ? error.message : "unknown source error"}`); }
  };
  const greenhouseBoards = [...new Set(["readdle70", ...(process.env.GREENHOUSE_BOARDS || "").split(",").map(x => x.trim()).filter(Boolean)])];
  const remotiveCategories = ["customer support", "sales", "finance", "business", "hr"];
  const jobicyTags = ["customer-support", "customer-success", "technical-support", "sales", "finance", "operations"];

  const tasks: Promise<void>[] = [
    run("Arbeitnow", async () => {
      const data = await getJson("https://www.arbeitnow.com/api/job-board-api");
      return (data.data || []).map((x: any) => fromGeneric({ ...x, title: x.title, company_name: x.company_name, created_at: x.created_at, remote: x.remote }, "Arbeitnow", { location: s(x.location) || "Not specified; verify remote eligibility" }));
    }),
    run("Remote OK", async () => {
      const data = await getJson("https://remoteok.com/api");
      return (Array.isArray(data) ? data.slice(1) : []).map((x: any) => fromGeneric({ ...x, url: x.url || `https://remoteok.com/remote-jobs/${x.id}`, title: x.position, company: x.company, salary: [x.salary_min, x.salary_max].filter(Boolean).join(" - ") || x.salary }, "Remote OK"));
    }),
    run("Himalayas API", async () => {
      const data = await getJson("https://himalayas.app/jobs/api?limit=100&offset=0");
      const arr = Array.isArray(data) ? data : (data.jobs || data.data || []);
      return arr.map((x: any) => fromGeneric({ ...x, title: x.title || x.name, url: x.applicationLink || x.application_url || x.url, company_name: x.companyName || x.company, location: x.location || x.locationRestrictions?.join(", "), created_at: x.pubDate || x.createdAt, salary: x.salary || x.salaryCurrency && `${x.salaryCurrency} ${x.minSalary || ""} - ${x.maxSalary || ""}` }, "Himalayas"));
    }),
    run("Jobicy", async () => {
      const batches = await Promise.all(jobicyTags.map(async tag => {
        const data = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag)}`);
        return (data.jobs || []).map((x: any) => fromGeneric({ ...x, company_name: x.companyName, url: x.url, created_at: x.pubDate, salary: x.annualSalary || x.salary }, "Jobicy"));
      }));
      return batches.flat();
    }),
    run("We Work Remotely · Customer Support", async () => parseRss(await getText("https://weworkremotely.com/categories/remote-customer-support-jobs.rss"), "We Work Remotely")),
    run("We Work Remotely · Sales", async () => parseRss(await getText("https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss"), "We Work Remotely")),
    run("We Work Remotely · Management and Finance", async () => parseRss(await getText("https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss"), "We Work Remotely")),
    run("Himalayas RSS", async () => parseRss(await getText("https://himalayas.app/jobs/rss"), "Himalayas RSS")),
    ...remotiveCategories.map(category => run(`Remotive · ${category}`, async () => {
      const data = await getJson(`https://remotive.com/api/remote-jobs?limit=100&category=${encodeURIComponent(category)}`);
      return (data.jobs || []).map((x: any) => fromGeneric(x, "Remotive", { company: s(x.company_name) || "See original listing", location: s(x.candidate_required_location) || "Remote; confirm India eligibility on original listing", salary: s(x.salary) || extractSalary(s(x.description)) }));
    })),
    run("JSearch (LinkedIn / Indeed and other indexed listings)", async () => {
      const key = process.env.JSEARCH_API_KEY;
      if (!key) throw new Error("Not configured. Add JSEARCH_API_KEY in Netlify to enable indexed LinkedIn/Indeed and other job-board results.");
      const queries = [
        "remote customer support specialist India",
        "remote technical support SaaS customer success India",
        "remote fintech payments operations support India",
        "remote email chat support sales operations India"
      ];
      const batches = await Promise.all(queries.map(async query => {
        const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=1&num_pages=3&date_posted=week`;
        const r = await fetch(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" }, cache: "no-store", signal: AbortSignal.timeout(18000) });
        const body = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.slice(0, 100).replace(/\s+/g, " ")}`);
        let data: any; try { data = JSON.parse(body); } catch { throw new Error(`Non-JSON response: ${body.slice(0, 90)}`); }
        return (data.data || []).map((x: any) => {
          const salary = x.job_salary_currency && (x.job_min_salary || x.job_max_salary)
            ? `${x.job_salary_currency} ${x.job_min_salary ?? ""} - ${x.job_max_salary ?? ""} ${x.job_salary_period || ""}`.trim()
            : extractSalary(`${s(x.job_title)} ${s(x.job_description)}`);
          return fromGeneric({ id: x.job_id, title: x.job_title, company_name: x.employer_name, location: [x.job_city, x.job_state, x.job_country].filter(Boolean).join(", ") || (x.job_is_remote ? "Remote; verify eligible countries" : "Location not listed"), remote: x.job_is_remote, url: x.job_apply_link || x.job_google_link, description: x.job_description, salary, posted_at: x.job_posted_at_datetime_utc || x.job_posted_at_timestamp }, `JSearch · ${s(x.job_publisher) || "indexed board"}`);
        });
      }));
      return batches.flat();
    }),
    run("Greenhouse", async () => {
      const out: Job[] = [];
      for (const board of greenhouseBoards) {
        try {
          const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
          for (const x of data.jobs || []) out.push(fromGeneric({ ...x, company_name: board === "readdle70" ? "Readdle" : board, location: x.location?.name, description: x.content, created_at: x.updated_at }, `Greenhouse · ${board}`, { location: s(x.location?.name) || "Not specified; verify India eligibility" }));
        } catch (error) { errors.push(`Greenhouse (${board}): ${error instanceof Error ? error.message : "source error"}`); }
      }
      return out;
    }),
    run("Lever", async () => {
      const out: Job[] = [];
      for (const board of (process.env.LEVER_SITES || "").split(",").map(x => x.trim()).filter(Boolean)) {
        const data = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`);
        for (const x of Array.isArray(data) ? data : []) out.push(fromGeneric({ ...x, title: x.text, company_name: board, location: x.categories?.location, url: x.hostedUrl, description: `${s(x.description)} ${s(x.additional)}`, created_at: x.createdAt }, `Lever · ${board}`));
      }
      return out;
    })
  ];
  await Promise.all(tasks);
  const result = finalize(jobs);
  return { jobs: result, errors, successfulSources };
}
