'use strict';

const STORE_KEY = 'keuangan.v1';          // transaksi
const ACC_KEY = 'keuangan.accounts.v1';   // rekening
const COLORS = ['#7c3aed', '#2563eb', '#ea580c', '#0d9488', '#ca8a04', '#db2777', '#4b5563'];

const CATEGORIES = {
  out: [
    ['makan', '🍜', 'Makan & Minum'],
    ['transport', '🛵', 'Transportasi'],
    ['belanja', '🛒', 'Belanja'],
    ['tagihan', '💡', 'Tagihan'],
    ['pulsa', '📱', 'Pulsa & Internet'],
    ['kesehatan', '💊', 'Kesehatan'],
    ['hiburan', '🎬', 'Hiburan'],
    ['pendidikan', '📚', 'Pendidikan'],
    ['darurat', '🚨', 'Keperluan Darurat'],
    ['lainnya-out', '📦', 'Lainnya'],
  ],
  in: [
    ['gaji', '💼', 'Gaji'],
    ['usaha', '🏪', 'Usaha'],
    ['bonus', '🎁', 'Bonus / Hadiah'],
    ['bunga', '🏦', 'Bunga Bank'],
    ['lainnya-in', '💰', 'Lainnya'],
  ],
};
const CAT_MAP = Object.fromEntries(
  [...CATEGORIES.out, ...CATEGORIES.in].map(([id, icon, name]) => [id, { icon, name }])
);

const DEFAULT_ACCOUNTS = [
  { id: 'payroll', name: 'Payroll', bank: 'Bank Ganesha', purpose: 'Tempat gaji masuk', payroll: true, color: COLORS[0] },
  { id: 'darurat', name: 'Dana Darurat', bank: 'BCA', purpose: 'Hanya dipakai saat darurat', color: COLORS[1] },
  { id: 'tahunan', name: 'Tabungan 1 Tahun', bank: 'BRI', purpose: 'Untuk kebutuhan 1 tahun ke depan', color: COLORS[2] },
  { id: 'belanja', name: 'Belanja Bulanan', bank: 'BNI', purpose: 'Kebutuhan belanja sebulan', color: COLORS[3] },
  { id: 'bebas', name: 'Serba Guna', bank: 'Bank Mandiri', purpose: 'Untuk apa saja', color: COLORS[4] },
].map((a) => ({ initial: 0, target: 0, monthly: 0, payroll: false, ...a }));

const $ = (s) => document.querySelector(s);
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const fmt = (n) => rupiah.format(n).replace(/\s/g, '');
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const uid = () => crypto.randomUUID?.() || String(Date.now() + Math.random());
const num = (s) => Number(String(s).replace(/\D/g, '')) || 0;
const money = (n) => (n ? Number(n).toLocaleString('id-ID') : '');

let accounts = loadJSON(ACC_KEY) || structuredClone(DEFAULT_ACCOUNTS);
let txs = loadJSON(STORE_KEY) || [];
migrate();
let view = new Date(); view.setDate(1);
let filterAcc = 'all';
let editingId = null;
let editingAccId = null;

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(txs));
    localStorage.setItem(ACC_KEY, JSON.stringify(accounts));
  } catch { toast('Gagal menyimpan data'); }
}
// Transaksi dari versi lama belum punya rekening: masukkan ke rekening payroll.
function migrate() {
  if (!accounts.length) accounts = structuredClone(DEFAULT_ACCOUNTS);
  const fallback = payrollAcc().id;
  let changed = false;
  txs.forEach((t) => { if (!t.account || !accById(t.account)) { t.account = fallback; changed = true; } });
  if (changed || !localStorage.getItem(ACC_KEY)) save();
}
function accById(id) { return accounts.find((a) => a.id === id); }
function payrollAcc() { return accounts.find((a) => a.payroll) || accounts[0]; }

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

// Saldo setiap rekening = saldo awal + masuk − keluar ± transfer
function balances() {
  const bal = Object.fromEntries(accounts.map((a) => [a.id, a.initial || 0]));
  for (const t of txs) {
    if (t.type === 'in') bal[t.account] += t.amount;
    else if (t.type === 'out') bal[t.account] -= t.amount;
    else if (t.type === 'transfer') { bal[t.account] -= t.amount; bal[t.to] += t.amount; }
  }
  return bal;
}
// Uang yang masuk ke rekening pada bulan tertentu (gaji/transfer masuk)
function depositsInMonth(accId, key) {
  return txs.filter((t) => t.date.startsWith(key) &&
    ((t.type === 'transfer' && t.to === accId) || (t.type === 'in' && t.account === accId)))
    .reduce((a, t) => a + t.amount, 0);
}

// ---------- Render ----------
function render() {
  const key = monthKey(view);
  const bal = balances();

  // Rekening
  $('#totalBalance').textContent = fmt(Object.values(bal).reduce((a, b) => a + b, 0));
  $('#accounts').innerHTML = accounts.map((a) => {
    const b = bal[a.id];
    const pct = a.target ? Math.min(100, Math.max(0, Math.round((b / a.target) * 100))) : 0;
    const dep = depositsInMonth(a.id, key);
    return `<button class="acc" data-acc="${a.id}" style="--c:${a.color}">
      <div class="acc-top">
        <span class="acc-name">${esc(a.name)}${a.payroll ? '<span class="badge">Payroll</span>' : ''}</span>
        <span class="acc-bal ${b < 0 ? 'neg' : ''}">${fmt(b)}</span>
      </div>
      <div class="acc-sub">${esc([a.bank, a.purpose].filter(Boolean).join(' · '))}</div>
      ${a.target ? `<div class="bar"><i style="width:${pct}%"></i></div>
        <div class="acc-meta"><span>Target ${fmt(a.target)}</span><span>${pct}%${b < a.target ? ` · kurang ${fmt(a.target - b)}` : ' · tercapai 🎉'}</span></div>` : ''}
      ${a.monthly ? `<div class="acc-meta"><span>Setoran ${monthFmt.format(view)}</span><span>${fmt(dep)} / ${fmt(a.monthly)}${dep >= a.monthly ? ' ✓' : ''}</span></div>` : ''}
    </button>`;
  }).join('');

  // Ringkasan bulan (transfer tidak dihitung)
  $('#monthLabel').textContent = monthFmt.format(view);
  const monthTx = txs.filter((t) => t.date.startsWith(key));
  const totalIn = monthTx.filter((t) => t.type === 'in').reduce((a, t) => a + t.amount, 0);
  const totalOut = monthTx.filter((t) => t.type === 'out').reduce((a, t) => a + t.amount, 0);
  $('#totalIn').textContent = fmt(totalIn);
  $('#totalOut').textContent = fmt(totalOut);
  $('#net').textContent = fmt(totalIn - totalOut);
  $('#net').style.color = totalIn - totalOut < 0 ? 'var(--out)' : '';

  const byCat = {};
  monthTx.filter((t) => t.type === 'out').forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('#breakdown').innerHTML = rows.length
    ? rows.map(([c, v]) => {
        const cat = CAT_MAP[c] || { icon: '•', name: c };
        const pct = Math.round((v / totalOut) * 100);
        return `<div class="bar-row">
          <div class="bar-label"><span>${cat.icon} ${esc(cat.name)}</span><span>${fmt(v)} · ${pct}%</span></div>
          <div class="bar"><i style="width:${pct}%"></i></div></div>`;
      }).join('')
    : '<p class="empty">Belum ada pengeluaran.</p>';

  // Filter rekening
  if (filterAcc !== 'all' && !accById(filterAcc)) filterAcc = 'all';
  $('#chips').innerHTML = [['all', 'Semua'], ...accounts.map((a) => [a.id, a.name])]
    .map(([id, name]) => `<button role="tab" data-filter="${id}" aria-selected="${id === filterAcc}">${esc(name)}</button>`).join('');

  // Daftar transaksi
  const q = $('#search').value.trim().toLowerCase();
  const shown = monthTx
    .filter((t) => filterAcc === 'all' || t.account === filterAcc || t.to === filterAcc)
    .filter((t) => !q || txText(t).toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);

  let html = '', lastDay = '';
  for (const t of shown) {
    if (t.date !== lastDay) {
      lastDay = t.date;
      html += `<li class="day">${dayFmt.format(new Date(t.date + 'T00:00'))}</li>`;
    }
    html += txRow(t);
  }
  $('#list').innerHTML = html;
  $('#empty').hidden = shown.length > 0;
  $('#empty').textContent = q ? 'Tidak ada yang cocok.' : 'Belum ada transaksi bulan ini.';
}

function txText(t) {
  const acc = accById(t.account)?.name || '';
  if (t.type === 'transfer') return `Transfer ${acc} ${accById(t.to)?.name || ''} ${t.note}`;
  return `${CAT_MAP[t.category]?.name || ''} ${acc} ${t.note}`;
}
function txRow(t) {
  const acc = accById(t.account) || { name: '?', color: '#999' };
  const tag = (a) => `<span class="acc-tag"><i class="dot" style="--c:${a.color}"></i>${esc(a.name)}</span>`;
  let icon, title, sub, sign, cls = t.type;
  if (t.type === 'transfer') {
    const to = accById(t.to) || { name: '?', color: '#999' };
    icon = '🔁'; title = `Ke ${esc(to.name)}`;
    sub = `dari ${tag(acc)}`;
    // Saat difilter per rekening, tunjukkan arah uangnya
    if (filterAcc === t.to) { sign = '+'; cls = 'in'; }
    else if (filterAcc === t.account) { sign = '−'; cls = 'out'; }
    else sign = '';
  } else {
    const cat = CAT_MAP[t.category] || { icon: '•', name: t.category };
    icon = cat.icon; title = esc(cat.name); sub = tag(acc);
    sign = t.type === 'in' ? '+' : '−';
  }
  if (t.note) sub += ` · ${esc(t.note)}`;
  return `<li class="tx" data-id="${t.id}" tabindex="0">
    <span class="ico">${icon}</span>
    <span class="info"><b>${title}</b><small>${sub}</small></span>
    <span class="amt ${cls}">${sign}${fmt(t.amount)}</span></li>`;
}

// ---------- Form transaksi ----------
function accOptions(sel, selected, exclude) {
  sel.innerHTML = accounts.filter((a) => a.id !== exclude)
    .map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}${a.bank ? ` (${esc(a.bank)})` : ''}</option>`).join('');
}
function currentType() { return document.querySelector('input[name="type"]:checked').value; }
function applyType(type, tx) {
  const isTr = type === 'transfer';
  $('#categoryWrap').hidden = isTr;
  $('#toWrap').hidden = !isTr;
  $('#accountLabel').textContent = type === 'in' ? 'Masuk ke rekening' : 'Dari rekening';
  if (!isTr) {
    $('#category').innerHTML = CATEGORIES[type]
      .map(([id, icon, name]) => `<option value="${id}" ${id === tx?.category ? 'selected' : ''}>${icon} ${name}</option>`).join('');
  }
  const last = loadJSON('keuangan.last') || {};
  const from = tx?.account || (filterAcc !== 'all' ? filterAcc : null) ||
    last[type] || (type === 'out' ? (accById('belanja') || accounts[0]).id : payrollAcc().id);
  accOptions($('#account'), accById(from) ? from : accounts[0].id);
  if (isTr) {
    const to = tx?.to || accounts.find((a) => a.id !== $('#account').value)?.id;
    accOptions($('#toAccount'), to);
  }
}
function openForm(tx) {
  editingId = tx ? tx.id : null;
  const type = tx ? tx.type : 'out';
  $('#formTitle').textContent = tx ? 'Ubah transaksi' : 'Tambah transaksi';
  document.querySelector(`input[name="type"][value="${type}"]`).checked = true;
  applyType(type, tx);
  $('#amount').value = tx ? money(tx.amount) : '';
  $('#date').value = tx ? tx.date : (monthKey(view) === monthKey(new Date()) ? todayISO() : `${monthKey(view)}-01`);
  $('#note').value = tx ? tx.note : '';
  $('#deleteBtn').hidden = !tx;
  $('#dialog').showModal();
  if (!tx) $('#amount').focus();
}

document.querySelectorAll('input[name="type"]').forEach((r) =>
  r.addEventListener('change', () => applyType(r.value)));

// Format angka ribuan otomatis di semua kolom uang
document.addEventListener('input', (e) => {
  if (e.target.id === 'amount' || e.target.classList.contains('money')) {
    e.target.value = money(num(e.target.value));
    if (e.target.closest('#splitRows')) updateSplitTotal();
  }
});

$('#form').addEventListener('submit', (e) => {
  const amount = num($('#amount').value);
  const type = currentType();
  if (!amount) { e.preventDefault(); toast('Isi jumlahnya dulu'); $('#amount').focus(); return; }
  if (type === 'transfer' && $('#account').value === $('#toAccount').value) {
    e.preventDefault(); toast('Rekening asal dan tujuan harus berbeda'); return;
  }
  const data = {
    type, amount,
    account: $('#account').value,
    date: $('#date').value,
    note: $('#note').value.trim(),
  };
  if (type === 'transfer') { data.to = $('#toAccount').value; data.category = null; }
  else { data.category = $('#category').value; delete data.to; }

  if (editingId) {
    const t = txs.find((x) => x.id === editingId);
    delete t.to; Object.assign(t, data);
    toast('Transaksi diperbarui');
  } else {
    txs.push({ id: uid(), created: Date.now(), ...data });
    toast('Transaksi disimpan');
  }
  const last = loadJSON('keuangan.last') || {}; last[type] = data.account;
  try { localStorage.setItem('keuangan.last', JSON.stringify(last)); } catch {}
  save();
  const d = new Date(data.date + 'T00:00'); view = new Date(d.getFullYear(), d.getMonth(), 1);
  render();
});

$('#deleteBtn').addEventListener('click', () => {
  if (!confirm('Hapus transaksi ini?')) return;
  txs = txs.filter((t) => t.id !== editingId);
  save(); render(); $('#dialog').close(); toast('Transaksi dihapus');
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

$('#addBtn').addEventListener('click', () => openForm());
$('#list').addEventListener('click', (e) => {
  const li = e.target.closest('.tx'); if (li) openForm(txs.find((t) => t.id === li.dataset.id));
});
$('#list').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.closest('.tx')?.click(); });
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]'); if (b) { filterAcc = b.dataset.filter; render(); }
});

$('#prevMonth').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
$('#nextMonth').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
$('#search').addEventListener('input', render);

// ---------- Form rekening ----------
let pickedColor = COLORS[0];
function renderColors() {
  $('#accColors').innerHTML = COLORS.map((c) =>
    `<button type="button" style="--c:${c}" data-color="${c}" aria-label="Warna ${c}" aria-pressed="${c === pickedColor}"></button>`).join('');
}
$('#accColors').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]'); if (b) { pickedColor = b.dataset.color; renderColors(); }
});
function openAccForm(acc) {
  editingAccId = acc ? acc.id : null;
  $('#accTitle').textContent = acc ? 'Ubah rekening' : 'Tambah rekening';
  $('#accName').value = acc?.name || '';
  $('#accBank').value = acc?.bank || '';
  $('#accPurpose').value = acc?.purpose || '';
  $('#accInitial').value = money(acc?.initial);
  $('#accTarget').value = money(acc?.target);
  $('#accMonthly').value = money(acc?.monthly);
  $('#accPayroll').checked = !!acc?.payroll;
  pickedColor = acc?.color || COLORS[accounts.length % COLORS.length];
  renderColors();
  $('#accDeleteBtn').hidden = !acc || accounts.length <= 1;
  $('#accDialog').showModal();
}
$('#addAccountBtn').addEventListener('click', () => openAccForm());
$('#accounts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-acc]'); if (b) openAccForm(accById(b.dataset.acc));
});
$('#accForm').addEventListener('submit', (e) => {
  const name = $('#accName').value.trim();
  if (!name) { e.preventDefault(); toast('Isi nama rekening'); return; }
  const data = {
    name, bank: $('#accBank').value.trim(), purpose: $('#accPurpose').value.trim(),
    initial: num($('#accInitial').value), target: num($('#accTarget').value),
    monthly: num($('#accMonthly').value), payroll: $('#accPayroll').checked, color: pickedColor,
  };
  if (data.payroll) accounts.forEach((a) => { a.payroll = false; });
  if (editingAccId) Object.assign(accById(editingAccId), data);
  else accounts.push({ id: uid(), ...data });
  save(); render(); toast('Rekening disimpan');
});
$('#accDeleteBtn').addEventListener('click', () => {
  const used = txs.filter((t) => t.account === editingAccId || t.to === editingAccId).length;
  if (used) { alert(`Rekening ini masih dipakai di ${used} transaksi. Hapus atau pindahkan transaksinya dulu.`); return; }
  if (!confirm('Hapus rekening ini?')) return;
  accounts = accounts.filter((a) => a.id !== editingAccId);
  if (!accounts.some((a) => a.payroll)) accounts[0].payroll = true;
  save(); render(); $('#accDialog').close(); toast('Rekening dihapus');
});

// ---------- Bagi gaji ----------
function renderSplit() {
  const from = $('#splitFrom').value;
  const key = monthKey(new Date($('#splitDate').value + 'T00:00'));
  $('#splitAvail').textContent = `Saldo saat ini: ${fmt(balances()[from])}`;
  $('#splitRows').innerHTML = accounts.filter((a) => a.id !== from).map((a) => {
    // Kurangi setoran yang sudah masuk bulan ini supaya tidak dobel
    const left = Math.max(0, (a.monthly || 0) - depositsInMonth(a.id, key));
    return `<label class="split-row"><span>${esc(a.name)}<small>${esc(a.bank || '')}${a.monthly ? ` · rutin ${fmt(a.monthly)}` : ''}</small></span>
      <input class="money" inputmode="numeric" data-to="${a.id}" value="${money(left)}" placeholder="0"></label>`;
  }).join('');
  updateSplitTotal();
}
function updateSplitTotal() {
  const total = [...document.querySelectorAll('#splitRows input')].reduce((s, i) => s + num(i.value), 0);
  $('#splitTotal').textContent = fmt(total);
}
$('#splitBtn').addEventListener('click', () => {
  accOptions($('#splitFrom'), payrollAcc().id);
  $('#splitDate').value = todayISO();
  renderSplit();
  $('#splitDialog').showModal();
});
$('#splitFrom').addEventListener('change', renderSplit);
$('#splitDate').addEventListener('change', renderSplit);
$('#splitForm').addEventListener('submit', (e) => {
  const from = $('#splitFrom').value, date = $('#splitDate').value;
  const items = [...document.querySelectorAll('#splitRows input')]
    .map((i) => ({ to: i.dataset.to, amount: num(i.value) })).filter((x) => x.amount > 0);
  if (!items.length) { e.preventDefault(); toast('Isi minimal satu jumlah'); return; }
  const total = items.reduce((s, x) => s + x.amount, 0);
  if (total > balances()[from] && !confirm(`Total ${fmt(total)} lebih besar dari saldo rekening asal. Tetap simpan?`)) {
    e.preventDefault(); return;
  }
  const now = Date.now();
  items.forEach((x, i) => txs.push({
    id: uid(), created: now + i, type: 'transfer', account: from, to: x.to,
    amount: x.amount, category: null, date, note: 'Bagi gaji',
  }));
  save();
  const d = new Date(date + 'T00:00'); view = new Date(d.getFullYear(), d.getMonth(), 1);
  render(); toast(`${items.length} transfer dicatat`);
});

// ---------- Ekspor / Impor ----------
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#exportBtn').addEventListener('click', () =>
  download(`keuangan-${todayISO()}.json`, JSON.stringify({ version: 2, accounts, txs }, null, 2), 'application/json'));
$('#exportCsvBtn').addEventListener('click', () => {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const JENIS = { in: 'Pemasukan', out: 'Pengeluaran', transfer: 'Transfer' };
  const lines = [['Tanggal', 'Jenis', 'Rekening', 'Ke Rekening', 'Kategori', 'Jumlah', 'Catatan'].join(',')];
  [...txs].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => lines.push([
    t.date, JENIS[t.type], q(accById(t.account)?.name), q(t.to ? accById(t.to)?.name : ''),
    q(t.category ? CAT_MAP[t.category]?.name || t.category : ''), t.amount, q(t.note),
  ].join(',')));
  download(`keuangan-${todayISO()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
});
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const inTx = Array.isArray(data) ? data : data.txs;        // format lama = array
    if (!Array.isArray(inTx)) throw 0;
    let accAdded = 0;
    if (Array.isArray(data.accounts)) {
      data.accounts.filter((a) => a && a.id && a.name && !accById(a.id)).forEach((a) => {
        accounts.push({ initial: 0, target: 0, monthly: 0, color: COLORS[0], ...a, payroll: false }); accAdded++;
      });
    }
    const valid = inTx.filter((t) => t && t.id && ['in', 'out', 'transfer'].includes(t.type) &&
      Number.isFinite(t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && (t.type !== 'transfer' || accById(t.to)));
    const ids = new Set(txs.map((t) => t.id));
    const added = valid.filter((t) => !ids.has(t.id)).map((t) => ({ note: '', created: Date.now(), ...t }));
    txs.push(...added); migrate(); save(); render();
    toast(`${added.length} transaksi${accAdded ? ` & ${accAdded} rekening` : ''} diimpor`);
  } catch { toast('File tidak valid'); }
  e.target.value = '';
});

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
let installPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installPrompt = e; $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt(); await installPrompt.userChoice;
  installPrompt = null; $('#installBtn').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Aplikasi terpasang'); });

render();
