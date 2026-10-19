# Harsh AI Job Agent — Vercel starter

## Included
- Next.js dashboard with search, match score, saved/applied/interview/rejected statuses.
- Collectors for public Arbeitnow, Remotive and Remote OK feeds, plus optional Greenhouse and Lever company boards.
- Supabase persistence and URL deduplication.
- Manual Search now endpoint and a protected scheduled endpoint.
- Profile scoring tuned to remote India, Customer Support, FinTech Operations, Customer Success and SaaS Support; ₹45k/month target is a profile preference, not a reliable hard filter because many feeds omit salary.

## Deploy
1. Create a Supabase project; run `supabase/schema.sql` in SQL Editor.
2. Copy `.env.example` values into a local `.env.local` and later Vercel Environment Variables.
3. Use Node 20+, run `npm install`, `npm run dev`.
4. Push to GitHub and import the repository into Vercel.
5. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. Never expose the service role key in client code. Add optional comma-separated `GREENHOUSE_BOARDS` and `LEVER_SITES` board tokens.
6. Deploy to Production and click **Search jobs now**. Inspect Vercel Function logs if collection fails.

## Schedule
`vercel.json` is configured for 5 daily runs at 06:00, 10:00, 14:00, 18:00, and 22:00 IST (00:30, 04:30, 08:30, 12:30, 16:30 UTC). Vercel cron expressions use UTC. These five Vercel Cron Jobs require a plan that supports five daily executions (typically Pro); Vercel Hobby has a one-cron-run-per-day limit. If you stay on Hobby, use an external scheduler to call `GET /api/collect` at those five IST times with `Authorization: Bearer YOUR_CRON_SECRET`. Check current Vercel plan limits before deployment.

## Honest limitations
This is a deployable starter, not an already deployed agent. It does not crawl the entire internet and cannot guarantee every job. Public feeds can change, be delayed, rate-limit or omit pay/location details. LinkedIn and Indeed aren't directly scraped; don't bypass logins, CAPTCHA or anti-bot controls. Automatic application submission and email notifications are not implemented. Apply opens the employer/source page; manually update the application status. Add authentication before making the site public, because the basic starter is intended for a private deployment.


## Netlify free scheduled deployment (recommended alternative to Vercel Pro)
This ZIP includes five Netlify Scheduled Functions configured for 06:00, 10:00, 14:00, 18:00, and 22:00 IST (UTC cron: `30 0`, `30 4`, `30 8`, `30 12`, `30 16`). Netlify scheduled functions use UTC and are available on all pricing plans, subject to function/usage limits.

1. Import this repository into Netlify and deploy the Next.js app.
2. In Netlify Site configuration → Environment variables, set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (same secret used by `/api/collect`)
   - `SITE_URL` (your deployed site origin, e.g. `https://your-site.netlify.app`, no trailing slash)
   - optional `GREENHOUSE_BOARDS`, `LEVER_SITES`
3. Ensure these variables are available to both Functions and the build, then trigger a fresh deploy.
4. Check Netlify Functions logs for `collect-0600`, `collect-1000`, `collect-1400`, `collect-1800`, and `collect-2200`.
5. Keep the app private or add authentication before exposing it. Never put the Supabase service-role key in client-side variables.

Note: Scheduled functions trigger the app's `/api/collect` endpoint; if the app endpoint fails or is not configured, scheduled jobs will fail. Netlify free plan has monthly usage credits and function runtime limits, so monitor usage. This starter is not deployed automatically by creating this ZIP.


## Updated profile filtering and feed behavior
- Manual search now parses non-JSON/HTML responses safely and reports source-specific errors instead of failing with `Unexpected token '<'`.
- Only role-relevant titles scoring 70%+ are accepted; known posting dates older than seven days are excluded. Undated postings remain and should be verified at the original source.
- A successful collection refresh clears previous `new` entries before inserting fresh matches. Saved, applied, interview, and rejected records are preserved.
- Dashboard displays 25 jobs per page with Previous/Next controls. "Apply & mark applied" opens the original listing and moves the item to Applied immediately; this cannot verify that an employer's application form was actually submitted.
- Salary and India work eligibility are not reliably published by every public feed. Verify missing salary/location details on the original listing; this version does not claim to verify ₹45,000 in-hand for jobs whose feed has no salary data.


## Expanded job discovery update (October 2026)
- Public collectors include Arbeitnow, Remote OK, Remotive category queries, We Work Remotely RSS, Himalayas API/RSS, Jobicy tag feeds, plus configured Greenhouse and Lever boards.
- Optional JSearch/RapidAPI integration can index listings from providers such as LinkedIn/Indeed when `JSEARCH_API_KEY` is configured. Get the key from a provider account and check that provider's quotas/pricing; direct login-protected scraping is intentionally not used.
- The dashboard separates salary listings into USD, INR/CTC, and salary not listed, and includes per-job permanent delete. `Clear old New jobs` deletes only the New feed; Saved/Applied/Interview/Rejected are retained.
- Dashboard loads sequential database pages rather than relying on one large request. Manual search replaces the New feed when at least one source works; if every source fails, the existing feed is preserved and source errors are returned.
- Match score is a transparent heuristic based on role-title/description fit, not a promise of interview eligibility. Salary and country eligibility must be confirmed from the original employer page.
