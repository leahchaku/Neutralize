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

leahBoot();

async function leahBoot(){
  els.chips.innerHTML = "";
  for (const c of CATEGORIES){
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.setAttribute("role", "switch");
    chip.setAttribute("aria-checked", "true");
    chip.dataset.id = c.id;
    chip.dataset.on = "true";
    chip.textContent = c.label;
    chip.addEventListener("click", () => flipChip(chip));
    els.chips.appendChild(chip);
    activeFilters[c.id] = true;
  }

  const saved = await chrome.storage.local.get(["biasguard_filters"]);
  if (saved.biasguard_filters){
    for (const [k,v] of Object.entries(saved.biasguard_filters)){
      const chip = [...els.chips.children].find(x => x.dataset.id === k);
      if (chip){
        chip.dataset.on = v ? "true" : "false";
        chip.setAttribute("aria-checked", v ? "true" : "false");
      }
      activeFilters[k] = !!v;
    }
  } else {
    await chrome.storage.local.set({ biasguard_filters: activeFilters });
  }

  els.pasteToggle.addEventListener("change", () => {
    const on = els.pasteToggle.checked;
    els.pasteArea.hidden = !on;
  });

  els.scanPageBtn.addEventListener("click", scanThisPage);
  els.scanTextBtn.addEventListener("click", scanPastedDraft);
  els.exportBtn.addEventListener("click", exportAsMarkdown);
  els.pasteText.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") scanPastedDraft();
  });
  if (els.copyBtn){ els.copyBtn.addEventListener("click", copyMarkdown); }

  refreshSummary(null);
}

function flipChip(chip){
  const on = chip.dataset.on !== "true";
  chip.dataset.on = on ? "true" : "false";
  chip.setAttribute("aria-checked", on ? "true" : "false");
  activeFilters[chip.dataset.id] = on;
  chrome.storage.local.set({ biasguard_filters: activeFilters });
}

async function currentTabId(){ const [tab] = await chrome.tabs.query({active:true, currentWindow:true}); return tab?.id; }
function pickRules(){ return DEFAULT_RULES.filter(r => activeFilters[r.category]); }

async function scanThisPage(){
  const tabId = await currentTabId();
  if (!tabId) return;
  try{ await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); }catch(e){ console.warn("content.js injection note:", e); }
  const rules = pickRules();
  const findings = await chrome.tabs.sendMessage(tabId, { type: "biasguard_scan", rules }).catch(()=>[]);
  currentFindings = findings || [];
  paintResults(currentFindings, /*fromPage*/true);
}
