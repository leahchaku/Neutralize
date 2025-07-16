// File: popup.js
// Neutralize
// privacy-first, zero cloud calls • minimal UI • kind to the reader

/* Popup responsibilities:
   - Builds the little control center (chips, scan buttons)
   - Injects/contacts content.js to scan the active tab
   - Offers paste-text mode for quick drafts
   - Exports a tidy Markdown report
*/

const CATEGORIES = [
  { id: "gender", label: "Gendered" },
  { id: "race", label: "Race/Nationality" },
  { id: "age", label: "Age" },
  { id: "disability", label: "Disability" },
  { id: "religion", label: "Religion" },
  { id: "lgbtq", label: "LGBTQIA+" },
  { id: "socio", label: "Socioeconomic" },
  { id: "legal", label: "Employment/Legal" }
];

// Starter rules
const DEFAULT_RULES = [
  // GENDERED
  rule("gender", /\b(rockstar|ninja|dominant|aggressive|bossy|manpower)\b/gi,
    "Can perpetuate gender stereotypes or exclusionary tone.",
    "Use neutral, skill-based terms like “expert”, “high-performing”, “collaborative”, “workforce”.",
    "med"),
  rule("gender", /\b(his|him)\s*\/\s*(her|hers)\b|\b(he|she)\b(?!\/)/gi,
    "Gendered pronouns can exclude or distract.",
    "Use they/them or rewrite to avoid pronouns when possible.",
    "low"),

  // RACE / NATIONALITY
  rule("race", /\b(native\s+speaker\s+only|must\s+be\s+a\s+native\s+\w+\s+speaker)\b/gi,
    "Overly restrictive language can discriminate by nationality or background.",
    "Specify required proficiency levels (e.g., “C1 English proficiency”).",
    "med"),

  // AGE
  rule("age", /\b(young|digital\s+native|recent\s+grad\s+only|energetic\s+young)\b/gi,
    "May imply age preference and exclude qualified candidates.",
    "Focus on skills, not age (e.g., “proficient with modern tools”).",
    "med"),

  // DISABILITY / ABLEIST
  rule("disability", /\b(crazy|insane|lame|dumb|must\s+be\s+able-bodied)\b/gi,
    "Ableist or exclusionary terms can stigmatize and discriminate.",
    "Use precise, respectful language (e.g., “fast-paced”, “physically demanding task listed separately”).",
    "high"),

  // RELIGION
  rule("religion", /\b(practicing\s+christian|god-fearing|christian\s+values|must\s+attend\s+church)\b/gi,
    "Suggests religious preference or requirement, which can be discriminatory.",
    "Remove religious preference unless bona fide requirement; focus on job-relevant qualities.",
    "high"),

  // LGBTQIA+
  rule("lgbtq", /\b(no\s+(?:gay|lesbian|transgender|lgbt\w*)\s+applicants?)\b/gi,
    "Explicitly exclusionary and discriminatory language.",
    "Remove the exclusion; include inclusive language or an EEO statement.",
    "high"),

  // SOCIOECONOMIC
  rule("socio", /\b(must\s+own\s+a\s+car|must\s+live\s+in\s+a\s+safe\s+neighborhood)\b/gi,
    "Can unfairly exclude candidates based on socioeconomic status or location.",
    "Specify the actual requirement (e.g., “reliable commute to X” or remote-friendly alternatives).",
    "med"),

  // LEGAL RISK — Absolutes
  rule("legal", /\b(always|never|guaranteed|unlimited)\b/gi,
    "Absolutes may be misleading or create unintended warranties.",
    "Add appropriate qualifiers with clear conditions and limits.",
    "med"),

  // LEGAL RISK — Vagueness / Discretion
  rule("legal", /\b(at\s+our\s+sole\s+discretion|from\s+time\s+to\s+time)\b/gi,
    "Vague rights without limits can be unenforceable or unfair.",
    "Define specific criteria, timeframes, and notice requirements.",
    "med"),

  // LEGAL RISK — Arbitration / Class action waivers
  rule("legal", /\b(binding\s+arbitration|waive\s+your\s+right\s+to\s+class\s+action)\b/gi,
    "These clauses may limit user remedies and face enforceability scrutiny.",
    "Explain scope, opt-out, forum, fees, and provide conspicuous disclosure.",
    "high"),

  // LEGAL RISK — Unilateral changes
  rule("legal", /\b(we\s+can\s+change\s+terms\s+anytime\s+without\s+notice)\b/gi,
    "Unilateral change without notice is often problematic.",
    "Specify change process, notice, and user termination/cancellation rights.",
    "high"),

  // LEGAL RISK — Auto-renewal
  rule("legal", /\b(auto-?renew|automatic\s+renewal)\b/gi,
    "May require conspicuous disclosure and clear cancellation mechanisms.",
    "State renewal term, price changes, and how to cancel.",
    "med"),

  // LEGAL RISK — Indemnity
  rule("legal", /\b(indemnif(?:y|ication).+hold\s+harmless)\b/gi,
    "Overbroad indemnities can unfairly shift liability to users.",
    "Limit to specific, reasonable scenarios with mutual obligations.",
    "med"),

  // LEGAL RISK — Broad data consent
  rule("legal", /\b(for\s+any\s+purpose\s+we\s+deem\s+appropriate)\b/gi,
    "Overly broad consent may conflict with privacy expectations and laws.",
    "List specific purposes and retention periods; offer meaningful choices.",
    "high"),

  // LEGAL RISK — Choice of law / jurisdiction
  rule("legal", /\b(governed\s+by\s+the\s+laws\s+of\s+\w+).*(without\s+regard\s+to\s+conflicts?\s+of\s+law)?/gi,
    "Opaque or unfavorable jurisdiction terms can confuse users.",
    "Explain jurisdiction plainly and provide consumer-rights disclosures where required.",
    "low"),

  // LEGAL RISK — Disclaimers
  rule("legal", /\b(as\s+is|without\s+warranties?\s+of\s+any\s+kind)\b/gi,
    "Overbroad disclaimers may be restricted by consumer protection laws.",
    "Tailor disclaimers to applicable law and provide clear, conspicuous wording.",
    "med")
];

// Extra high-signal variants
DEFAULT_RULES.push(
  rule("legal", /\b(we\s+may\s+modify\s+these\s+terms\s+at\s+any\s+time)\b/gi,
    "Unbounded change rights can be unfair or unclear.",
    "State how changes are communicated, when they take effect, and cancellation options.",
    "high")
);
DEFAULT_RULES.push(
  rule("socio", /\b(must\s+(?:own|provide)\s+(?:a\s+)?(?:laptop|vehicle|car))\b/gi,
    "May exclude qualified folks without those resources.",
    "Clarify the true requirement (e.g., “access to a computer during work hours”).",
    "med")
);

function rule(category, re, why, suggestion, severity){
  return { category, reSrc: re.source, reFlags: re.flags, why, suggestion, severity };
}

// Grabby hands for DOM
const els = {
  chips: document.getElementById("chips"),
  results: document.getElementById("results"),
  summary: document.getElementById("summary"),
  scanPageBtn: document.getElementById("scanPageBtn"),
  pasteToggle: document.getElementById("pasteToggle"),
  pasteArea: document.getElementById("pasteArea"),
  pasteText: document.getElementById("pasteText"),
  scanTextBtn: document.getElementById("scanTextBtn"),
  exportBtn: document.getElementById("exportBtn"),
  copyBtn: document.getElementById("copyBtn")
};

let currentFindings = [];
let activeFilters = {};
