export const profile = {
  experienceYears: 3.5,
  minimumMonthlyInHandINR: 45000,
  education: "Computer Science Diploma completed; no completed graduation claimed",
  titles: [
    "customer support", "customer service", "customer experience", "customer success",
    "technical support", "product support", "saas support", "application support",
    "email support", "chat support", "help desk", "service desk", "escalation specialist",
    "fintech operations", "financial support", "payments support", "payment operations",
    "banking operations", "fraud operations", "transaction support", "customer operations",
    "client support", "customer onboarding", "sales operations", "revenue operations",
    "account support", "inside sales", "sales development representative",
    "business development representative", "implementation specialist", "operations associate",
    "operations specialist", "operations coordinator", "crm operations", "account support"
  ],
  exclude: [
    "commission only", "unpaid", "internship", "on-site only", "onsite only",
    "software engineer", "frontend engineer", "front-end engineer", "backend engineer", "back-end engineer",
    "full stack engineer", "machine learning engineer", "ai engineer", "data scientist", "devops engineer",
    "site reliability engineer", "ios developer", "android developer", "director", "vice president",
    "chief customer officer", "head of customer success", "head of support", "support director",
    "senior manager", "regional manager", "engineering manager", "people manager"
  ]
};

const targetTitle = /customer support|customer service|customer experience|customer success|technical support|product support|saas support|application support|help ?desk|service desk|support specialist|support associate|support analyst|support representative|support agent|client support|client services|customer operations|customer onboarding|customer care|email support|chat support|escalation|fintech|financial operations|financial support|payment operations|payments support|banking operations|fraud operations|transaction support|account support|account management|sales operations|revenue operations|sales development representative|business development representative|inside sales|sales associate|crm operations|operations associate|operations specialist|operations coordinator|implementation specialist|onboarding specialist|technical account manager|customer success manager/i;
const technicalExclude = /\b(ai engineer|machine learning|ml engineer|data scientist|software engineer|frontend engineer|front-end engineer|backend engineer|back-end engineer|full[- ]stack|devops|site reliability|sre|cloud engineer|ios developer|android developer|qa automation|test automation|robotics|research scientist|quantitative researcher|embedded engineer)\b/i;

export function isRelevantTitle(title: string) {
  const t = (title || "").toLowerCase();
  if (profile.exclude.some(x => t.includes(x)) || technicalExclude.test(t)) return false;
  return targetTitle.test(t);
}

/** Role-fit heuristic; not an AI probability. Scores are only assigned to relevant target-domain roles. */
export function score(j: {title:string;description?:string|null;location?:string|null;remote?:boolean|null}) {
  const title = (j.title || "").toLowerCase();
  const description = (j.description || "").toLowerCase();
  const location = (j.location || "").toLowerCase();
  if (!isRelevantTitle(title)) return 0;
  let n = 66;
  if (/customer support|customer service|technical support|product support|email support|chat support|escalation|fintech|financial support|payments support/i.test(title)) n += 9;
  if (/l2|level 2|escalation|fintech|payments|saas|crm|ticketing|customer support|customer success|zendesk|zoho desk|freshdesk/i.test(description)) n += 7;
  if (/remote|india|worldwide|apac|asia/i.test(location)) n += 4;
  if (j.remote) n += 4;
  return Math.min(95, n);
}

export function salaryBucket(salary?: string | null) {
  if (!salary || !salary.trim()) return "unspecified" as const;
  const s = salary.toLowerCase();
  if (/\$|\busd\b|\bus\s*dollars?\b|\bdollars?\b|\bus\$/.test(s)) return "usd" as const;
  if (/₹|\binr\b|\brs\.?\b|\brupees?\b|\blpa\b|\blakh(?:s)?\b|\bctc\b/.test(s)) return "inr" as const;
  // Do not assume a currency if the feed only gives a bare numeric range.
  return "unspecified" as const;
}
