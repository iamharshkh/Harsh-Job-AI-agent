"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, ExternalLink, Sparkles, Send, CalendarCheck, Database, ChevronLeft, ChevronRight, Trash2, DollarSign, IndianRupee, CircleHelp } from "lucide-react";
import type { Job } from "@/lib/types";
import { salaryBucket } from "@/lib/profile";

const PAGE_SIZE = 25;
async function readResponse(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { const preview = text.replace(/\s+/g, " ").slice(0, 180); throw new Error(`Server returned non-JSON (HTTP ${response.status}). ${preview || "Empty response"}`); }
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("new");
  const [bucket, setBucket] = useState("all");
  const [sort, setSort] = useState("newest");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(1);

  async function load() {
    try {
      const all: Job[] = [];
      let currentPage = 1;
      let total = 0;
      do {
        const r = await fetch(`/api/jobs?page=${currentPage}&pageSize=1000`, { cache: "no-store" });
        const d = await readResponse(r);
        if (!r.ok) throw new Error(d.error || `Could not load jobs (HTTP ${r.status})`);
        if (!Array.isArray(d.jobs)) throw new Error("Jobs API response did not contain a jobs list.");
        all.push(...d.jobs);
        total = Number(d.total || 0);
        currentPage += 1;
        if (d.jobs.length === 0 || all.length >= total) break;
      } while (true);
      setJobs(all);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not load jobs."); }
  }
  useEffect(() => { void load(); }, []);

  async function search() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manual: true }) });
      const d = await readResponse(r);
      if (!r.ok) throw new Error(`${d.message || d.error || `Search failed (HTTP ${r.status}).`}${Array.isArray(d.errors) && d.errors.length ? ` Sources: ${d.errors.slice(0, 4).join(" | ")}` : ""}`);
      const sourceErrors = Array.isArray(d.errors) && d.errors.length ? ` Some sources failed: ${d.errors.slice(0, 4).join(" | ")}` : "";
      setMsg(`Search complete: ${d.fetched ?? 0} relevant jobs found; ${d.inserted ?? 0} new listings added. Saved/Applied records were preserved.${sourceErrors}`);
      await load(); setPage(1);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Search failed. Check Netlify Function logs."); }
    finally { setBusy(false); }
  }
  async function status(j: Job, s: string) {
    const previous = jobs;
    setJobs(a => a.map(x => x.id === j.id ? { ...x, status: s } : x));
    try {
      const r = await fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: j.id, status: s }) });
      const d = await readResponse(r); if (!r.ok) throw new Error(d.error || "Could not save job status.");
      if (s === "applied") setMsg("Moved to Applied. The original job page was opened; application submission itself is not verified.");
    } catch (e) { setJobs(previous); setMsg(e instanceof Error ? e.message : "Could not save status."); }
  }
  function apply(j: Job) { window.open(j.url, "_blank", "noopener,noreferrer"); void status(j, "applied"); }
  async function remove(j: Job) {
    if (!window.confirm(`Permanently delete “${j.title}” from this dashboard?`)) return;
    try {
      const r = await fetch("/api/jobs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: j.id }) });
      const d = await readResponse(r); if (!r.ok) throw new Error(d.error || "Could not delete this job.");
      setJobs(a => a.filter(x => x.id !== j.id)); setMsg("Job deleted from your dashboard.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not delete job."); }
  }
  async function clearNew() {
    if (!window.confirm("Delete every job currently in New? Saved, Applied and Interview jobs will remain.")) return;
    try {
      const r = await fetch("/api/jobs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearNew: true }) });
      const d = await readResponse(r); if (!r.ok) throw new Error(d.error || "Could not clear New jobs.");
      setJobs(a => a.filter(x => (x.status || "new") !== "new")); setPage(1); setMsg("Old New listings cleared. Click Search jobs now to collect a fresh feed.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not clear old jobs."); }
  }

  const count = (s: string) => jobs.filter(j => (j.status || "new") === s).length;
  const counts = useMemo(() => ({
    usd: jobs.filter(j => (tab === "all" || (j.status || "new") === tab) && salaryBucket(j.salary) === "usd").length,
    inr: jobs.filter(j => (tab === "all" || (j.status || "new") === tab) && salaryBucket(j.salary) === "inr").length,
    unspecified: jobs.filter(j => (tab === "all" || (j.status || "new") === tab) && salaryBucket(j.salary) === "unspecified").length,
  }), [jobs, tab]);
  const list = useMemo(() => jobs
    .filter(j => (`${j.title} ${j.company} ${j.location || ""} ${j.source} ${j.description || ""}`).toLowerCase().includes(q.toLowerCase()))
    .filter(j => tab === "all" ? true : (j.status || "new") === tab)
    .filter(j => bucket === "all" || salaryBucket(j.salary) === bucket)
    .sort((a, b) => sort === "newest"
      ? Date.parse(b.posted_at || b.discovered_at || "") - Date.parse(a.posted_at || a.discovered_at || "")
      : (b.match_score || 0) - (a.match_score || 0)), [jobs, q, tab, bucket, sort]);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const visible = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, tab, bucket, sort]);

  return <main className="app">
    <header className="top"><div className="brand"><div className="logo">H</div><div>
      <div className="eyebrow">Personal AI career workspace</div><h1>Harsh's Job Agent</h1>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>India-eligible remote · 3.5+ years · Support, FinTech, SaaS, Success & Operations · 70%+ role-fit</div>
    </div></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn" onClick={() => void load()}><RefreshCw size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Refresh</button>
      <button className="btn" onClick={() => void clearNew()}><Trash2 size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Clear old New jobs</button>
      <button className="btn primary" disabled={busy} onClick={() => void search()}><Search size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />{busy ? "Searching all sources…" : "Search jobs now"}</button>
    </div></header>

    <section className="stats">{[["New matching jobs", count("new"), Sparkles], ["Applied", count("applied"), Send], ["Interviews", count("interview"), CalendarCheck], ["Total stored", jobs.length, Database]].map(([label, n, Icon]: any) => <div className="stat" key={label}>
      <div className="label"><Icon size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />{label}</div><div className="value">{n}</div><div className="label">{label === "Total stored" ? "Across loaded source listings" : "Tracked in this workspace"}</div>
    </div>)}</section>

    <div className="layout"><section className="panel">
      <div className="head"><div><div className="eyebrow">Discovery feed</div><h2>Relevant jobs for your profile</h2></div><span className="pill">{list.length} results</span></div>
      <div className="filters"><input placeholder="Search role, company, keyword…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={tab} onChange={e => setTab(e.target.value)}><option value="new">New jobs</option><option value="all">All active jobs</option><option value="saved">Saved</option><option value="applied">Applied</option><option value="interview">Interview</option><option value="rejected">Rejected</option></select>
        <select value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="match">Best match</option></select>
      </div>
      <div className="salary-tabs" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, margin: "14px 0" }}>
        <button className={bucket === "usd" ? "btn primary" : "btn"} onClick={() => setBucket("usd")}><DollarSign size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />USD salary ({counts.usd})</button>
        <button className={bucket === "inr" ? "btn primary" : "btn"} onClick={() => setBucket("inr")}><IndianRupee size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />INR / CTC ({counts.inr})</button>
        <button className={bucket === "unspecified" ? "btn primary" : "btn"} onClick={() => setBucket("unspecified")}><CircleHelp size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />Other currency / not listed ({counts.unspecified})</button>
        <button className={bucket === "all" ? "btn primary" : "btn"} onClick={() => setBucket("all")}>All salary types</button>
      </div>
      {msg && <div className="notice">{msg}</div>}
      <div className="jobs">{visible.length ? visible.map(j => <article className="job" key={j.id}>
        <div className="jobtop"><div><div className="company">{j.company}</div><h3>{j.title}</h3>
          <div className="meta"><span>{j.location || "Location not listed"}</span><span>{j.source}</span><span>{j.salary || "Salary not listed"}</span>{j.posted_at && <span>Posted {new Date(j.posted_at).toLocaleDateString()}</span>}</div>
        </div><div className="score">{j.match_score || 0}% role fit</div></div>
        {(j.tags || []).slice(0, 4).map(t => <span className="pill" key={t}>{t}</span>)}
        <span className="pill">{j.remote ? "Remote feed — verify India eligibility" : "Remote eligibility needs verification"}</span>
        <div className="job-actions">
          {(j.status === "new" || !j.status) ? <button className="small apply" onClick={() => apply(j)}>Apply & mark applied <ExternalLink size={12} style={{ verticalAlign: "middle" }} /></button> : <a className="small apply" href={j.url} target="_blank" rel="noreferrer">Open original listing <ExternalLink size={12} style={{ verticalAlign: "middle" }} /></a>}
          <button className="small" onClick={() => void status(j, "saved")}>Save</button>
          <select value={j.status || "new"} onChange={e => void status(j, e.target.value)}><option value="new">New</option><option value="saved">Saved</option><option value="applied">Applied</option><option value="interview">Interview</option><option value="rejected">Rejected</option></select>
          <button className="small" onClick={() => void remove(j)} title="Permanently delete this listing"><Trash2 size={13} /> Delete</button>
        </div>
      </article>) : <div className="empty">No matching jobs in this salary section. Try another salary tab or click Search jobs now.</div>}</div>
      <div className="job-actions" style={{ justifyContent: "space-between", padding: "16px 0" }}><span className="label">Page {page} of {totalPages} · {list.length} listings</span><div style={{ display: "flex", gap: 8 }}>
        <button className="small" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={14} /> Previous</button>
        <button className="small" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next <ChevronRight size={14} /></button>
      </div></div>
      <div className="footer">Sources are public APIs, RSS feeds and configured company ATS boards. Private/login-protected job sites are not scraped by bypassing their access controls. 70% is a rule-based role-fit score, not a hiring probability; verify salary and India eligibility on the original listing.</div>
    </section>

    <aside className="side"><section className="panel"><div className="eyebrow">Your target</div><h2>Profile filters</h2>
      {[ ["Experience", "3.5+ years"], ["Education", "Computer Science Diploma completed"], ["Location", "Fully remote from India"], ["Pay target", "₹45,000+ monthly in-hand equivalent"], ["Employment", "Permanent/full-time preferred"], ["Roles", "Support / FinTech / SaaS / Success / Sales Ops"], ["Minimum match", "70% role fit"] ].map(([a, b]) => <div className="row" key={a}><span>{a}</span><strong>{b}</strong></div>)}
    </section><section className="panel"><div className="eyebrow">Active collectors</div><h2>Job sources</h2>
      {["Arbeitnow public API", "Remotive category feeds", "Remote OK API", "We Work Remotely RSS categories", "Himalayas API + RSS", "Jobicy tag feeds", "Optional JSearch index (LinkedIn/Indeed when API key configured)", "Readdle / custom Greenhouse boards", "Configured Lever boards"].map(x => <div className="row" key={x}><span>● {x}</span><span style={{ color: "var(--muted)" }}>API / Feed</span></div>)}
      <p className="footer">LinkedIn and Indeed results can be enabled through a licensed JSearch/RapidAPI key in Netlify (JSEARCH_API_KEY); coverage depends on the provider plan. This app does not bypass login or anti-bot controls. Add supported company ATS board tokens in Netlify environment variables.</p>
    </section></aside></div>
  </main>;
}
