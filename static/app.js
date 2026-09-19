(async function () {
  const cssHref = document.querySelector('link[href*="static/style.css"]').getAttribute('href');
  const v = (cssHref.match(/\?v=([^&]+)/) || [])[1] || '';
  const base = cssHref.replace(/static\/style\.css.*$/, '');
  const $ = id => document.getElementById(id);
  const usd = n => '$' + Math.round(n).toLocaleString('en-US');
  const pct = r => r == null ? '—' : r.toFixed(2) + '%';
  const parseVal = s => { const n = parseInt((s || '').replace(/[^\d]/g, ''), 10); return n > 0 ? n : null; };
  const fmtInput = el => { const n = parseVal(el.value); if (n) el.value = n.toLocaleString('en-US'); };

  // county page: home value → estimate
  const sheet = document.querySelector('.sheet[data-rate]');
  if (sheet && $('val')) {
    const rate = parseFloat(sheet.dataset.rate);
    const val = $('val');
    const paint = () => { const n = parseVal(val.value) || parseVal(val.placeholder); $('est-year').textContent = usd(n * rate / 100); $('est-month').textContent = usd(n * rate / 100 / 12); };
    val.addEventListener('input', paint); val.addEventListener('blur', () => { fmtInput(val); paint(); });
    return;
  }

  // home: typeahead over counties + states
  const input = $('q'); if (!input) return;
  const IDX = await (await fetch(base + 'static/index.json?v=' + v)).json();
  const D = IDX.items.map(a => ({ name: a[0], st: a[1], slug: a[2], rate: a[3], tax: a[4], home: a[5], pop: a[6], state: !a[2] }));
  const [usRate, usTax, usHome] = IDX.us;
  const out = $('result'), menu = $('q-menu'), val = $('val');
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const STATES = {}; D.filter(x => x.state).forEach(x => STATES[x.st] = x.name);
  function card(c) {
    const path = c.state ? `${c.st.toLowerCase()}/` : `${c.st.toLowerCase()}/${c.slug}/`;
    const hv = parseVal(val.value);
    const ratio = c.rate && usRate ? c.rate / usRate : null;
    const cls = ratio == null ? 'quiet' : ratio >= 1.5 ? 'severe' : ratio > 1.1 ? 'mild' : 'balanced';
    const est = c.rate && hv ? `<p class="sheet-text">On a ${usd(hv)} home: <b>${usd(hv * c.rate / 100)}</b> a year, ${usd(hv * c.rate / 100 / 12)} a month at the median rate.</p>` : '';
    const line = c.rate ? `Median bill ${usd(c.tax)}${c.tax <= 200 ? ' or less' : ''} on a ${usd(c.home)} home. ${ratio > 1 ? 'Higher' : 'Lower'} than the U.S. median ${pct(usRate)} (${ratio.toFixed(2)}×).` : 'Census does not publish a reliable median for this county.';
    return `<section class="sheet ${cls}"><p class="sheet-label">${c.state ? 'State median' : STATES[c.st] || c.st}</p><div class="sheet-num"><span class="num">${pct(c.rate)}</span><span class="pct">effective</span></div><p class="sheet-title">${c.name}${c.state ? '' : ', ' + c.st}</p><p class="sheet-text">${line}</p>${est}<p class="sheet-actions"><a class="next" href="${base}${path}">${c.state ? 'All counties & due dates' : 'Details, due dates & calculator'}</a></p></section>`;
  }
  let items = [], active = -1, current = null;
  function open(q) {
    const nq = norm(q);
    items = nq ? D.filter(c => norm(c.name).includes(nq) || (!c.state && norm(c.name + c.st).includes(nq)) || (c.state && norm(c.st) === nq)).sort((a, b) => (b.state - a.state) || (b.pop || 0) - (a.pop || 0)).slice(0, 8) : [];
    menu.innerHTML = items.length ? items.map((c, i) => `<li role="option" data-i="${i}" ${i === active ? 'aria-selected="true"' : ''}>${c.name}${c.state ? '' : ', ' + c.st}<small class="muted"> ${pct(c.rate)}${c.state ? ' · state' : ''}</small></li>`).join('') : (nq ? '<li class="empty">No county by that name. Try the state.</li>' : '<li class="empty">Type a county or state name.</li>');
    menu.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function close() { menu.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); }
  function leaveLanding() {
    const html = document.documentElement; if (!html.classList.contains('landing')) return;
    const stage = $('stage'), hero = stage.firstElementChild;
    const y0 = hero.getBoundingClientRect().top;
    html.classList.remove('landing');
    const dy = y0 - hero.getBoundingClientRect().top;
    if (dy > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stage.style.transition = 'none'; stage.style.transform = `translateY(${dy}px)`; void stage.offsetHeight;
      stage.style.transition = 'transform 1s cubic-bezier(.16,1,.3,1)'; stage.style.transform = 'translateY(0)';
      stage.addEventListener('transitionend', () => { stage.style.transition = ''; stage.style.transform = ''; }, { once: true });
    }
    if (window.__reveal) window.__reveal($('below'), true, 500);
  }
  function show(html) {
    leaveLanding(); out.innerHTML = html;
    out.classList.remove('is-in'); out.classList.add('reveal');
    let i = 0; out.querySelectorAll(':scope > *').forEach(c => { [c, ...c.children].forEach(el => { el.classList.add('rv'); el.style.setProperty('--d', (i++ * 90) + 'ms'); }); });
    void out.offsetHeight; out.classList.add('is-in');
  }
  function choose(c) { current = c; input.value = c.name + (c.state ? '' : ', ' + c.st); close(); show(card(c)); localStorage.setItem('countytax.q', JSON.stringify([c.st, c.slug])); }
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
  val.addEventListener('blur', () => { fmtInput(val); if (current) out.innerHTML = card(current); });
  val.addEventListener('input', () => { if (current) out.innerHTML = card(current); });
  const rem = JSON.parse(localStorage.getItem('countytax.q') || 'null');
  const remembered = rem && D.find(c => c.st === rem[0] && c.slug === rem[1]);
  if (remembered) { $('last-name').textContent = remembered.name + (remembered.state ? '' : ', ' + remembered.st); $('last').hidden = false; $('last').addEventListener('click', () => choose(remembered)); }
})();
