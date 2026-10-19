import { NextResponse } from "next/server";
import { collect } from "@/lib/collect";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(r: Request) {
  const cron = r.headers.get("user-agent")?.includes("vercel-cron/1.0");
  const secret = process.env.CRON_SECRET;
  const manual = r.method === "POST";
  if (!cron && (!secret || r.headers.get("authorization") !== `Bearer ${secret}`) && !manual) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d = db();
  if (!d) return NextResponse.json({ error: "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify, then redeploy." }, { status: 503 });

  try {
    const result = await collect();
    const errors = [...result.errors];
    let inserted = 0;

    // If every source failed, preserve the feed and report the failure. If sources worked but no jobs matched,
    // clear stale New entries so old/irrelevant jobs do not masquerade as fresh results.
    if (result.jobs.length === 0 && result.successfulSources === 0) {
      return NextResponse.json({ ok: false, fetched: 0, inserted: 0, errors: errors.slice(0, 20), message: "Sources failed or returned no usable data. Existing listings were kept; check source errors." }, { status: 502 });
    }

    // Replace the New feed on every successful collection. Preserve saved/applied/interview/rejected statuses.
    const { error: cleanupError } = await d.from("jobs").delete().eq("status", "new");
    if (cleanupError) errors.push(`Could not clear previous new listings: ${cleanupError.message}`);
    if (result.jobs.length === 0) {
      return NextResponse.json({ ok: true, fetched: 0, inserted: 0, successfulSources: result.successfulSources, errors: errors.slice(0, 20), message: "No matching jobs in the current source feeds. Stale New listings were cleared; tracked statuses were preserved." });
    }

    for (const j of result.jobs) {
      // Do not reset saved/applied/interview/rejected status for a previously tracked job.
      const { data: existing, error: lookupError } = await d.from("jobs").select("id").eq("id", j.id).maybeSingle();
      if (lookupError) { errors.push(`${j.source}: ${lookupError.message}`); continue; }
      if (existing) continue;
      const { error } = await d.from("jobs").insert(j);
      if (error) errors.push(`${j.source}: ${error.message}`);
      else inserted++;
    }

    const { count } = await d.from("jobs").select("*", { count: "exact", head: true });
    return NextResponse.json({
      ok: true, fetched: result.jobs.length, inserted, successfulSources: result.successfulSources,
      totalStored: count ?? null, sourcesWithErrors: errors.length,
      errors: errors.slice(0, 20),
      message: `Collected ${result.jobs.length} relevant jobs. Previous New listings were refreshed; tracked statuses were preserved.`
    });
  } catch (error) {
    console.error("Job collection failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown collector error" }, { status: 500 });
  }
}

export async function GET(r: Request) { return run(r); }
export async function POST(r: Request) { return run(r); }
