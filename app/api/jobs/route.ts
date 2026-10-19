import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const d = db();
  if (!d) return NextResponse.json({ jobs: [], setupRequired: true, error: "Database not configured" }, { status: 503 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  // Supabase commonly caps returned rows; the UI requests sequential pages until exhausted.
  const pageSize = Math.min(1000, Math.max(1, Number(url.searchParams.get("pageSize") || 1000)));
  const status = url.searchParams.get("status");
  const from = (page - 1) * pageSize;
  let query = d.from("jobs").select("*", { count: "exact" });
  if (status && ["new", "saved", "applied", "interview", "rejected"].includes(status)) query = query.eq("status", status);
  const { data, error, count } = await query
    .order("posted_at", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message, jobs: [] }, { status: 500 });
  return NextResponse.json({ jobs: data || [], total: count ?? 0, page, pageSize, hasMore: from + (data?.length || 0) < (count || 0) });
}

export async function PATCH(r: Request) {
  const b = await r.json().catch(() => ({}));
  if (!b.id || !["new", "saved", "applied", "interview", "rejected"].includes(b.status))
    return NextResponse.json({ error: "Invalid id/status" }, { status: 400 });
  const d = db();
  if (!d) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { error } = await d.from("jobs").update({ status: b.status }).eq("id", b.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

/** Permanently remove a single listing or clear the current New feed when explicitly requested. */
export async function DELETE(r: Request) {
  const b = await r.json().catch(() => ({}));
  const d = db();
  if (!d) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (b.clearNew === true) {
    const { error, count } = await d.from("jobs").delete({ count: "exact" }).eq("status", "new");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? null });
  }
  if (typeof b.id !== "string" || !b.id) return NextResponse.json({ error: "Job id required" }, { status: 400 });
  const { error } = await d.from("jobs").delete().eq("id", b.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
