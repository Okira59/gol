"use strict";
const $ = (s) => document.querySelector(s);
let ALL = [], VIEW = [];
const state = { ustLine: "2.5", iyLine: "1.5", iymsT: "12", ustGroup: "line", iyGroup: "line", iymsGroup: "1", listN: 200, skorId: null, skorBand: "all" };

const EDGES = {
  fav: [1, 1.25, 1.4, 1.55, 1.7, 1.9, 2.2, 2.6, 99],
  "1": [1, 1.3, 1.5, 1.7, 2.0, 2.4, 3.0, 4.0, 6.0, 99],
  "2": [1, 1.3, 1.5, 1.7, 2.0, 2.4, 3.0, 4.0, 6.0, 99],
  X: [1, 2.9, 3.2, 3.5, 3.8, 4.3, 5.0, 99],
  "o1.5": [1, 1.15, 1.22, 1.3, 1.4, 1.55, 1.75, 99],
  "o2.5": [1, 1.4, 1.6, 1.8, 2.0, 2.3, 2.7, 3.5, 99],
  "o3.5": [1, 1.8, 2.2, 2.6, 3.0, 3.6, 4.5, 6, 99],
  "o4.5": [1, 2.6, 3.2, 4, 5, 6.5, 8, 11, 99],
  "o5.5": [1, 4, 5.5, 7, 9, 12, 16, 999],
  "io0.5": [1, 1.2, 1.3, 1.4, 1.55, 1.75, 2, 99],
  "io1.5": [1, 1.9, 2.2, 2.5, 2.8, 3.2, 3.8, 99],
  "io2.5": [1, 3.5, 4.5, 5.5, 7, 9, 12, 99],
  hf12: [1, 12, 18, 24, 30, 40, 60, 999],
  hf21: [1, 12, 18, 24, 30, 40, 60, 999],
  kgv: [1, 1.5, 1.65, 1.8, 2.0, 2.3, 99],
};
const ONAME = {
  fav: "Favori oranı (MS 1 veya 2'nin düşüğü)", "1": "MS 1 oranı", X: "MS X oranı", "2": "MS 2 oranı",
  "o1.5": "1.5 Üst oranı", "o2.5": "2.5 Üst oranı", "o3.5": "3.5 Üst oranı", "o4.5": "4.5 Üst oranı", "o5.5": "5.5 Üst oranı",
  "io0.5": "İY 0.5 Üst oranı", "io1.5": "İY 1.5 Üst oranı", "io2.5": "İY 2.5 Üst oranı",
  hf12: "İY/MS 1/2 oranı", hf21: "İY/MS 2/1 oranı", kgv: "KG Var oranı",
};

// ---------- yardımcılar ----------
const ot = () => +$("#f-ot").value;
function odd(m, k) {
  if (k === "fav") { const a = odd(m, "1"), b = odd(m, "2"); return a && b ? Math.min(a, b) : null; }
  const v = m.odds[k]; if (!v) return null;
  return v[ot()] || null;
}
const cls = (m, k) => (m.odds[k] ? m.odds[k][0] : null);
const opn = (m, k) => (m.odds[k] ? m.odds[k][1] : null);
const pct = (a, b) => (b ? (100 * a / b) : null);
const f1 = (x) => (x == null ? "-" : x.toFixed(1));
const f2 = (x) => (x == null ? "-" : x.toFixed(2));
const tot = (m) => m.fh + m.fa;
const htTot = (m) => (m.hh == null ? null : m.hh + m.ha);
const htft = (m) => {
  if (m.hh == null) return null;
  const r = (a, b) => (a > b ? "1" : a < b ? "2" : "0");
  return r(m.hh, m.ha) + r(m.fh, m.fa);
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function bucketLabel(e, i) { const lo = e[i], hi = e[i + 1]; return hi >= 99 ? `${f2(lo)} +` : `${f2(lo)} - ${f2(hi - 0.01)}`; }
// renk: genel ortalamaya göre (ortalama = sarı, üstü yeşil, altı kırmızı)
function heat(p, base) {
  if (p == null || !base) return "";
  const h = Math.max(0, Math.min(120, 60 + (p / base - 1) * 120));
  return `style="color:hsl(${h},75%,60%)"`;
}
function baseRate(list, target) { let n = 0, k = 0; for (const m of list) { const t = target(m); if (t == null) continue; n++; if (t) k++; } return pct(k, n); }
function diffCell(d) { return d == null ? "<td>-</td>" : `<td class="${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : ""}${d.toFixed(1)}</td>`; }

// ---------- genel tablo üreticiler ----------
// target: m => true/false/null (null = hesaba katma)
function bucketTable(list, target, key, implKey) {
  const e = EDGES[key];
  const rows = e.slice(0, -1).map(() => ({ n: 0, hit: 0, imp: 0, impN: 0 }));
  let hitsAll = 0;
  for (const m of list) {
    const t = target(m); if (t == null) continue;
    const v = odd(m, key); if (!v) continue;
    let i = e.findIndex((x, j) => v >= x && v < e[j + 1]); if (i < 0) continue;
    const r = rows[i]; r.n++; if (t) { r.hit++; hitsAll++; }
    const iv = implKey ? odd(m, implKey) : null; if (iv) { r.imp += 100 / iv; r.impN++; }
  }
  const base = baseRate(list, target);
  const maxP = Math.max(1, ...rows.map((r) => pct(r.hit, r.n) || 0));
  let h = `<table><tr><th>${ONAME[key]}</th><th>Maç</th><th>Tutan</th><th class="l">Gerçekleşen %</th>${implKey ? "<th>Oranın beklediği %</th><th>Fark</th>" : ""}<th>Tutanların payı %</th></tr>`;
  rows.forEach((r, i) => {
    if (!r.n) return;
    const p = pct(r.hit, r.n), imp = r.impN ? r.imp / r.impN : null;
    h += `<tr class="${r.n < 20 ? "weak" : ""}"><td>${bucketLabel(e, i)}</td><td>${r.n}</td><td>${r.hit}</td>
      <td class="l"><span class="bar" style="width:${(p / maxP) * 120}px"></span><b ${heat(p, base)}>%${f1(p)}</b></td>
      ${implKey ? `<td>%${f1(imp)}</td>${diffCell(imp == null ? null : p - imp)}` : ""}
      <td>%${f1(pct(r.hit, hitsAll))}</td></tr>`;
  });
  return h + "</table>";
}

function condTable(list, target, conds) {
  const base = list.filter((m) => target(m) != null);
  const baseP = pct(base.filter(target).length, base.length);
  let h = `<table><tr><th>Şart</th><th>Maç</th><th>Tutan</th><th class="l">Gerçekleşen %</th><th>Genel ortalamaya göre</th></tr>
    <tr><td><b>Tüm maçlar (genel ortalama)</b></td><td>${base.length}</td><td>${base.filter(target).length}</td><td class="l"><b>%${f1(baseP)}</b></td><td>-</td></tr>`;
  for (const [name, fn] of conds) {
    const s = base.filter((m) => { try { return fn(m); } catch { return false; } });
    const hit = s.filter(target).length, p = pct(hit, s.length);
    h += `<tr class="${s.length < 20 ? "weak" : ""}"><td>${name}</td><td>${s.length}</td><td>${hit}</td>
      <td class="l"><span class="bar" style="width:${Math.min(160, ((p || 0) / (baseP || 1)) * 60)}px"></span><b ${heat(p, baseP)}>%${f1(p)}</b></td>${diffCell(p == null ? null : p - baseP)}</tr>`;
  }
  return h + "</table>";
}

function leagueTable(list, target, minN = 10) {
  const g = {};
  for (const m of list) { const t = target(m); if (t == null) continue; const r = (g[m.lg] ||= { n: 0, hit: 0 }); r.n++; if (t) r.hit++; }
  const rows = Object.entries(g).filter(([, r]) => r.n >= minN).map(([lg, r]) => [lg, r.n, r.hit, pct(r.hit, r.n)]).sort((a, b) => b[3] - a[3]);
  const base = baseRate(list, target), maxP = Math.max(1, ...rows.map((r) => r[3]));
  if (!rows.length) return `<p class="note">Yeterli maç yok (lig başına en az ${minN} maç gerekli).</p>`;
  let h = `<div class="scroll"><table><tr><th>Lig</th><th>Maç</th><th>Tutan</th><th class="l">%</th></tr>`;
  for (const [lg, n, hit, p] of rows) h += `<tr><td>${esc(lg)}</td><td>${n}</td><td>${hit}</td><td class="l"><span class="bar" style="width:${(p / maxP) * 120}px"></span><b ${heat(p, base)}>%${f1(p)}</b></td></tr>`;
  return h + "</table></div>";
}

function moved(m, k, dir) { const c = cls(m, k), o = opn(m, k); if (!c || !o) return false; return dir < 0 ? c <= o * 0.95 : c >= o * 1.05; }
function commonConds(extra = []) {
  return [
    ["Ev sahibi favori (MS1 < MS2)", (m) => odd(m, "1") < odd(m, "2")],
    ["Deplasman favori (MS2 < MS1)", (m) => odd(m, "2") < odd(m, "1")],
    ["Çok net favori var (oran < 1.30)", (m) => odd(m, "fav") < 1.3],
    ["Net favori var (oran 1.30 - 1.60)", (m) => odd(m, "fav") >= 1.3 && odd(m, "fav") < 1.6],
    ["Dengeli maç (iki taraf da 2.30+)", (m) => odd(m, "fav") >= 2.3],
    ["KG Var oranı < 1.70", (m) => odd(m, "kgv") && odd(m, "kgv") < 1.7],
    ["KG Var oranı 2.00+", (m) => odd(m, "kgv") >= 2.0],
    ["2.5 Üst oranı < 1.60", (m) => odd(m, "o2.5") && odd(m, "o2.5") < 1.6],
    ["2.5 Üst oranı 2.20+", (m) => odd(m, "o2.5") >= 2.2],
    ["İY 1.5 Üst oranı < 2.40", (m) => odd(m, "io1.5") && odd(m, "io1.5") < 2.4],
    ["Ev sahibi oranı açılıştan %5+ düştü", (m) => moved(m, "1", -1)],
    ["Deplasman oranı açılıştan %5+ düştü", (m) => moved(m, "2", -1)],
    ...extra,
  ];
}
function pills(items, cur, attr) {
  return `<div class="row">${items.map(([v, t]) => `<button class="pill ${v === cur ? "active" : ""}" data-${attr}="${v}">${t}</button>`).join("")}</div>`;
}
function groupSelect(id, opts, cur) {
  return `<label class="note">Gruplama oranı: <select id="${id}">${opts.map((k) => `<option value="${k}" ${k === cur ? "selected" : ""}>${ONAME[k]}</option>`).join("")}</select></label>`;
}

// ---------- sekmeler ----------
function renderOzet() {
  const L = VIEW, n = L.length;
  const ht = L.filter((m) => m.hh != null);
  const c = (arr, f) => pct(arr.filter(f).length, arr.length);
  const cards = [
    ["Maç sayısı", n, ""],
    ["2.5 Üst", "%" + f1(c(L, (m) => tot(m) > 2.5)), "3+ gol"],
    ["3.5 Üst", "%" + f1(c(L, (m) => tot(m) > 3.5)), "4+ gol"],
    ["4.5 Üst", "%" + f1(c(L, (m) => tot(m) > 4.5)), "5+ gol"],
    ["5.5 Üst", "%" + f1(c(L, (m) => tot(m) > 5.5)), "6+ gol"],
    ["İY 1.5 Üst", "%" + f1(c(ht, (m) => htTot(m) > 1.5)), "ilk yarı 2+ gol"],
    ["İY 2.5 Üst", "%" + f1(c(ht, (m) => htTot(m) > 2.5)), "ilk yarı 3+ gol"],
    ["İY/MS 1/2", "%" + f1(c(ht, (m) => htft(m) === "12")), ht.filter((m) => htft(m) === "12").length + " maç"],
    ["İY/MS 2/1", "%" + f1(c(ht, (m) => htft(m) === "21")), ht.filter((m) => htft(m) === "21").length + " maç"],
  ];
  let h = `<div class="cards">${cards.map(([t, v, s]) => `<div class="card"><div class="t">${t}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("")}</div>`;
  h += `<h2>Favori oranına göre sonuç yüzdeleri</h2><p class="note">Satır: maçtaki favorinin (MS 1 veya MS 2'den düşük olanın) oranı. Hücre: o grupta sonucun yüzde kaç gerçekleştiği.</p>`;
  const e = EDGES.fav;
  const cols = [["2.5Ü", (m) => tot(m) > 2.5], ["3.5Ü", (m) => tot(m) > 3.5], ["4.5Ü", (m) => tot(m) > 4.5], ["5.5Ü", (m) => tot(m) > 5.5],
    ["İY 1.5Ü", (m) => (m.hh == null ? null : htTot(m) > 1.5)], ["İY 2.5Ü", (m) => (m.hh == null ? null : htTot(m) > 2.5)],
    ["1/2", (m) => (m.hh == null ? null : htft(m) === "12")], ["2/1", (m) => (m.hh == null ? null : htft(m) === "21")],
    ["KG Var", (m) => m.fh > 0 && m.fa > 0]];
  h += `<div class="scroll"><table><tr><th>Favori oranı</th><th>Maç</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr>`;
  const bases = cols.map(([, f]) => baseRate(L, f));
  for (let i = 0; i < e.length - 1; i++) {
    const s = L.filter((m) => { const v = odd(m, "fav"); return v && v >= e[i] && v < e[i + 1]; });
    if (!s.length) continue;
    h += `<tr class="${s.length < 20 ? "weak" : ""}"><td>${bucketLabel(e, i)}</td><td>${s.length}</td>`;
    cols.forEach(([, f], j) => { const v = s.filter((m) => f(m) != null); const p = pct(v.filter(f).length, v.length); h += `<td class="heat" ${heat(p, bases[j])}>%${f1(p)}</td>`; });
    h += "</tr>";
  }
  h += "</table></div>";
  h += `<h2>Toplam gol dağılımı</h2>`;
  const dist = {}; L.forEach((m) => { const t = Math.min(tot(m), 7); dist[t] = (dist[t] || 0) + 1; });
  h += `<table><tr><th>Toplam gol</th><th>Maç</th><th class="l">%</th></tr>`;
  for (let t = 0; t <= 7; t++) { const p = pct(dist[t] || 0, n); h += `<tr><td>${t === 7 ? "7+" : t}</td><td>${dist[t] || 0}</td><td class="l"><span class="bar" style="width:${(p || 0) * 3}px"></span>%${f1(p)}</td></tr>`; }
  $("#tab-ozet").innerHTML = h + "</table>";
}

function renderUst() {
  const line = state.ustLine, k = "o" + line, target = (m) => tot(m) > +line;
  const grp = state.ustGroup === "line" ? k : state.ustGroup;
  let h = pills([["2.5", "2.5 Üst"], ["3.5", "3.5 Üst"], ["4.5", "4.5 Üst"], ["5.5", "5.5 Üst"]], line, "ust");
  const withOdds = VIEW.filter((m) => odd(m, k)).length;
  h += `<p class="note">${line} Üst = maçta ${Math.ceil(+line)}+ gol. Bu oranı olan maç: ${withOdds}.</p>`;
  h += groupSelect("g-ust", [k, "fav", "1", "2", "o2.5", "kgv", "io1.5"].filter((v, i, a) => a.indexOf(v) === i), grp);
  h += `<h2>${ONAME[grp]} aralıklarına göre ${line} Üst yüzdesi</h2>`;
  h += bucketTable(VIEW, target, grp, k);
  h += `<h2>Şartlara göre ${line} Üst yüzdesi</h2>`;
  h += condTable(VIEW, target, commonConds([
    [`${line} Üst oranı açılıştan %5+ düştü`, (m) => moved(m, k, -1)],
    [`${line} Üst oranı açılıştan %5+ yükseldi`, (m) => moved(m, k, 1)],
    ["İlk yarı 1.5 üst bitti (2+ gol)", (m) => htTot(m) > 1.5],
    ["İlk yarı golsüz bitti", (m) => htTot(m) === 0],
  ]));
  h += `<h2>Liglere göre ${line} Üst yüzdesi</h2>` + leagueTable(VIEW, target);
  $("#tab-ust").innerHTML = h;
}

function renderIy() {
  const line = state.iyLine, k = "io" + line, target = (m) => (m.hh == null ? null : htTot(m) > +line);
  const grp = state.iyGroup === "line" ? k : state.iyGroup;
  let h = pills([["0.5", "İY 0.5 Üst"], ["1.5", "İY 1.5 Üst"], ["2.5", "İY 2.5 Üst"]], line, "iy");
  h += `<p class="note">İY ${line} Üst = ilk yarıda ${Math.ceil(+line)}+ gol.</p>`;
  h += groupSelect("g-iy", [k, "o2.5", "o3.5", "fav", "kgv"].filter((v, i, a) => a.indexOf(v) === i), grp);
  h += `<h2>${ONAME[grp]} aralıklarına göre İY ${line} Üst yüzdesi</h2>`;
  h += bucketTable(VIEW, target, grp, grp === k ? k : null);
  h += `<h2>Şartlara göre İY ${line} Üst yüzdesi</h2>`;
  h += condTable(VIEW, target, commonConds([
    [`İY ${line} Üst oranı açılıştan %5+ düştü`, (m) => moved(m, k, -1)],
    ["2.5 Üst oranı açılıştan %5+ düştü", (m) => moved(m, "o2.5", -1)],
  ]));
  h += `<h2>Liglere göre İY ${line} Üst yüzdesi</h2>` + leagueTable(VIEW, target);
  $("#tab-iy").innerHTML = h;
}

function renderIyms() {
  const t = state.iymsT, hk = "hf" + t, target = (m) => (m.hh == null ? null : htft(m) === t);
  const grp = state.iymsGroup;
  const ht = VIEW.filter((m) => m.hh != null), hits = ht.filter((m) => htft(m) === t);
  let h = pills([["12", "1/2 (İY ev önde, MS deplasman kazandı)"], ["21", "2/1 (İY deplasman önde, MS ev kazandı)"]], t, "iyms");
  const avg = (arr, k) => { const v = arr.map((m) => odd(m, k)).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const comeback = t === "12" ? "2" : "1";
  const favShare = pct(hits.filter((m) => odd(m, comeback) && odd(m, comeback) < odd(m, comeback === "1" ? "2" : "1")).length, hits.length);
  h += `<div class="cards">
    <div class="card"><div class="t">${t[0]}/${t[1]} biten maç</div><div class="v">${hits.length}</div><div class="s">${ht.length} maçta %${f1(pct(hits.length, ht.length))}</div></div>
    <div class="card"><div class="t">Ort. MS 1 oranı</div><div class="v">${f2(avg(hits, "1"))}</div><div class="s">tüm maçlarda ${f2(avg(ht, "1"))}</div></div>
    <div class="card"><div class="t">Ort. MS X oranı</div><div class="v">${f2(avg(hits, "X"))}</div><div class="s">tüm maçlarda ${f2(avg(ht, "X"))}</div></div>
    <div class="card"><div class="t">Ort. MS 2 oranı</div><div class="v">${f2(avg(hits, "2"))}</div><div class="s">tüm maçlarda ${f2(avg(ht, "2"))}</div></div>
    <div class="card"><div class="t">Ort. İY/MS ${t[0]}/${t[1]} oranı</div><div class="v">${f2(avg(hits, hk))}</div><div class="s">tüm maçlarda ${f2(avg(ht, hk))}</div></div>
    <div class="card"><div class="t">Maçı çeviren takım favoriydi</div><div class="v">%${f1(favShare)}</div><div class="s">${comeback === "1" ? "ev sahibi" : "deplasman"} favori</div></div>
  </div>`;
  h += groupSelect("g-iyms", ["1", "2", "fav", "X", hk, "o2.5", "kgv"], grp);
  h += `<h2>${ONAME[grp]} aralıklarına göre ${t[0]}/${t[1]} yüzdesi</h2>`;
  h += bucketTable(VIEW, target, grp, grp === hk ? hk : null);
  h += `<h2>Şartlara göre ${t[0]}/${t[1]} yüzdesi</h2>`;
  h += condTable(VIEW, target, commonConds([["2.5 Üst oranı < 1.70 (gollü maç beklentisi)", (m) => odd(m, "o2.5") && odd(m, "o2.5") < 1.7]]));
  h += `<h2>${t[0]}/${t[1]} biten maçlar</h2><div class="scroll"><table><tr><th>Tarih</th><th class="l">Lig</th><th class="l">Maç</th><th>İY</th><th>MS</th><th>1</th><th>X</th><th>2</th><th>${t[0]}/${t[1]}</th><th>2.5Ü</th></tr>`;
  for (const m of hits.slice(0, 300)) h += `<tr><td>${new Date(m.ts * 1000).toLocaleDateString("tr-TR")}</td><td class="l">${esc(m.lg)}</td><td class="l">${esc(m.h)} - ${esc(m.a)}</td><td>${m.hh}-${m.ha}</td><td>${m.fh}-${m.fa}</td><td>${f2(odd(m, "1"))}</td><td>${f2(odd(m, "X"))}</td><td>${f2(odd(m, "2"))}</td><td>${f2(odd(m, hk))}</td><td>${f2(odd(m, "o2.5"))}</td></tr>`;
  h += "</table></div>" + `<h2>Liglere göre ${t[0]}/${t[1]} yüzdesi</h2>` + leagueTable(VIEW, target);
  $("#tab-iyms").innerHTML = h;
}

function renderListe() {
  const q = (state.q || "").toLowerCase();
  const fl = state.lf || "";
  const L = VIEW.filter((m) => (!q || (m.h + " " + m.a).toLowerCase().includes(q)) && (!fl ||
    (fl === "u25" && tot(m) > 2.5) || (fl === "u35" && tot(m) > 3.5) || (fl === "u45" && tot(m) > 4.5) || (fl === "u55" && tot(m) > 5.5) ||
    (fl === "iy15" && htTot(m) > 1.5) || (fl === "iy25" && htTot(m) > 2.5) || (fl === "12" && htft(m) === "12") || (fl === "21" && htft(m) === "21")));
  let h = `<div class="row"><input id="q" placeholder="Takım ara..." value="${esc(state.q || "")}">
    <select id="lf"><option value="">Tüm sonuçlar</option><option value="u25">2.5 Üst bitenler</option><option value="u35">3.5 Üst bitenler</option><option value="u45">4.5 Üst bitenler</option><option value="u55">5.5 Üst bitenler</option><option value="iy15">İY 1.5 Üst bitenler</option><option value="iy25">İY 2.5 Üst bitenler</option><option value="12">İY/MS 1/2</option><option value="21">İY/MS 2/1</option></select>
    <span class="note">${L.length} maç</span></div>`;
  h += `<div class="scroll"><table><tr><th>Tarih</th><th class="l">Lig</th><th class="l">Maç</th><th>İY</th><th>MS</th><th>1</th><th>X</th><th>2</th><th>1.5Ü</th><th>2.5Ü</th><th>3.5Ü</th><th>4.5Ü</th><th>5.5Ü</th><th>İY1.5Ü</th><th>İY2.5Ü</th><th>KG V</th></tr>`;
  for (const m of L.slice(0, state.listN)) {
    h += `<tr><td>${new Date(m.ts * 1000).toLocaleDateString("tr-TR")}</td><td class="l">${esc(m.lg)}</td><td class="l">${esc(m.h)} - ${esc(m.a)}</td><td>${m.hh == null ? "-" : m.hh + "-" + m.ha}</td><td><b>${m.fh}-${m.fa}</b></td>` +
      ["1", "X", "2", "o1.5", "o2.5", "o3.5", "o4.5", "o5.5", "io1.5", "io2.5", "kgv"].map((k) => `<td>${f2(odd(m, k))}</td>`).join("") + "</tr>";
  }
  h += "</table></div>";
  if (L.length > state.listN) h += `<button class="more" id="more">Daha fazla göster</button>`;
  $("#tab-liste").innerHTML = h;
  $("#lf").value = fl;
}

// ---------- skorlar ----------
let SKOR = null;
const scoreCells = (arr, n) => arr.slice(0, n).map(([s, p]) => `<b>${s}</b> <span class="note">%${f1(p * 100)}</span>`).join(" &nbsp; ");
function scoreBox(title, arr, r) {
  let h = `<div class="sk"><div class="t">${title}</div><table>`;
  arr.forEach(([s, p]) => (h += `<tr><td><b>${s}</b></td><td class="l"><span class="bar" style="width:${p * 300}px"></span>%${f1(p * 100)}</td></tr>`));
  return h + `</table><div class="note">1: %${f1(r["1"] * 100)} · X: %${f1(r.X * 100)} · 2: %${f1(r["2"] * 100)}</div></div>`;
}
function scoreDist(list, fn, n) {
  const c = {}; let t = 0;
  for (const m of list) { const s = fn(m); if (s == null) continue; c[s] = (c[s] || 0) + 1; t++; }
  const rows = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
  let h = `<table><tr><th>Skor</th><th>Maç</th><th class="l">%</th></tr>`;
  rows.forEach(([s, k]) => (h += `<tr><td><b>${s}</b></td><td>${k}</td><td class="l"><span class="bar" style="width:${(k / t) * 400}px"></span>%${f1((100 * k) / t)}</td></tr>`));
  return h + `</table><div class="note">${t} maç</div>`;
}
function renderSkor() {
  const el = $("#tab-skor");
  let h = `<h2>Yaklaşan maçların skor olasılıkları <span class="note">(önümüzdeki 36 saat · satıra tıklayınca detay açılır)</span></h2>
    <p class="note">Oranlardan (MS 1X2, alt/üst, İY 1X2, İY alt/üst) her takımın ilk yarı ve maç geneli beklenen golü hesaplanır, skorlar Poisson dağılımıyla bulunur. 2. yarı = maç geneli − ilk yarı.
    Son 30 günün 1.586 maçında test edildi: olasılıklar gerçekleşenle uyumlu (ör. en olası MS skoru model %11,6 dedi, %12,3 tuttu). Tek bir skorun olasılığı genelde %10-15'i geçmez.</p>`;
  const L = (SKOR && SKOR.matches) || [];
  if (!L.length) h += `<p class="note">${SKOR ? "Şu an yaklaşan maç verisi yok." : "Yükleniyor..."}</p>`;
  const sel = L.find((m) => m.id === state.skorId) || L[0];
  if (sel) {
    h += `<div class="cp top"><div class="cp-h"><span class="big">${esc(sel.h)} - ${esc(sel.a)}</span><span>${fmtT(sel.ts)} · ${esc(sel.lg)}</span>
      <span class="note" style="margin:0">Beklenen gol: ${f2(sel.xg[0])} - ${f2(sel.xg[1])} · oran kaynağı: ${esc(sel.src)}</span></div>
      <div class="sks">${scoreBox("İlk yarı skoru", sel.ht, sel.r.ht)}${scoreBox("2. yarı skoru (sadece 2. yarıda atılan goller)", sel.sh, sel.r.sh)}${scoreBox("Maç sonu skoru", sel.ft, sel.r.ft)}</div></div>`;
  }
  if (L.length) {
    h += `<div class="scroll"><table class="skl"><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>Beklenen gol</th><th class="l">En olası İY skorları</th><th class="l">En olası 2. yarı skorları</th><th class="l">En olası MS skorları</th></tr>`;
    for (const m of L) h += `<tr data-skor="${esc(m.id)}" style="cursor:pointer" class="${sel && m.id === sel.id ? "sel" : ""}"><td>${fmtT(m.ts)}</td><td class="l">${esc(m.lg)}</td><td class="l">${esc(m.h)} - ${esc(m.a)}</td><td>${f2(m.xg[0])} - ${f2(m.xg[1])}</td>
      <td class="l">${scoreCells(m.ht, 2)}</td><td class="l">${scoreCells(m.sh, 2)}</td><td class="l">${scoreCells(m.ft, 2)}</td></tr>`;
    h += `</table></div>`;
  }
  const e = EDGES["1"], b = state.skorBand;
  const list = VIEW.filter((m) => { if (b === "all") return true; const v = odd(m, "1"); return v && v >= e[+b] && v < e[+b + 1]; });
  h += `<h2>Geçmiş maçlarda en sık skorlar <span class="note">(üstteki filtrelere göre · MS 1 oranı aralığı seç)</span></h2>
    ${pills([["all", "Hepsi"], ...e.slice(0, -1).map((_, i) => [String(i), bucketLabel(e, i)])], b, "skband")}
    <div class="sks"><div class="sk"><div class="t">İlk yarı skoru</div>${scoreDist(list, (m) => (m.hh == null ? null : `${m.hh}-${m.ha}`), 10)}</div>
    <div class="sk"><div class="t">2. yarı skoru</div>${scoreDist(list, (m) => (m.hh == null ? null : `${m.fh - m.hh}-${m.fa - m.ha}`), 10)}</div>
    <div class="sk"><div class="t">Maç sonu skoru</div>${scoreDist(list, (m) => `${m.fh}-${m.fa}`, 12)}</div></div>`;
  el.innerHTML = h;
  el.onclick = (ev) => {
    const tr = ev.target.closest("[data-skor]"), bb = ev.target.closest("[data-skband]");
    if (tr) { state.skorId = tr.dataset.skor; renderSkor(); el.scrollIntoView({ behavior: "smooth" }); }
    if (bb) { state.skorBand = bb.dataset.skband; renderSkor(); }
  };
}

// ---------- kuponlar ----------
let KUPON = null;
const fmtT = (ts) => new Date(ts * 1000).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const KIND = { iyms: "İY/MS", skor: "İY + 2. yarı skoru", iyust: "İY 1.5 / 2.5 Üst", ust: "3.5 / 4.5 / 5.5 Üst", ust45: "4.5 / 5.5 Üst", iyms_s: "İY/MS sürpriz (1/X, 2/X, 1/2, 2/1)", ms: "Maç sonucu (MS)", iykg: "İY KG Var", iyskor: "İY skoru", skor3: "İY / 2. yarı / MS skoru", yuksek: "Yüksek oran",
  kisa: "4 saatlik (eski)", gunluk: "Günlük 5-6 maçlık (eski)", iyms_y: "İY/MS yüksek oran (eski)" };
const SCORE_KINDS = ["iyskor", "skor", "skor3"]; // İY skoru ve MS skoru kuponları ayrı sekmede ("Skor Kuponları")
const ORDER = ["iyms", "iyust", "ust", "ust45", "iyms_s", "ms", "iykg", "yuksek"];
const isScore = (c) => SCORE_KINDS.includes(c.kind);
const pTxt = (p) => (p >= 0.001 ? `%${(p * 100).toFixed(p >= 0.01 ? 1 : 2)}` : `${Math.round(1 / p).toLocaleString("tr-TR")}'de 1`);
const mark = (r) => (r === true ? `<span class="pos">✓</span>` : r === false ? `<span class="neg">✗</span>` : "");
function skorCard(c) {
  const ST = { "kazandı": ["win", "pos", "TUTTU"], "kaybetti": ["lose", "neg", "YATTI"], "sonuçsuz": ["", "", "Sonuçsuz"] };
  const a = ST[c.status] || ["", "", "Bekliyor"], b = ST[c.ms] || ["", "", "Bekliyor"];
  if (c.legs.every((l) => l.odd)) return skorCardIddaa(c, a);
  const ft = c.legs.some((l) => l.ft);
  let h = `<div class="cp ${a[0]}"><div class="cp-h">
    <span class="tag y">Skor kuponu · ${c.legs.length}'lü</span>
    <span>İY + 2. yarı skorları tutma olasılığı: <span class="big">${pTxt(c.p)}</span></span>
    ${ft ? `<span>Sadece MS skorları: <span class="big">${pTxt(c.p_ft)}</span> <span class="${b[1]}">${b[2]}</span></span>` : `<span>Adil oran <span class="big">${Math.round(1 / c.p).toLocaleString("tr-TR")}</span></span>`}
    <span class="note" style="margin:0">Hazırlandı: ${fmtT(c.created)}</span>
    <span class="st ${a[1]}">${a[2]}</span></div>
    <div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>İY skoru</th><th>2. yarı skoru</th><th>İY+2.Y birlikte</th>${ft ? "<th>MS skoru</th>" : ""}<th>Gerçek skor (İY / MS)</th></tr>`;
  for (const l of c.legs) {
    h += `<tr><td>${fmtT(l.ts)}</td><td class="l">${esc(l.lg)}</td><td class="l">${esc(l.h)} - ${esc(l.a)}</td>
      <td><b>${l.ht}</b> <span class="note">%${f1(l.p_ht * 100)}</span> ${mark(l.r_ht)}</td>
      <td><b>${l.sh}</b> <span class="note">%${f1(l.p_sh * 100)}</span> ${mark(l.r_sh)}</td>
      <td>%${f1(l.p * 100)}</td>
      ${ft ? `<td><b>${l.ft || "-"}</b> ${l.p_ft ? `<span class="note">%${f1(l.p_ft * 100)}</span>` : ""} ${mark(l.r_ft)}</td>` : ""}
      <td>${l.score ? esc(l.score) : "-"}</td></tr>`;
  }
  return h + "</table></div></div>";
}
function skorCardIddaa(c, a) {
  let h = `<div class="cp ${a[0]}"><div class="cp-h">
    <span class="tag y">Skor kuponu · ${c.legs.length}'lü</span>
    <span>Toplam oran (iddaa) <span class="big">${c.odd.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</span></span>
    <span>Tutma olasılığı <span class="big">${pTxt(c.p)}</span></span>
    <span class="note" style="margin:0">Hazırlandı: ${fmtT(c.created)}</span>
    <span class="st ${a[1]}">${a[2]}</span></div>
    <div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>İY skoru</th><th>2. yarı skoru</th><th>iddaa seçeneği (İY / MS skoru)</th><th>Oran</th><th>Olasılık</th><th>Gerçek skor (İY / MS)</th></tr>`;
  for (const l of c.legs) {
    h += `<tr><td>${fmtT(l.ts)}</td><td class="l">${esc(l.lg)}</td><td class="l">${esc(l.h)} - ${esc(l.a)}</td>
      <td><b>${l.ht}</b> <span class="note">%${f1(l.p_ht * 100)}</span> ${mark(l.r_ht)}</td>
      <td><b>${l.sh}</b> <span class="note">%${f1(l.p_sh * 100)}</span> ${mark(l.r_sh)}</td>
      <td><b>${l.ht} / ${l.ft}</b></td><td>${l.odd.toFixed(2)}</td><td>%${f1(l.p * 100)}</td>
      <td>${l.score ? esc(l.score) : "-"}</td></tr>`;
  }
  return h + "</table></div></div>";
}
function skor3Card(c) {
  const ST = { "kazandı": ["pos", "TUTTU"], "kaybetti": ["neg", "YATTI"], "sonuçsuz": ["", "Sonuçsuz"] };
  const pt = c.parts || {}, s = (k) => { const x = ST[pt[k]] || ["", "Bekliyor"]; return `<span class="${x[0]}">${x[1]}</span>`; };
  const a = { "kazandı": "win", "kaybetti": "lose" }[c.status] || "";
  let h = `<div class="cp ${a}"><div class="cp-h">
    <span class="tag y">${KIND.skor3} · ${c.legs.length}'lü</span>
    <span>İY skorları <span class="big">${pTxt(c.p_ht)}</span> ${s("ht")}</span>
    <span>2. yarı skorları <span class="big">${pTxt(c.p_sh)}</span> ${s("sh")}</span>
    <span>MS skorları <span class="big">${pTxt(c.p_ft)}</span> ${s("ft")}</span>
    ${c.ref ? `<span>MS skoru toplam oran (Bet365/WH) <span class="big">${c.ref.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</span></span>` : ""}
    <span class="note" style="margin:0">Hazırlandı: ${fmtT(c.created)}</span></div>
    <div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>İY skoru</th><th>2. yarı skoru</th><th>MS skoru</th><th>MS skor oranı (Bet365/WH)</th><th>Gerçek skor (İY / MS)</th></tr>`;
  for (const l of c.legs) {
    h += `<tr><td>${fmtT(l.ts)}</td><td class="l">${esc(l.lg)}</td><td class="l">${esc(l.h)} - ${esc(l.a)}</td>
      <td><b>${l.ht}</b> <span class="note">%${f1(l.p_ht * 100)}</span> ${mark(l.r_ht)}</td>
      <td><b>${l.sh}</b> <span class="note">%${f1(l.p_sh * 100)}</span> ${mark(l.r_sh)}</td>
      <td><b>${l.ft}</b> <span class="note">%${f1(l.p_ft * 100)}</span> ${mark(l.r_ft)}</td>
      <td>${l.ref ? l.ref.toFixed(2) : "-"}</td><td>${l.score ? esc(l.score) : "-"}</td></tr>`;
  }
  return h + "</table></div></div>";
}
const isHigh = (k) => k === "yuksek" || k === "iyms_y" || k === "skor";
function couponCard(c, top) {
  if (c.kind === "skor") return skorCard(c);
  if (c.kind === "skor3") return skor3Card(c);
  const st = { "kazandı": ["win", "pos", "TUTTU"], "kaybetti": ["lose", "neg", "YATTI"], "sonuçsuz": ["", "", "Sonuçsuz"] }[c.status] || ["", "", "Bekliyor"];
  let h = `<div class="cp ${st[0]} ${top ? "top" : ""}"><div class="cp-h">
    <span class="tag ${isHigh(c.kind) ? "y" : ""}">${KIND[c.kind] || c.kind} · ${c.legs.length}'lü</span>
    <span>Toplam oran <span class="big">${c.odd.toFixed(2)}</span></span>
    <span>Tutma olasılığı <span class="big" ${heat(c.p * 100, isHigh(c.kind) ? 15 : 35)}>%${f1(c.p * 100)}</span></span>
    <span class="note" style="margin:0">Hazırlandı: ${fmtT(c.created)}</span>
    <span class="st ${st[1]}">${st[2]}</span></div>
    <div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th class="l">Tahmin</th><th>Oran</th><th>Olasılık</th><th>Oranın ima ettiği</th><th>Skor (İY / MS)</th></tr>`;
  for (const l of c.legs) {
    const r = l.r === true ? `<span class="pos">✓</span>` : l.r === false ? `<span class="neg">✗</span>` : "";
    h += `<tr><td>${fmtT(l.ts)}</td><td class="l">${esc(l.lg)}</td><td class="l">${esc(l.h)} - ${esc(l.a)}</td><td class="l"><b>${esc(l.pick)}</b>${l.bk && l.bk !== "iddaa" ? ` <span class="note">(${esc(l.bk)})</span>` : ""}${l.ref ? ` <span class="note">(Bet365/WH kıyas: ${l.ref.toFixed(2)})</span>` : ""}</td>
      <td>${l.odd.toFixed(2)}</td><td>%${f1(l.p * 100)}</td><td>%${f1(l.p0 * 100)}</td><td>${l.score ? esc(l.score) + " " + r : "-"}</td></tr>`;
  }
  return h + "</table></div></div>";
}
function renderKupon() {
  const el = $("#tab-kupon");
  renderSkorKupon();
  if (!KUPON) { el.innerHTML = `<p class="note">Kupon verisi yükleniyor...</p>`; return; }
  const all = (KUPON.coupons || []).filter((c) => c.legs && c.legs.length && !isScore(c));
  const now = Date.now() / 1000;
  const active = all.filter((c) => c.status === "bekliyor" && Math.max(...c.legs.map((l) => l.ts)) + 2.5 * 3600 > now);
  const done = all.filter((c) => c.status === "kazandı");
  $("#tab-surpriz").innerHTML = surprizPanel();
  let h = `<p class="note">Sistem <b>her 8 saatte bir</b> (00, 08, 16 dilimleri) güncel bülteni tarar ve <b>günün kalan iddaa maçlarından</b> kupon hazırlar: İY/MS, İY 1.5 / 2.5 Üst, 3.5 / 4.5 / 5.5 Üst, Maç sonucu (MS), İY Karşılıklı Gol Var ve yüksek oranlıdan en fazla 2'şer adet (2-5 maçlık) ve ayrıca her türden <b>4'lü, 5'li ve 6'lı birer kupon</b>, sadece <b>4.5 / 5.5 Üst</b> seçimlerinden 4'lü ve 5'li, sadece iddaa'da oranı olan <b>İY/MS 1/X, 2/X, 1/2, 2/1</b> seçimlerinden olasılığı en yüksek maçlarla 4'lü ve 5'li ayrı kuponlar (bu seçimler %36'ya ulaşmadığı için o kuraldan muaftır),
    <b>Tutma olasılığı %36'nın altındaki</b> <b>ve oranı 1.70'in altındaki hiçbir seçim kupona alınmaz</b>; bu yüzden bazı dilimlerde bazı türlerden kupon çıkmayabilir. Kuponlarda toplam oranı <b>5.50'nin altında kupon yoktur</b> (yüksek oranlıda en az 10). Bu şartı sağlayan kombinasyonlar arasından tutma olasılığı en yüksek olan seçilir.
    Oranlar iddaa'dan; iddaa'da olmayan market (çoğunlukla İY/MS) için aynı maçın Bet365 / William Hill oranı kullanılır (tabloda belirtilir).
    <b>Bir maç (aynı takımlar) bekleyen kuponların en fazla 2'sinde yer alır ve iki kupon en fazla 1 ortak maç paylaşır</b> (her kupon farklı bir kombinasyon). İY skoru ve MS skoru kuponları <b>Skor Kuponları (İY / MS)</b> sekmesindedir.
    Olasılık: oranın ima ettiği olasılık, son 3 ayda aynı oran seviyesindeki maçların gerçek sonuçlarına göre düzeltilir. Son güncelleme: ${fmtT(KUPON.updated)}</p>`;
  const sum = (kind) => { const w = done.filter((c) => c.kind === kind);
    return `<div class="card"><div class="t">${KIND[kind]}</div><div class="v">${w.length}</div><div class="s">${w.length ? "tutan kupon" : "henüz tutan kupon yok"}</div></div>`; };
  h += `<div class="cards">${ORDER.map(sum).join("")}</div>`;
  if (!active.length) h += `<p class="note">Şu an bekleyen kupon yok. Bir sonraki 8 saatlik taramada, günün kalan maçlarında şartları sağlayan maç olursa kupon hazırlanır.</p>`;
  const ready = active.slice().sort((a, b) => b.p - a.p);
  if (ready.length) {
    h += `<h2>Hazır kuponlar <span class="note">(tutma olasılığı en yüksekten düşüğe)</span></h2>`;
    ready.forEach((c, i) => (h += couponCard(c, i === 0)));
  }
  const top = KUPON.iyms_top || {};
  if (Object.keys(top).length) {
    h += `<h2>İY/MS seçenekleri: önümüzdeki 36 saatin en olası maçları <span class="note">(iddaa maçları; iddaa oranı yoksa Bet365 / William Hill)</span></h2><div class="scroll"><table><tr><th class="l">Seçenek</th><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>Oran</th><th>Olasılık</th><th>Oranın ima ettiği</th></tr>`;
    for (const [k, rows] of Object.entries(top)) {
      if (!rows.length) { h += `<tr><td class="l"><b>${esc(k)}</b></td><td colspan="6" class="note">uygun maç yok</td></tr>`; continue; }
      rows.forEach((l, i) => (h += `<tr><td class="l">${i ? "" : `<b>${esc(k)}</b>`}</td><td>${fmtT(l.ts)}</td><td class="l">${esc(l.lg)}</td><td class="l">${esc(l.h)} - ${esc(l.a)}</td><td>${l.odd.toFixed(2)}</td><td>%${f1(l.p * 100)}</td><td>%${f1(l.p0 * 100)}</td></tr>`));
    }
    h += `</table></div>`;
  }
  const kg = KUPON.iykg_top || [];
  if (kg.length) {
    h += `<h2>İY Karşılıklı Gol Var: önümüzdeki 36 saatin en olası maçları <span class="note">(tutma olasılığı en yüksekten düşüğe; iddaa oranı yoksa Bet365 / William Hill)</span></h2><div class="scroll"><table><tr><th>#</th><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>Oran</th><th>Olasılık</th><th>Oranın ima ettiği</th></tr>`;
    kg.forEach((l, i) => (h += `<tr><td>${i + 1}</td><td>${fmtT(l.ts)}</td><td class="l">${esc(l.lg)}</td><td class="l">${esc(l.h)} - ${esc(l.a)}${l.bk && l.bk !== "iddaa" ? ` <span class="note">(${esc(l.bk)})</span>` : ""}</td><td>${l.odd.toFixed(2)}</td><td>%${f1(l.p * 100)}</td><td>%${f1(l.p0 * 100)}</td></tr>`));
    h += `</table></div><p class="note">İY KG Var: ilk yarıda iki takımın da gol atması. Bu bahis nadir tutar (maçların ~%21'i); olasılıklar tahmindir.</p>`;
  }
  const kh = (KUPON.iykg_hist || []).filter((x) => x.r != null);
  if (kh.length) {
    const won = kh.filter((x) => x.r);
    h += `<h2>İY Karşılıklı Gol Var: listede verilen maçlardan tutanlar <span class="note">(en yeniden eskiye)</span></h2>
      <p class="note">Listede verilip sonuçlanan <b>${kh.length}</b> maçtan <b>${won.length}</b> tanesinde İY KG Var tuttu (%${f1((won.length / kh.length) * 100)}); bu maçların listedeki ortalama tutma olasılığı %${f1((kh.reduce((s, x) => s + x.p, 0) / kh.length) * 100)} idi. Oran ve olasılık, maçın listeye ilk girdiği andaki değerdir.</p>`;
    if (won.length) {
      h += `<div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>Oran</th><th>Olasılık</th><th>Skor (İY / MS)</th></tr>`;
      won.forEach((l) => (h += `<tr><td>${fmtT(l.ts)}</td><td class="l">${esc(l.lg)}</td><td class="l">${esc(l.h)} - ${esc(l.a)}${l.bk && l.bk !== "iddaa" ? ` <span class="note">(${esc(l.bk)})</span>` : ""}</td><td>${l.odd.toFixed(2)}</td><td>%${f1(l.p * 100)}</td><td>${esc(l.score)} <span class="pos">✓</span></td></tr>`));
      h += `</table></div>`;
    }
  }
  const past = done.sort((a, b) => wonAt(b) - wonAt(a)).slice(0, 40);
  if (past.length) { h += `<h2>Tutan kuponlar <span class="note">(en son tutandan eskiye)</span></h2>`; past.forEach((c) => (h += couponCard(c, false))); }
  h += `<p class="note">Uyarı: Geçmiş testte (son 45 gün) model olasılıkları gerçekleşenle uyumluydu ama kuponların uzun vadede kâr ettiği görülmedi. Bahis şirketinin marjı nedeniyle kâr garantisi yoktur.</p>`;
  el.innerHTML = h;
}

const DAYS_KEEP = 30;
const recent = (ts) => ts >= Date.now() / 1000 - DAYS_KEEP * 86400;
const HM = (ts) => new Date(ts * 1000).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
// Satırları TR gününe göre katlanır bloklara ayırır (güne tıklayınca açılır); rows en yeniden eskiye sıralı
function dayGroups(rows, head, row) {
  const days = [];
  for (const x of rows) { const d = TRDAY(x.ts); if (!days.length || days[days.length - 1][0] !== d) days.push([d, []]); days[days.length - 1][1].push(x); }
  return days.map(([d, xs]) => `<details class="day"><summary><b>${d}</b> <span class="note">· ${xs.length} tutan maç</span></summary>
    <div class="scroll"><table><tr>${head}</tr>${xs.map(row).join("")}</table></div></details>`).join("");
}
// Kuponlardaki İY/MS 1/X, 2/X, 1/2, 2/1 seçimlerinden tutanlar (kupon yatsa da), gün gün
function surprizPanel() {
  const hs = (KUPON.surpriz_hist || []).filter((x) => x.r != null && recent(x.ts)), won = hs.filter((x) => x.r);
  const by = {};
  for (const x of hs) { const s = (by[x.pick] = by[x.pick] || [0, 0]); s[1]++; if (x.r) s[0]++; }
  let h = `<h2>İY/MS 1/X, 2/X, 1/2, 2/1: kuponlarda tutan maçlar <span class="note">(kupon yatsa da; son ${DAYS_KEEP} gün, en yeniden eskiye)</span></h2>
    <p class="note">Kuponlarda yer alıp sonuçlanan <b>${hs.length}</b> sürpriz seçimden <b>${won.length}</b> tanesi tuttu.` +
    (hs.length ? " " + Object.entries(by).sort().map(([k, [w, n]]) => `${esc(k.replace("İY/MS ", ""))}: <b>${w} / ${n}</b>`).join(" · ") : "") +
    ` Bir güne tıklayınca o günün tutan maçları açılır.</p>`;
  if (!won.length) return h + `<p class="note">Henüz tutan sürpriz seçim yok. Tutan maçlar burada gün gün listelenecek.</p>`;
  return h + dayGroups(won, `<th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th class="l">Tahmin</th><th>Oran</th><th>Olasılık</th><th>Skor (İY / MS)</th>`,
    (x) => `<tr><td>${HM(x.ts)}</td><td class="l">${esc(x.lg)}</td><td class="l">${esc(x.h)} - ${esc(x.a)}${x.bk && x.bk !== "iddaa" ? ` <span class="note">(${esc(x.bk)})</span>` : ""}</td>
      <td class="l"><b>${esc(x.pick)}</b></td><td>${x.odd.toFixed(2)}</td><td>%${f1(x.p * 100)}</td><td>${esc(x.score)} <span class="pos">✓</span></td></tr>`);
}

const wonAt = (c) => Math.max(...c.legs.map((l) => l.ts || 0)) || c.created || 0;
function renderSkorKupon() {
  const el = $("#tab-skorkupon");
  if (!KUPON) { el.innerHTML = `<p class="note">Kupon verisi yükleniyor...</p>`; return; }
  const all = (KUPON.coupons || []).filter((c) => c.legs && c.legs.length && isScore(c));
  const now = Date.now() / 1000;
  const active = all.filter((c) => c.status === "bekliyor" && Math.max(...c.legs.map((l) => l.ts)) + 2.5 * 3600 > now);
  const done = all.filter((c) => c.status === "kazandı");
  let h = `<p class="note">İlk yarı skoru ve maç sonu skoru kuponları bu sekmede toplanır. Her 8 saatlik dilimde (00, 08, 16) günün kalan iddaa maçlarından hazırlanır. Bir maç (aynı takımlar) bekleyen kuponların en fazla 2'sinde yer alır, iki kupon en fazla 1 ortak maç paylaşır. Son güncelleme: ${fmtT(KUPON.updated)}</p>
    <p class="note"><b>İY skoru:</b> sadece ilk yarı skorlarından oluşan 3'lü ve 4'lü kuponlar. iddaa'nın <b>"1. Yarı Skoru"</b> bahsi açık maçlar kullanılır ve iddaa seçenekleri arasından modele göre en olası ilk yarı skoru seçilir. En olası İY skoru bile genelde %36'nın altında kaldığı için bu kuponlar %36 kuralından muaftır. Oranlar iddaa oranıdır; Bet365 / William Hill oranı sadece kıyas için yazılır.</p>
    <p class="note"><b>İY + 2. yarı skoru:</b> sadece iddaa'da <b>"1. Yarı/Maç Sonucu Skorları"</b> bahsi açık maçlar kullanılır. Her maç için en olası İY skoru + 2. yarı skoru seçilir; iddaa'da oynanacak seçenek İY skoru / MS skorudur (MS = İY + 2. yarı). Oranlar iddaa oranıdır.</p>
    <p class="note"><b>İY / 2. yarı / MS skoru:</b> her maç için modelin en olası MS skoru ve onu oluşturan en olası İY + 2. yarı skoru yazılır. Kupon üç ayrı kupon gibi sonuçlanır: tüm İY skorları tutarsa "İY skorları", tüm 2. yarı skorları tutarsa "2. yarı skorları", tüm MS skorları tutarsa "MS skorları" TUTTU olur. iddaa'da MS ve 2. yarı skoru bahsi olmadığı için Bet365 / William Hill MS skor oranı sadece bilgi amaçlıdır.</p>`;
  const sum = (kind) => { const w = done.filter((c) => c.kind === kind);
    return `<div class="card"><div class="t">${KIND[kind]}</div><div class="v">${w.length}</div><div class="s">${w.length ? "tutan kupon" : "henüz tutan kupon yok"}</div></div>`; };
  h += `<div class="cards">${SCORE_KINDS.map(sum).join("")}</div>`;
  const ready = active.slice().sort((a, b) => b.p - a.p);
  if (ready.length) {
    h += `<h2>Hazır skor kuponları <span class="note">(tutma olasılığı en yüksekten düşüğe)</span></h2>`;
    ready.forEach((c, i) => (h += couponCard(c, i === 0)));
  } else h += `<p class="note">Şu an bekleyen skor kuponu yok. Bir sonraki 8 saatlik taramada, günün kalan maçlarında şartları sağlayan maç olursa kupon hazırlanır.</p>`;
  h += skorHist();
  const past = done.filter((c) => recent(wonAt(c))).sort((a, b) => wonAt(b) - wonAt(a)).slice(0, 40);
  if (past.length) { h += `<h2>Tutan skor kuponları <span class="note">(en son tutandan eskiye)</span></h2>`; past.forEach((c) => (h += couponCard(c, false))); }
  el.innerHTML = h;
}

const TRDAY = (ts) => new Date(ts * 1000).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
// Skor kuponlarındaki maçlardan tahmini tutanlar (kupon yatsa da), gün gün
function skorHist() {
  const hs = (KUPON.skor_hist || []).filter((x) => recent(x.ts));
  if (!hs.length) return `<h2>Skor tahminlerinde tutan maçlar</h2><p class="note">Son ${DAYS_KEEP} günde sonuçlanmış skor tahmini yok.</p>`;
  const st = {};
  for (const x of hs) for (const [k, , , r] of x.parts) { const s = (st[k] = st[k] || [0, 0]); s[1]++; if (r) s[0]++; }
  const won = hs.filter((x) => x.parts.some((p) => p[3]));
  let h = `<h2>Skor tahminlerinde tutan maçlar <span class="note">(kupon yatsa da; son ${DAYS_KEEP} gün, en yeniden eskiye)</span></h2>
    <p class="note">Skor kuponlarında yer alıp sonuçlanan <b>${hs.length}</b> maçtan <b>${won.length}</b> tanesinde en az bir skor tahmini tuttu. ` +
    Object.entries(st).map(([k, [w, n]]) => `${k}: <b>${w} / ${n}</b> (%${f1((w / n) * 100)})`).join(" · ") + `. Bir güne tıklayınca o günün tutan maçları açılır.</p>`;
  if (!won.length) return h;
  const pt = (x, ok) => x.parts.filter((p) => !!p[3] === ok).map((p) => `${p[0]} <b>${esc(p[1])}</b> <span class="note">%${f1(p[2] * 100)}</span> ${mark(p[3])}`).join("<br>") || "-";
  return h + dayGroups(won, `<th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th class="l">Kupon türü</th><th class="l">Tutan tahmin</th><th class="l">Tutmayan tahmin</th><th>Oran (iddaa)</th><th>Gerçek skor (İY / MS)</th>`,
    (x) => `<tr><td>${HM(x.ts)}</td><td class="l">${esc(x.lg)}</td><td class="l">${esc(x.h)} - ${esc(x.a)}</td><td class="l">${KIND[x.kind] || x.kind}</td>
      <td class="l">${pt(x, true)}</td><td class="l">${pt(x, false)}</td><td>${x.odd ? x.odd.toFixed(2) : "-"}</td><td>${x.score ? esc(x.score) : "-"}</td></tr>`);
}

// ---------- oran arama ----------
let BULTEN = null, araMode = null;
function renderAra() {
  const el = $("#tab-ara");
  if (!el.innerHTML) {
    el.innerHTML = `<p class="note">Bir oran yazın, iddaa bültenindeki (önümüzdeki 36 saat) sadece o orana sahip maçlar ve seçenekler listelensin.
      Ya da bir tutma olasılığı yazın, modelin o olasılığa yakın gördüğü seçimler listelensin (oran dikkate alınmaz).</p>
      <div class="filters"><label>Oran <input id="a-odd" type="text" inputmode="decimal" placeholder="örn. 1.85" style="width:90px"></label>
      <label>Hassasiyet <select id="a-tol"><option value="0">Tam bu oran</option><option value="0.05">± 0.05</option><option value="0.10">± 0.10</option></select></label>
      <label>Zaman <select id="a-day"><option value="1">Bugün</option><option value="0">Tüm bülten (36 saat)</option></select></label>
      <label>Market <select id="a-mk">${MK_OPTS}</select></label>
      <button id="a-go">Tara</button></div>
      <div class="filters"><label>Tutma olasılığı (%) <input id="a-prob" type="text" inputmode="decimal" placeholder="örn. %40" style="width:90px"></label>
      <label>Olasılık hassasiyeti <select id="a-ptol"><option value="2">± %2</option><option value="5">± %5</option><option value="10">± %10</option></select></label>
      <button id="a-pgo">Olasılık Ara</button></div>
      <p class="note">Olasılıklar model tahminidir (oran + geçmiş sonuç düzeltmesi), garanti değildir.</p><div id="a-res"></div>`;
  }
}
// Zaman + Market filtresine uyan tüm seçimleri tarar; keep(o, p) true dönenleri toplar
function araScan(keep) {
  const mk = $("#a-mk").value ? new RegExp($("#a-mk").value) : null;
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const lim = $("#a-day").value === "1" ? end.getTime() / 1000 : Infinity, now = Date.now() / 1000;
  const rows = [];
  for (const m of BULTEN.matches) {
    if (m.ts < now || m.ts > lim) continue;
    for (const [lab, o, p, ext] of m.o) if (keep(o, p) && (!mk || mk.test(lab))) rows.push({ m, lab, o, p, ext });
  }
  return rows;
}
function araTable(rows, imp) {
  let h = `<p class="note"><b>${rows.length}</b> seçim, ${new Set(rows.map((r) => r.m.id)).size} maç bulundu. Bülten güncellemesi: ${fmtT(BULTEN.updated)}</p>`;
  if (rows.length) {
    h += `<div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th>${imp ? `<th class="l">Market</th><th class="l">Seçim</th>` : `<th class="l">Seçenek</th>`}<th>Oran</th><th>Tutma olasılığı</th>${imp ? "<th>Oranın ima ettiği</th><th>Kaynak</th>" : ""}</tr>`;
    for (const r of rows) {
      const sp = r.lab.lastIndexOf(" ");
      const sel = imp ? `<td class="l">${esc(r.lab.slice(0, sp))}</td><td class="l"><b>${esc(r.lab.slice(sp + 1))}</b></td>`
        : `<td class="l"><b>${esc(r.lab)}</b>${r.ext ? ` <span class="note">(Bet365/WH)</span>` : ""}</td>`;
      h += `<tr><td>${fmtT(r.m.ts)}</td><td class="l">${esc(r.m.lg)}</td><td class="l">${esc(r.m.h)} - ${esc(r.m.a)}</td>${sel}<td>${r.o.toFixed(2)}</td><td>${r.p ? `%${f1(r.p * 100)}` : "-"}</td>${imp ? `<td>%${f1(100 / r.o)}</td><td>${r.ext ? "Bet365/WH" : "iddaa"}</td>` : ""}</tr>`;
    }
    h += `</table></div>`;
  }
  return h;
}
function runAra() {
  const res = $("#a-res");
  if (!BULTEN) { res.innerHTML = `<p class="note">Bülten yükleniyor...</p>`; return; }
  const v = parseFloat(String($("#a-odd").value).replace(",", "."));
  if (!(v > 1)) { res.innerHTML = `<p class="note">Geçerli bir oran yazın (örn. 1.85).</p>`; return; }
  araMode = "odd";
  const tol = +$("#a-tol").value + 0.001;
  const rows = araScan((o) => Math.abs(o - v) <= tol);
  rows.sort((a, b) => (b.p || 0) - (a.p || 0) || a.m.ts - b.m.ts);
  res.innerHTML = `<p class="note">Tutma olasılığı en yüksekten düşüğe sıralı.</p>` + araTable(rows, false);
}
function runAraP() {
  const res = $("#a-res");
  if (!BULTEN) { res.innerHTML = `<p class="note">Bülten yükleniyor...</p>`; return; }
  const v = parseFloat(String($("#a-prob").value).replace("%", "").replace(",", ".").trim());
  if (!(v > 0 && v < 100)) { res.innerHTML = `<p class="note">Geçerli bir olasılık yazın (örn. %40, 40 veya 40,5).</p>`; return; }
  araMode = "prob";
  const t = v / 100, tol = +$("#a-ptol").value / 100 + 1e-9;
  const rows = araScan((o, p) => p > 0 && Math.abs(p - t) <= tol);
  rows.sort((a, b) => b.p - a.p || a.m.ts - b.m.ts);
  res.innerHTML = `<p class="note">Hedef: <b>%${f1(v)}</b> ± %${$("#a-ptol").value} (tutma olasılığı en yüksekten düşüğe sıralı)</p>` + araTable(rows, true);
}

// ---------- tutan oranlar ----------
let ORAN = null, TG = [];
const MK_GROUPS = [
  ["Market grupları", [["^MS ", "Maç sonucu (MS) – hepsi"], ["^İY [12X]$", "İlk yarı sonucu – hepsi"], ["^[0-9.]+ (Üst|Alt)", "Alt / Üst – hepsi"], ["^İY [0-9.]+ ", "İY Alt / Üst – hepsi"], ["^KG", "KG Var / Yok – hepsi"], ["^İY KG", "İY KG Var / Yok – hepsi"], ["^İY/MS", "İY/MS – hepsi"], ["^İY skoru", "İY skoru – hepsi"]]],
  ["Maç sonucu (MS)", ["MS 1", "MS X", "MS 2"]],
  ["İlk yarı sonucu (İY)", ["İY 1", "İY X", "İY 2"]],
  ["Alt / Üst (maç)", [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].flatMap((x) => [x.toFixed(1) + " Üst", x.toFixed(1) + " Alt"])],
  ["İY Alt / Üst", [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].flatMap((x) => ["İY " + x.toFixed(1) + " Üst", "İY " + x.toFixed(1) + " Alt"])],
  ["Karşılıklı gol", ["KG Var", "KG Yok", "İY KG Var", "İY KG Yok"]],
  ["İY/MS", ["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"].map((x) => "İY/MS " + x)],
  ["İY skoru", ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "2-2"].map((x) => "İY skoru " + x)],
];
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const MK_OPTS = `<option value="">Hepsi</option>` + MK_GROUPS.map(([g, xs]) => `<optgroup label="${g}">` +
  xs.map((x) => Array.isArray(x) ? `<option value="${esc(x[0])}">${esc(x[1])}</option>` : `<option value="^${esc(reEsc(x))}$">${esc(x)}</option>`).join("") + `</optgroup>`).join("");
function renderTutan() {
  const el = $("#tab-tutan");
  if (!el.innerHTML) {
    el.innerHTML = `<p class="note">Sonuçlanmış iddaa maçlarında aynı seçim ve aynı orandan (ör. 3.5 Üst 1.88) kaç maç oynandığını ve kaçının tuttuğunu bir arada gösterir. Satıra tıklayınca o oranda tutan maçlar listelenir. Oran, iddaa'nın maç öncesi son oranıdır.</p>
      <div class="filters"><label>Oran <input id="t-odd" type="text" inputmode="decimal" placeholder="örn. 1.88 (boş = hepsi)" style="width:150px"></label>
      <label>Hassasiyet <select id="t-tol"><option value="0">Tam bu oran</option><option value="0.05">± 0.05</option><option value="0.10">± 0.10</option></select></label>
      <label>Market <select id="t-mk">${MK_OPTS}</select></label>
      <label>Zaman <select id="t-day"><option value="7">Son 7 gün</option><option value="14">Son 14 gün</option><option value="30" selected>Son 30 gün</option></select></label>
      <label>En az maç <select id="t-min"><option value="1">1</option><option value="3" selected>3</option><option value="5">5</option><option value="10">10</option></select></label>
      <button id="t-go">Göster</button></div><div id="t-res"></div><div id="t-det"></div>`;
  }
  runTutan();
}
function runTutan() {
  const res = $("#t-res");
  if (!res) return;
  if (!ORAN) { res.innerHTML = `<p class="note">Veri yükleniyor...</p>`; return; }
  const v = parseFloat(String($("#t-odd").value).replace(",", ".")), tol = +$("#t-tol").value + 0.001;
  const mk = $("#t-mk").value ? new RegExp($("#t-mk").value) : null, min = +$("#t-min").value;
  const cut = Date.now() / 1000 - +$("#t-day").value * 86400;
  const g = new Map();
  for (const m of ORAN.matches) {
    if (m[0] < cut) continue;
    for (const [k, o, r] of m[6]) {
      if (v > 1 && Math.abs(o - v) > tol) continue;
      const lab = ORAN.labels[k] || k;
      if (mk && !mk.test(lab)) continue;
      const id = lab + "|" + o;
      if (!g.has(id)) g.set(id, { lab, o, n: 0, w: [] });
      const x = g.get(id); x.n++; if (r) x.w.push(m);
    }
  }
  TG = [...g.values()].filter((x) => x.n >= min && x.w.length).sort((a, b) => b.w.length / b.n - a.w.length / a.n || b.n - a.n);
  const all = TG.length;
  TG = TG.slice(0, 300);
  let h = `<p class="note"><b>${all}</b> seçim / oran grubunda tutan maç var${all > 300 ? " (tutma oranı en yüksek 300 grup gösteriliyor)" : ""}. Tutma oranı en yüksekten düşüğe sıralı. Son güncelleme: ${fmtT(ORAN.updated)}</p>`;
  if (TG.length) {
    h += `<div class="scroll"><table><tr><th class="l">Seçim</th><th>Oran</th><th>Oynanan maç</th><th>Tutan maç</th><th>Tutma oranı</th><th>Oranın ima ettiği</th></tr>`;
    TG.forEach((x, i) => { const r = (x.w.length / x.n) * 100, imp = 100 / x.o;
      h += `<tr data-tg="${i}" style="cursor:pointer"><td class="l"><b>${esc(x.lab)}</b></td><td>${x.o.toFixed(2)}</td><td>${x.n}</td><td>${x.w.length}</td><td class="${r >= imp ? "pos" : "neg"}">%${f1(r)}</td><td>%${f1(imp)}</td></tr>`; });
    h += `</table></div>`;
  }
  if (v > 1) h = tutanBulten(v, tol, mk, g) + h;
  if (!TG.length) h += `<p class="note">Bu filtrelerle tutan maç bulunamadı. Hassasiyeti ± 0.05 / ± 0.10 yapmayı, "En az maç" sayısını düşürmeyi veya Zaman'ı uzatmayı deneyin.</p>`;
  res.innerHTML = h; $("#t-det").innerHTML = "";
}
// Yazılan oran (ve market) bültende hangi maçlarda var; yanında aynı seçim + oranın geçmişi
function tutanBulten(v, tol, mk, g) {
  if (!BULTEN) return `<p class="note">Bülten yükleniyor...</p>`;
  const now = Date.now() / 1000, rows = [];
  for (const m of BULTEN.matches) {
    if (m.ts < now) continue;
    for (const [lab, o, p, ext] of m.o) if (Math.abs(o - v) <= tol && (!mk || mk.test(lab))) rows.push({ m, lab, o, p, ext, x: g.get(lab + "|" + o) });
  }
  rows.sort((a, b) => (b.p || 0) - (a.p || 0) || a.m.ts - b.m.ts);
  let h = `<h2>Bültende bu oranda olan maçlar <span class="note">(önümüzdeki 36 saat, tutma olasılığı en yüksekten düşüğe)</span></h2><p class="note"><b>${rows.length}</b> seçim, ${new Set(rows.map((r) => r.m.id)).size} maç. "Geçmişte" sütunu: son ${$("#t-day").value} günde aynı seçim ve aynı oranda tutan / oynanan maç sayısı. Bülten güncellemesi: ${fmtT(BULTEN.updated)}</p>`;
  if (rows.length) {
    h += `<div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th class="l">Seçim</th><th>Oran</th><th>Tutma olasılığı</th><th>Geçmişte (tutan / oynanan)</th><th>Kaynak</th></tr>`;
    for (const r of rows) {
      const x = r.x, i = x ? TG.indexOf(x) : -1;
      const hist = x ? `${x.w.length} / ${x.n} <span class="note">(%${f1((x.w.length / x.n) * 100)})</span>` : "-";
      h += `<tr${i >= 0 ? ` data-tg="${i}" style="cursor:pointer"` : ""}><td>${fmtT(r.m.ts)}</td><td class="l">${esc(r.m.lg)}</td><td class="l">${esc(r.m.h)} - ${esc(r.m.a)}</td><td class="l"><b>${esc(r.lab)}</b></td><td>${r.o.toFixed(2)}</td><td>${r.p ? `%${f1(r.p * 100)}` : "-"}</td><td>${hist}</td><td>${r.ext ? "Bet365/WH" : "iddaa"}</td></tr>`;
    }
    h += `</table></div>`;
  }
  return h + `<h2>Geçmişte bu oranda tutan maçlar</h2>`;
}
// ---------- günlük tutan oranlar ----------
let GG = [];
const dayKey = (ts) => new Date(ts * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
function renderGunluk() {
  const el = $("#tab-gunluk");
  if (!ORAN) { el.innerHTML = `<p class="note">Veri yükleniyor...</p>`; return; }
  if (!$("#g-day")) {
    const days = new Map();
    for (const m of ORAN.matches) { const k = dayKey(m[0]); if (!days.has(k)) days.set(k, [m[0], 0]); days.get(k)[1]++; }
    const ds = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    el.innerHTML = `<p class="note">Hangi gün hangi seçimin hangi oranda tuttuğunu gösterir (tüm marketler; ör. Salı · 1.5 Üst 1.88 · İY/MS 1/2 25.00). Sonuçlanmış iddaa maçları, iddaa'nın maç öncesi son oranı. Satıra tıklayınca o gün o oranda tutan maçlar listelenir.</p>
      <div class="filters"><label>Gün <select id="g-day"><option value="7">Son 7 gün (gün gün)</option>${ds.map(([k, [ts, n]]) => `<option value="${k}">${TRDAY(ts)} (${n} maç)</option>`).join("")}</select></label>
      <label>Market <select id="g-mk">${MK_OPTS}</select></label>
      <label>En düşük oran <input id="g-min" type="text" inputmode="decimal" placeholder="örn. 1,50 (boş = hepsi)" style="width:150px"></label>
      <label>Sıralama <select id="g-sort"><option value="odd">Oran (yüksekten düşüğe)</option><option value="n">Tutan maç sayısı</option><option value="lab">Market</option></select></label></div>
      <div id="g-res"></div>`;
    if (ds.length) $("#g-day").value = ds[0][0];
  }
  runGunluk();
}
function runGunluk() {
  const res = $("#g-res");
  if (!res || !ORAN) return;
  const dv = $("#g-day").value, mk = $("#g-mk").value ? new RegExp($("#g-mk").value) : null;
  const min = parseFloat(String($("#g-min").value).replace(",", ".")) || 0, so = $("#g-sort").value;
  let days = [...new Set(ORAN.matches.map((m) => dayKey(m[0])))].sort().reverse();
  days = dv === "7" ? days.slice(0, 7) : [dv];
  const LIM = dv === "7" ? 60 : 400;
  GG = [];
  let h = `<p class="note">Son güncelleme: ${fmtT(ORAN.updated)}</p>`;
  for (const d of days) {
    const g = new Map(), ms = ORAN.matches.filter((m) => dayKey(m[0]) === d);
    for (const m of ms) for (const [k, o, r] of m[6]) {
      if (o < min) continue;
      const lab = ORAN.labels[k] || k;
      if (mk && !mk.test(lab)) continue;
      const id = lab + "|" + o;
      if (!g.has(id)) g.set(id, { lab, o, n: 0, w: [] });
      const x = g.get(id); x.n++; if (r) x.w.push(m);
    }
    let rows = [...g.values()].filter((x) => x.w.length);
    rows.sort(so === "n" ? (a, b) => b.w.length - a.w.length || b.o - a.o : so === "lab" ? (a, b) => a.lab.localeCompare(b.lab, "tr") || b.o - a.o : (a, b) => b.o - a.o || b.w.length - a.w.length);
    const tot = rows.length; rows = rows.slice(0, LIM);
    h += `<h2>${ms.length ? TRDAY(ms[0][0]) : d} <span class="note">(${ms.length} maç · ${tot} seçim / oran tuttu${tot > LIM ? `, ilk ${LIM} gösteriliyor` : ""})</span></h2>`;
    if (!rows.length) { h += `<p class="note">Bu filtrelerle tutan oran yok.</p>`; continue; }
    h += `<div class="scroll"><table><tr><th class="l">Seçim</th><th>Oran</th><th>Tutan maç</th><th>O gün bu oranda oynanan</th><th class="l">Tutan maçlar</th></tr>`;
    for (const x of rows) {
      const i = GG.push(x) - 1, names = x.w.slice(0, 3).map((m) => `${esc(m[2])} - ${esc(m[3])} <span class="note">(${m[4]} / ${m[5]})</span>`).join(", ");
      h += `<tr data-gg="${i}" style="cursor:pointer"><td class="l"><b>${esc(x.lab)}</b></td><td><b>${x.o.toFixed(2)}</b></td><td>${x.w.length}</td><td>${x.n}</td><td class="l">${names}${x.w.length > 3 ? ` <span class="note">+${x.w.length - 3}</span>` : ""}</td></tr>`;
      h += `<tr class="gg-d" id="gg-${i}" style="display:none"><td colspan="5" class="l">${x.w.map((m) => `${fmtT(m[0])} · ${esc(m[1])} · <b>${esc(m[2])} - ${esc(m[3])}</b> · İY ${m[4]} / MS ${m[5]}`).join("<br>")}</td></tr>`;
    }
    h += `</table></div>`;
  }
  res.innerHTML = h;
}
function tutanDetail(i) {
  const x = TG[i]; if (!x) return;
  let h = `<h2>${esc(x.lab)} ${x.o.toFixed(2)}: tutan ${x.w.length} maç <span class="note">(${x.n} maçtan)</span></h2><div class="scroll"><table><tr><th>Saat</th><th class="l">Lig</th><th class="l">Maç</th><th>Skor (İY / MS)</th></tr>`;
  for (const m of x.w) h += `<tr><td>${fmtT(m[0])}</td><td class="l">${esc(m[1])}</td><td class="l">${esc(m[2])} - ${esc(m[3])}</td><td>${m[4]} / ${m[5]} <span class="pos">✓</span></td></tr>`;
  $("#t-det").innerHTML = h + "</table></div>";
  $("#t-det").scrollIntoView({ behavior: "smooth" });
}

// ---------- filtre & olaylar ----------
function applyFilters() {
  const src = $("#f-src").value, days = +$("#f-days").value, lg = $("#f-lg").value;
  const cut = Date.now() / 1000 - days * 86400;
  const bySrc = ALL.filter((m) => m.src === src && m.ts >= cut);
  const leagues = [...new Set(bySrc.map((m) => m.lg))].sort();
  const sel = $("#f-lg");
  sel.innerHTML = `<option value="">Tüm ligler (${leagues.length})</option>` + leagues.map((l) => `<option ${l === lg ? "selected" : ""}>${esc(l)}</option>`).join("");
  VIEW = bySrc.filter((m) => !lg || m.lg === lg);
  $("#f-count").textContent = `${VIEW.length} maç analiz ediliyor`;
  renderAll();
}
function renderAll() {
  if (!VIEW.length) {
    const msg = `<p class="note">Bu filtrede maç yok.${$("#f-src").value === "iddaa" ? " iddaa oranları bu uygulama çalıştıkça birikir; ilk günlerde az veri olması normaldir." : ""}</p>`;
    ["ozet", "ust", "iy", "iyms", "liste"].forEach((t) => ($("#tab-" + t).innerHTML = msg));
    renderKupon(); renderSkor();
    return;
  }
  renderOzet(); renderUst(); renderIy(); renderIyms(); renderListe(); renderKupon(); renderSkor();
}

function showTab(t) {
  if (!document.getElementById("tab-" + t)) return;
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x.dataset.tab === t));
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.id === "tab-" + t));
}
if (location.hash) showTab(location.hash.slice(1));

document.addEventListener("click", (e) => {
  const b = e.target;
  if (b.dataset.tab) { showTab(b.dataset.tab); history.replaceState(null, "", "#" + b.dataset.tab); } else if (b.dataset.ust) { state.ustLine = b.dataset.ust; state.ustGroup = "line"; renderUst(); }
  else if (b.dataset.iy) { state.iyLine = b.dataset.iy; state.iyGroup = "line"; renderIy(); }
  else if (b.dataset.iyms) { state.iymsT = b.dataset.iyms; renderIyms(); }
  else if (b.id === "more") { state.listN += 300; renderListe(); }
  else if (b.id === "a-go") runAra();
  else if (b.id === "a-pgo") runAraP();
  else if (b.id === "t-go") runTutan();
  else if (b.closest && b.closest("[data-gg]")) { const d = $("#gg-" + b.closest("[data-gg]").dataset.gg); d.style.display = d.style.display === "none" ? "" : "none"; }
  else if (b.closest && b.closest("[data-tg]")) tutanDetail(+b.closest("[data-tg]").dataset.tg);
});
document.addEventListener("change", (e) => {
  const id = e.target.id;
  if (id === "a-prob" || id === "a-ptol") { if ($("#a-prob").value) runAraP(); }
  else if (id === "a-odd" || id === "a-tol") { if ($("#a-odd").value) runAra(); }
  else if (id.startsWith("a-")) { if (araMode === "prob" && $("#a-prob").value) runAraP(); else if ($("#a-odd").value) runAra(); }
  else if (id.startsWith("t-")) runTutan();
  else if (id.startsWith("g-") && !["g-ust", "g-iy", "g-iyms"].includes(id)) runGunluk();
  else if (id.startsWith("f-")) { state.listN = 200; applyFilters(); }
  else if (id === "g-ust") { state.ustGroup = e.target.value; renderUst(); }
  else if (id === "g-iy") { state.iyGroup = e.target.value; renderIy(); }
  else if (id === "g-iyms") { state.iymsGroup = e.target.value; renderIyms(); }
  else if (id === "lf") { state.lf = e.target.value; state.listN = 200; renderListe(); }
});
let qT;
document.addEventListener("input", (e) => {
  if (e.target.id === "a-odd") return;
  if (e.target.id !== "q") return;
  clearTimeout(qT);
  qT = setTimeout(() => { state.q = e.target.value; renderListe(); const q = $("#q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250);
});

fetch("data/matches.json?" + Date.now()).then((r) => r.json()).then((d) => {
  ALL = d.rows.map((r) => Object.fromEntries(d.cols.map((c, i) => [c, r[i]])));
  const fs = ALL.filter((m) => m.src === "fs").length, id = ALL.length - fs;
  $("#meta").textContent = `Son güncelleme: ${new Date(d.updated * 1000).toLocaleString("tr-TR")} · Bet365 / William Hill: ${fs} maç · iddaa: ${id} maç`;
  applyFilters();
}).catch(() => { $("#meta").textContent = "Veri yüklenemedi (data/matches.json)"; });
fetch("data/skorlar.json?" + Date.now())
  .then((r) => r.json())
  .then((d) => { SKOR = d; renderSkor(); })
  .catch(() => { SKOR = { matches: [] }; renderSkor(); });
fetch("data/kuponlar.json?" + Date.now()).then((r) => r.json()).then((d) => { KUPON = d; renderKupon(); })
  .catch(() => { KUPON = { coupons: [], updated: 0 }; renderKupon(); });
renderAra();
renderTutan();
fetch("data/oranlar.json?" + Date.now()).then((r) => r.json()).then((d) => { ORAN = d; runTutan(); renderGunluk(); })
  .catch(() => { ORAN = { matches: [], labels: {}, updated: 0 }; runTutan(); renderGunluk(); });
document.addEventListener("keydown", (e) => { if (e.target.id === "t-odd" && e.key === "Enter") runTutan(); else if (e.target.id === "a-odd" && e.key === "Enter") runAra(); else if (e.target.id === "a-prob" && e.key === "Enter") runAraP(); });
fetch("data/bulten.json?" + Date.now()).then((r) => r.json()).then((d) => { BULTEN = d; if ($("#t-res") && $("#t-odd").value) runTutan(); })
  .catch(() => { BULTEN = { matches: [], updated: 0 }; });
