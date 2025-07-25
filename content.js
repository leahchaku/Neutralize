// File: content.js
// Neutralize — content script
// tiny highlighter, friendly tooltip, no DOM drama

(() => {
  if (window.__biasguard_loaded) return; // be a good guest: only boot once
  window.__biasguard_loaded = true;

  // --- Ultra-light style injection for highlights + tooltip
  const STYLE_ID = "biasguard-style";
  if (!document.getElementById(STYLE_ID)){
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      .biasguard-highlight{
        text-decoration: underline dotted #E11D48;
        text-underline-offset: 2px;
        cursor: help;
        background: transparent;
      }
      .biasguard-tooltip{
        position: fixed; z-index: 2147483647; max-width: 320px;
        background: #16181D; color: #ECEFF4; border:1px solid #2a2f39;
        border-radius: 10px; padding: 8px 10px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
        font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif;
        pointer-events: none; transform: translate(-50%, -110%); opacity: 0; transition: opacity .08s ease;
      }
      .biasguard-tooltip.show{ opacity: 1; }
      .biasguard-flash{ animation: biasguardFlash 1.2s ease; }
      @keyframes biasguardFlash{ 0%{background:#2a0f16} 100%{background:transparent} }
    `;
    document.documentElement.appendChild(st);
  }

  let tooltipEl = null;
  function ensureTip(){
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "biasguard-tooltip";
    document.documentElement.appendChild(tooltipEl);
    return tooltipEl;
  }

  function visibleNode(node){
    const el = node.parentElement;
    if (!el) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Walk only reader-ish text
  function walkReadableTextNodes(root){
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (/(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA|INPUT|SELECT|SVG)/.test(tag)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let cur; while((cur = tw.nextNode())) nodes.push(cur);
    return nodes;
  }

  // Clean up any existing highlights if we re-scan
  function wipeHighlights(){
    document.querySelectorAll("span.biasguard-highlight").forEach(span => {
      const txt = document.createTextNode(span.textContent);
      span.replaceWith(txt);
    });
    if (tooltipEl) tooltipEl.classList.remove("show");
  }

  function bindTooltip(span, data){
    span.addEventListener("mouseenter", ()=>{
      const tip = ensureTip();
      tip.innerHTML = `<strong>Neutralize</strong> • ${safeHtml(capFirst(data.category))} • ${safeHtml(data.severity||"low")}<br><em>Why:</em> ${safeHtml(data.why)}<br><em>Try:</em> ${safeHtml(data.suggestion)}`;
      const r = span.getBoundingClientRect();
      tip.style.left = (r.left + r.width/2) + "px";
      tip.style.top = (r.top + window.scrollY - 8) + "px";
      tip.classList.add("show");
    });
    span.addEventListener("mouseleave", ()=> { if (tooltipEl) tooltipEl.classList.remove("show"); });
    span.addEventListener("focus",  () => span.dispatchEvent(new Event("mouseenter")));
    span.addEventListener("blur",   () => span.dispatchEvent(new Event("mouseleave")));
  }

  function capFirst(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
  function safeHtml(s){ return (s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function contextSnippet(full, start, end, pad=80){
    const s = Math.max(0, start - pad);
    const e = Math.min(full.length, end + pad);
    let snip = full.slice(s, e).replace(/\s+/g,' ').trim();
    if (s>0) snip = "…" + snip;
    if (e<full.length) snip = snip + "…";
    return snip;
  }

  function compileRegex(r){
    try { return new RegExp(r.reSrc, r.reFlags); } catch(e){ return null; }
  }

  // Highlight matches inside a single text node
  function sprinkleHighlights(node, matches, meta){
    // reverse order so offsets stay stable as we wrap spans
    matches.sort((a,b)=> b.index - a.index);
    let created = [];
    for (const m of matches){
      const range = node.ownerDocument.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const span = node.ownerDocument.createElement("span");
      const id = "bg-" + (++window.__bg_counter);
      span.className = "biasguard-highlight";
      span.setAttribute("role", "note");
      span.setAttribute("tabindex", "0");
      span.setAttribute("aria-label", `${meta.category} issue: ${meta.suggestion}`);
      span.dataset.bgId = id;
      span.textContent = range.toString();
      range.deleteContents();
      range.insertNode(span);
      bindTooltip(span, meta);
      created.push({ span, id });
    }
    return created;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "biasguard_scan"){
      const rules = (msg.rules || []).map(r => ({...r, re: compileRegex(r)})).filter(r=>r.re);
      window.__bg_counter = 0;
      wipeHighlights();

      const MAX_NODE_CHARS = 5000; // Skip ultra-long text nodes
      const findings = [];
      const nodes = walkReadableTextNodes(document.body).filter(visibleNode);
      for (const node of nodes){
        const text = node.nodeValue;
        if (text.length > MAX_NODE_CHARS) continue; // be kind to the page
        let nodeMatches = [];
        for (const r of rules){
          r.re.lastIndex = 0;
          let m;
          while ((m = r.re.exec(text)) !== null){
            nodeMatches.push({ m, rule: r });
            if (!r.re.global) break;
          }
        }

        if (!nodeMatches.length) continue;

        // avoid double-highlighting overlapping ranges in the same node
        nodeMatches.sort((a,b)=> a.m.index - b.m.index);
        const filtered = [];
        let lastEnd = -1;
        for (const nm of nodeMatches){
          const idx = nm.m.index, len = nm.m[0].length;
          if (idx < lastEnd) continue;
          filtered.push(nm);
          lastEnd = idx + len;
        }

        // highlight then record
        const created = sprinkleHighlights(node, filtered.map(nm=>nm.m), { /* meta placeholder; per-match below */ });
        let ci = 0;
        for (const nm of filtered){
          const { rule } = nm;
          const matchText = nm.m[0];
          const start = nm.m.index, end = start + matchText.length;
          const snippet = contextSnippet(text, start, end);
          const { id } = created[ci++] || {};
          findings.push({
            text: matchText,
            category: rule.category,
            why: rule.why,
            suggestion: rule.suggestion,
            severity: rule.severity,
            snippet,
            highlightId: id || null
          });
          if (id){
            const span = document.querySelector(`span.biasguard-highlight[data-bg-id="${id}"]`);
            if (span){
              bindTooltip(span, {
                category: rule.category, why: rule.why, suggestion: rule.suggestion, severity: rule.severity
              });
            }
          }
        }
      }

      sendResponse(findings);
      return true;
    }

    if (msg?.type === "biasguard_scrollTo"){
      const el = document.querySelector(`span.biasguard-highlight[data-bg-id="${msg.id}"]`);
      if (el){
        el.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });
        el.classList.add("biasguard-flash");
        setTimeout(()=> el.classList.remove("biasguard-flash"), 1200);
      }
    }
  });
})();
