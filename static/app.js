(async function () {
  const cssHref = document.querySelector('link[href*="static/style.css"]').getAttribute('href');
  const v = (cssHref.match(/\?v=([^&]+)/) || [])[1] || '';
  const base = cssHref.replace(/static\/style\.css.*$/, '');
  const $ = id => document.getElementById(id);
  const usd = n => '$' + Math.floor(n + 0.5).toLocaleString('en-US');
  const pct = r => r == null ? '—' : r.toFixed(2) + '%';
  // Accept 350000, 350,000, 350,000.00, $350,000 — nothing else (a stray "." must not turn 350,000.00 into 35,000,000)
  const parseVal = value => { const raw = String(value ?? '').trim().replace(/^\$\s*/, ''); if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) return null; const n = Number(raw.replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
  const fmtInput = el => { const n = parseVal(el.value); if (n !== null) el.value = n.toLocaleString('en-US', { maximumFractionDigits: 2 }); };

  // county page: home value → estimate (unrounded rate from the data attribute)
  const sheet = document.querySelector('.sheet[data-rate]');
  if (sheet && $('val')) {
    const rate = parseFloat(sheet.dataset.rate); if (!rate) return;
    const val = $('val'), err = $('est-err');
    const paint = () => { const n = parseVal(val.value); err.hidden = n !== null || !val.value.trim(); if (n === null) { $('est-year').textContent = '—'; $('est-month').textContent = '—'; return; } $('est-year').textContent = usd(n * rate / 100); $('est-month').textContent = usd(n * rate / 100 / 12); };
    val.addEventListener('input', paint); val.addEventListener('blur', () => { fmtInput(val); paint(); });
    return;
  }

  // home: typeahead over counties + states
  const input = $('q'); if (!input) return;
  const out = $('result'), menu = $('q-menu'), val = $('val'), status = $('search-status');
  let IDX;
  input.disabled = true; status.hidden = false; status.textContent = 'Loading county search…';
  try { const r = await fetch(base + 'static/index.json?v=' + v); if (!r.ok) throw new Error('Search unavailable'); IDX = await r.json(); }
  catch (e) { status.textContent = 'County search is unavailable. Browse all states or reload this page.'; input.disabled = false; return; }
  input.disabled = false; status.hidden = true; status.textContent = '';
  const STATES = IDX.states;
  const norm = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const shortName = s => s.replace(/\b(county|parish|borough|municipality|municipio|census area|city and borough|planning region)\b/gi, '');
  const D = IDX.items.map(a => {
    const c = { name: a[0], st: a[1], slug: a[2], rate: a[3], taxLabel: a[4], homeLabel: a[5], pop: a[6], state: !a[2] };
    const names = [c.name, shortName(c.name)], suffixes = c.state ? ['', c.st] : ['', c.st, STATES[c.st] || ''];
    c.aliases = names.flatMap(n => suffixes.map(sfx => norm(n + ' ' + sfx)));
    if (c.state) c.aliases.push(norm(c.st));
    return c;
  });
  const [usRate] = IDX.us;
  function card(c) {
    const path = c.state ? `${c.st.toLowerCase()}/` : `${c.st.toLowerCase()}/${c.slug}/`;
    const hv = parseVal(val.value);
    const ratio = c.rate && usRate ? c.rate / usRate : null;
    const where = c.state ? 'State benchmark' : (STATES[c.st] || c.st);
    if (c.rate && hv) return `<section class="sheet quiet"><p class="sheet-label">${c.name}${c.state ? '' : ', ' + where} · planning estimate for a ${usd(hv)} home</p><div class="sheet-num"><span class="num">${usd(hv * c.rate / 100)}</span><span class="pct">/ year</span></div><p class="sheet-title">${usd(hv * c.rate / 100 / 12)} a month · ${pct(c.rate)} area benchmark</p><p class="sheet-text">Median annual tax ${c.taxLabel} · median home value ${c.homeLabel}. ${ratio > 1 ? 'Above' : 'Below'} the U.S. benchmark ${pct(usRate)}. Rough budget only — your bill depends on taxable value, districts and exemptions.</p><p class="sheet-actions"><a class="next" href="${base}${path}">${c.state ? 'All counties & due dates' : 'Details, due dates & calculator'}</a></p></section>`;
    const line = c.rate ? `Median annual tax ${c.taxLabel} · median home value ${c.homeLabel}. ${ratio > 1 ? 'Above' : 'Below'} the U.S. benchmark ${pct(usRate)} (${ratio.toFixed(2)}×). Add a home value above for an estimate.` : `Median annual tax ${c.taxLabel} · median home value ${c.homeLabel}. The Census reports a range here, so no precise rate or estimate.`;
    return `<section class="sheet quiet"><p class="sheet-label">${where}</p><div class="sheet-num"><span class="num${c.rate ? '' : ' small-num'}">${c.rate ? pct(c.rate) : 'Range only'}</span>${c.rate ? '<span class="pct">of home value</span>' : ''}</div><p class="sheet-title">${c.name}${c.state ? '' : ', ' + c.st}</p><p class="sheet-text">${line}</p><p class="sheet-actions"><a class="next" href="${base}${path}">${c.state ? 'All counties & due dates' : 'Details, due dates & calculator'}</a></p></section>`;
  }
  let items = [], active = -1, current = null;
  function setActive() { if (active >= 0 && items[active]) { input.setAttribute('aria-activedescendant', `q-option-${active}`); const el = $(`q-option-${active}`); if (el) el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant'); }
  function open(q) {
    const nq = norm(q);
    items = nq ? D.filter(c => c.aliases.some(a => a.includes(nq))).sort((a, b) => (b.state - a.state) || (b.pop || 0) - (a.pop || 0)).slice(0, 8) : [];
    menu.innerHTML = items.length ? items.map((c, i) => `<li role="option" id="q-option-${i}" data-i="${i}" ${i === active ? 'aria-selected="true"' : ''}>${c.name}${c.state ? '' : ', ' + c.st}<small class="muted"> ${pct(c.rate)}${c.state ? ' · state' : ''}</small></li>`).join('') : (nq ? '<li class="empty">No county by that name. Try "Cook, IL" or the state.</li>' : '<li class="empty">Type a county or state name.</li>');
    menu.hidden = false; input.setAttribute('aria-expanded', 'true'); setActive();
  }
  function close() { menu.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function leaveLanding() {
    const html = document.documentElement; if (!html.classList.contains('landing')) return;
    const stage = $('stage'), hero = stage.firstElementChild;
    const y0 = hero.getBoundingClientRect().top;
    html.classList.remove('landing');
    const dy = y0 - hero.getBoundingClientRect().top;
    if (dy > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stage.style.transition = 'none'; stage.style.transform = `translateY(${dy}px)`; void stage.offsetHeight;
      stage.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)'; stage.style.transform = 'translateY(0)';
      stage.addEventListener('transitionend', () => { stage.style.transition = ''; stage.style.transform = ''; }, { once: true });
    }
    if (window.__reveal) window.__reveal($('below'), true, 300);
  }
  // The answer itself appears at once; only the sections below it rise in.
  function show(html) { leaveLanding(); out.classList.remove('reveal', 'is-in'); out.innerHTML = html; }
  function choose(c) {
    current = c; input.value = c.name + (c.state ? '' : ', ' + c.st); close(); show(card(c)); localStorage.setItem('countytax.q', JSON.stringify([c.st, c.slug]));
    if (innerWidth < 900) setTimeout(() => out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
  }
  input.addEventListener('focus', () => { setTimeout(() => input.select(), 0); open(input.value); });
  input.addEventListener('input', () => { active = -1; open(input.value); });
  input.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); open(input.value); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); open(input.value); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = items[active >= 0 ? active : 0]; if (it) choose(it); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  menu.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { choose(items[+li.dataset.i]); e.preventDefault(); } });
  input.addEventListener('blur', () => setTimeout(close, 120));
  // Re-render on input only (a blur re-render would swallow the click on the result's own link)
  val.addEventListener('blur', () => fmtInput(val));
  val.addEventListener('input', () => { if (current) out.innerHTML = card(current); });
  const rem = JSON.parse(localStorage.getItem('countytax.q') || 'null');
  const remembered = rem && D.find(c => c.st === rem[0] && c.slug === rem[1]);
  if (remembered) { $('last-name').textContent = remembered.name + (remembered.state ? '' : ', ' + remembered.st); $('last').hidden = false; $('last').addEventListener('click', () => choose(remembered)); }
})();
