// Scheduled collector: 18:00 IST (cron is UTC; IST = UTC+05:30).
// Configure SITE_URL and CRON_SECRET in Netlify environment variables.
export default async () => {
  const base = process.env.SITE_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("Missing SITE_URL or CRON_SECRET");
    return;
  }
  const response = await fetch(`${base}/api/collect`, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` }
  });
  const body = await response.text();
  if (!response.ok) {
    console.error("Collector failed", response.status, body);
    throw new Error(`Collector failed with HTTP ${response.status}`);
  }
  console.log("18:00 IST collector result:", body);
};
export const config = { schedule: "30 12 * * *" };
