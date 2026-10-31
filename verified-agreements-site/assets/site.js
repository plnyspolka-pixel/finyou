(() => {
  'use strict';
  const textEl = document.getElementById('site-text');
  const copyText = textEl ? JSON.parse(textEl.textContent) : {};
  const codeSamples = {
    rest: `# Example only · replace api.example.com with your live backend\ncurl -X POST https://api.example.com/v1/signing-policy/evaluate \\\n  -H "Authorization: Bearer $VA_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '{\n    "jurisdiction": "PL",\n    "document_type": "business_loan",\n    "party_context": "b2b"\n  }'`,
    mcp: `// Example MCP client configuration\n{\n  "mcpServers": {\n    "verified-agreements": {\n      "url": "https://api.example.com/mcp",\n      "headers": {\n        "Authorization": "Bearer YOUR_API_KEY"\n      }\n    }\n  }\n}\n\n// Tool: evaluate_signing_policy\n// Then: create_envelope, send_envelope…`
  };
  const codeEl = document.getElementById('code-view');
  let active = 'rest';
  if (codeEl) codeEl.textContent = codeSamples[active];
  document.querySelectorAll('[data-code]').forEach(button => {
    button.addEventListener('click', () => {
      active = button.dataset.code;
      codeEl.textContent = codeSamples[active];
      document.querySelectorAll('[data-code]').forEach(b => {
        const selected = b.dataset.code === active;
        b.classList.toggle('active', selected);
        b.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    });
  });
  const copyBtn = document.getElementById('copy-code');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codeSamples[active]);
      const prior = copyBtn.innerHTML;
      copyBtn.textContent = copyText.copied || 'Copied!';
      setTimeout(() => { copyBtn.innerHTML = prior; }, 1500);
    } catch (_) {
      // Clipboard is optional; select text if browser is blocking access.
      const selection = window.getSelection();
      if (selection && codeEl) {
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });
  const lang = document.getElementById('language');
  if (lang) lang.addEventListener('change', () => { location.href = lang.value; });
  const nav = document.getElementById('main-nav');
  const menu = document.getElementById('mobile-nav-button');
  if (nav && menu) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
    }));
  }
  const modal = document.getElementById('demo-modal');
  const stepTitle = document.getElementById('demo-stage-title');
  const stepText = document.getElementById('demo-stage-text');
  const stepNumber = document.getElementById('demo-number');
  const progress = document.querySelectorAll('#demo-progress i');
  const next = document.getElementById('demo-next');
  const close = document.getElementById('demo-close');
  let step = 0;
  let priorFocus = null;
  const steps = copyText.demo_steps || [];
  const render = () => {
    const item = steps[step];
    if (!item) return;
    stepTitle.textContent = item[0];
    stepText.textContent = item[1];
    stepNumber.textContent = `${step + 1} / ${steps.length}`;
    progress.forEach((bar, i) => bar.classList.toggle('active', i <= step));
    next.firstChild.textContent = step === steps.length - 1 ? (copyText.demo_done || 'Close') + ' ' : (copyText.demo_next || 'Next') + ' ';
  };
  const dismiss = () => {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    priorFocus?.focus?.();
  };
  const open = () => {
    if (!modal || !steps.length) return;
    priorFocus = document.activeElement;
    step = 0;
    render();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    next?.focus();
  };
  document.querySelectorAll('[data-open-demo]').forEach(el => el.addEventListener('click', open));
  next?.addEventListener('click', () => {
    if (step === steps.length - 1) dismiss();
    else { step += 1; render(); }
  });
  close?.addEventListener('click', dismiss);
  modal?.addEventListener('click', e => { if (e.target === modal) dismiss(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal?.classList.contains('open')) dismiss(); });
})();
