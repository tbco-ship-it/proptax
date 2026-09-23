// Embeddable estimator (/embed/). Same index.json and the same arithmetic as the home page card: value × benchmark rate.
(async function () {
  const base = document.currentScript.src.replace(/static\/embed\.js.*$/, '');
  const $ = id => document.getElementById(id);
  const usd = n => '$' + Math.floor(n + 0.5).toLocaleString('en-US');
  const parseVal = value => { const raw = String(value ?? '').trim().replace(/^\$\s*/, ''); if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) return null; const n = Number(raw.replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
  const st = $('st'), co = $('co'), val = $('val'), out = $('out'), by = $('by');
  let IDX;
  try { IDX = await (await fetch(base + 'static/index.json')).json(); } catch (e) { out.textContent = 'Data could not be loaded.'; return; }
  const items = IDX.items.map(a => ({ name: a[0], st: a[1], slug: a[2], rate: a[3] }));
  Object.entries(IDX.states).sort((a, b) => a[1].localeCompare(b[1])).forEach(([code, name]) => st.add(new Option(name, code)));
  function fillCounties() {
    co.innerHTML = '';
    if (!st.value) { co.add(new Option('Choose a state first', '')); co.disabled = true; return paint(); }
    co.add(new Option('Statewide benchmark', ''));
    items.filter(c => c.st === st.value && c.slug).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => co.add(new Option(c.name, c.slug)));
    co.disabled = false; paint();
  }
  function paint() {
    if (!st.value) { out.innerHTML = ''; by.href = base; return; }
    const c = items.find(x => x.st === st.value && x.slug === co.value) || items.find(x => x.st === st.value && !x.slug);
    const path = `${st.value.toLowerCase()}/${co.value ? co.value + '/' : ''}`;
    by.href = base + path;
    const hv = parseVal(val.value);
    if (!c || !c.rate) { out.innerHTML = '<span class="sub">The Census does not publish an exact benchmark for this area.</span>'; return; }
    if (hv === null) { out.innerHTML = `<div class="num">${c.rate.toFixed(2)}%</div><div class="sub">of home value per year · enter a home value</div>`; return; }
    out.innerHTML = `<div class="num">${usd(hv * c.rate / 100)} <span class="sub">/ year</span></div><div class="sub">${usd(hv * c.rate / 1200)} a month · ${c.rate.toFixed(2)}% benchmark · rough budget, not your bill</div>`;
  }
  st.addEventListener('change', fillCounties); co.addEventListener('change', paint); val.addEventListener('input', paint);
})();
