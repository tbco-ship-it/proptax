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
    const fromLink = parseVal(new URLSearchParams(location.hash.slice(1)).get('home'));  // home value carried over from the home page
    if (fromLink !== null) val.value = fromLink.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const paint = () => { const n = parseVal(val.value); err.hidden = n !== null || !val.value.trim(); val.setAttribute('aria-invalid', String(n === null && !!val.value.trim())); if (n === null) { $('est-year').textContent = '—'; $('est-month').textContent = '—'; return; } $('est-year').textContent = usd(n * rate / 100); $('est-month').textContent = usd(n * rate / 100 / 12); };
    val.addEventListener('input', paint); val.addEventListener('blur', () => { fmtInput(val); paint(); });
    paint();
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
    const c = { name: a[0], st: a[1], slug: a[2], rate: a[3], taxLabel: a[4], homeLabel: a[5], pop: a[6], rateStatus: a[7], state: !a[2] };
    const names = [c.name, shortName(c.name)], suffixes = c.state ? ['', c.st] : ['', c.st, STATES[c.st] || ''];
    c.aliases = names.flatMap(n => suffixes.map(sfx => norm(n + ' ' + sfx)));
    if (c.state) c.aliases.push(norm(c.st));
    return c;
  });
  const [usRate] = IDX.us;
  // same rule as build.py relative_to(): "About the same" when equal at the displayed precision
  const relativeTo = (rate, benchmark) => { const shown = n => Math.floor(n * 100 + 0.5); if (shown(rate) === shown(benchmark)) return 'About the same as'; return rate > benchmark ? 'Above' : 'Below'; };
  function card(c) {
    const path = c.state ? `${c.st.toLowerCase()}/` : `${c.st.toLowerCase()}/${c.slug}/`;
    const hv = parseVal(val.value);
    const ratio = c.rate && usRate ? c.rate / usRate : null;
    const where = c.state ? 'State benchmark' : (STATES[c.st] || c.st);
    const href = `${base}${path}${hv === null ? '' : '#home=' + encodeURIComponent(String(hv))}`;  // carry the typed home value into the detail page
    if (c.rate && hv) return `<section class="sheet quiet"><p class="sheet-label">${c.name}${c.state ? '' : ', ' + where} · planning estimate for a ${usd(hv)} home</p><div class="sheet-num"><span class="num">${usd(hv * c.rate / 100)}</span><span class="pct">/ year</span></div><p class="sheet-title">${usd(hv * c.rate / 100 / 12)} a month · ${pct(c.rate)} area benchmark</p><p class="sheet-text">Median annual tax ${c.taxLabel} · median home value ${c.homeLabel}. ${relativeTo(c.rate, usRate)} the U.S. benchmark ${pct(usRate)}. Rough budget only — your bill depends on taxable value, districts and exemptions.</p><p class="sheet-actions"><a class="next" href="${href}">${c.state ? 'All counties & due dates' : 'Details, due dates & calculator'}</a></p></section>`;
    const why = c.rateStatus === 'missing' ? 'The Census does not publish all figures needed to calculate this benchmark.' : 'The Census reports a range for at least one required figure, so an exact benchmark is unavailable.';
    const line = c.rate ? `Median annual tax ${c.taxLabel} · median home value ${c.homeLabel}. ${relativeTo(c.rate, usRate)} the U.S. benchmark ${pct(usRate)} (${ratio.toFixed(2)}×). Add a home value above for an estimate.` : `Median annual tax ${c.taxLabel} · median home value ${c.homeLabel}. ${why}`;
    return `<section class="sheet quiet"><p class="sheet-label">${where}</p><div class="sheet-num"><span class="num${c.rate ? '' : ' small-num'}">${c.rate ? pct(c.rate) : (c.rateStatus === 'missing' ? 'Not published' : 'Range only')}</span>${c.rate ? '<span class="pct">of home value</span>' : ''}</div><p class="sheet-title">${c.name}${c.state ? '' : ', ' + c.st}</p><p class="sheet-text">${line}</p><p class="sheet-actions"><a class="next" href="${href}">${c.state ? 'All counties & due dates' : 'Details, due dates & calculator'}</a></p></section>`;
  }
  let items = [], active = -1, current = null;
  function setActive() { if (active >= 0 && items[active]) { input.setAttribute('aria-activedescendant', `q-option-${active}`); const el = $(`q-option-${active}`); if (el) el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant'); }
  function open(q) {
    const nq = norm(q);
    // exact state code (AL, CO, IN, VA…) and exact/prefix alias matches outrank a bigger place that merely contains the letters
    const rank = c => (c.state && norm(c.st) === nq) ? 0 : c.aliases.some(a => a === nq) ? 1 : c.aliases.some(a => a.startsWith(nq)) ? 2 : 3;
    items = nq ? D.filter(c => c.aliases.some(a => a.includes(nq))).sort((a, b) => rank(a) - rank(b) || (b.state - a.state) || (b.pop || 0) - (a.pop || 0)).slice(0, 8) : [];
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
    // phone: only jump to the result when a home value is already in — otherwise the value field stays in reach
    if (innerWidth < 900 && parseVal(val.value) !== null) setTimeout(() => out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
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
  menu.addEventListener('mousedown', e => { if (e.target.closest('li[data-i]')) e.preventDefault(); });  // keep the input focused
  menu.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (!li) return; const it = items[+li.dataset.i]; if (it) choose(it); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  // Re-render on input only (a blur re-render would swallow the click on the result's own link)
  const valueError = $('value-error');
  val.addEventListener('blur', () => { fmtInput(val); const bad = val.value.trim() !== '' && parseVal(val.value) === null; val.setAttribute('aria-invalid', String(bad)); if (valueError) valueError.hidden = !bad; });
  val.addEventListener('input', () => { if (!val.value.trim() || parseVal(val.value) !== null) { val.setAttribute('aria-invalid', 'false'); if (valueError) valueError.hidden = true; } if (current) out.innerHTML = card(current); });
  const rem = JSON.parse(localStorage.getItem('countytax.q') || 'null');
  const remembered = rem && D.find(c => c.st === rem[0] && c.slug === rem[1]);
  if (remembered) { $('last-name').textContent = remembered.name + (remembered.state ? '' : ', ' + remembered.st); $('last').hidden = false; $('last').addEventListener('click', () => choose(remembered)); }
})();
