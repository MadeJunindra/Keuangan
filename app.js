'use strict';

const STORE_KEY = 'keuangan.v1';
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
    ['lainnya-out', '📦', 'Lainnya'],
  ],
  in: [
    ['gaji', '💼', 'Gaji'],
    ['usaha', '🏪', 'Usaha'],
    ['bonus', '🎁', 'Bonus / Hadiah'],
    ['lainnya-in', '💰', 'Lainnya'],
  ],
};
const CAT_MAP = Object.fromEntries(
  [...CATEGORIES.out, ...CATEGORIES.in].map(([id, icon, name]) => [id, { icon, name }])
);

const $ = (s) => document.querySelector(s);
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const fmt = (n) => rupiah.format(n).replace(/\s/g, '');
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

let txs = load();
let view = new Date(); view.setDate(1);
let editingId = null;

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(txs)); }
  catch { toast('Gagal menyimpan data'); }
}
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

function render() {
  const key = monthKey(view);
  $('#monthLabel').textContent = monthFmt.format(view);
  const monthTx = txs.filter((t) => t.date.startsWith(key));

  const totalIn = monthTx.filter((t) => t.type === 'in').reduce((a, t) => a + t.amount, 0);
  const totalOut = monthTx.filter((t) => t.type === 'out').reduce((a, t) => a + t.amount, 0);
  $('#totalIn').textContent = fmt(totalIn);
  $('#totalOut').textContent = fmt(totalOut);
  $('#balance').textContent = fmt(totalIn - totalOut);
  $('#balance').style.color = totalIn - totalOut < 0 ? 'var(--out)' : '';

  // Breakdown pengeluaran per kategori
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

  // Daftar transaksi, dikelompokkan per tanggal
  const q = $('#search').value.trim().toLowerCase();
  const shown = monthTx
    .filter((t) => !q || t.note.toLowerCase().includes(q) || (CAT_MAP[t.category]?.name || '').toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);

  let html = '', lastDay = '';
  for (const t of shown) {
    if (t.date !== lastDay) {
      lastDay = t.date;
      html += `<li class="day">${dayFmt.format(new Date(t.date + 'T00:00'))}</li>`;
    }
    const cat = CAT_MAP[t.category] || { icon: '•', name: t.category };
    html += `<li class="tx" data-id="${t.id}" tabindex="0">
      <span class="ico">${cat.icon}</span>
      <span class="info"><b>${esc(cat.name)}</b>${t.note ? `<small>${esc(t.note)}</small>` : ''}</span>
      <span class="amt ${t.type}">${t.type === 'in' ? '+' : '−'}${fmt(t.amount)}</span></li>`;
  }
  $('#list').innerHTML = html;
  $('#empty').hidden = shown.length > 0;
  $('#empty').textContent = q ? 'Tidak ada yang cocok.' : 'Belum ada transaksi bulan ini.';
}

// ---- Form ----
function fillCategories(type, selected) {
  $('#category').innerHTML = CATEGORIES[type]
    .map(([id, icon, name]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${icon} ${name}</option>`)
    .join('');
}
function openForm(tx) {
  editingId = tx ? tx.id : null;
  const type = tx ? tx.type : 'out';
  $('#formTitle').textContent = tx ? 'Ubah transaksi' : 'Tambah transaksi';
  document.querySelector(`input[name="type"][value="${type}"]`).checked = true;
  fillCategories(type, tx?.category);
  $('#amount').value = tx ? tx.amount.toLocaleString('id-ID') : '';
  $('#date').value = tx ? tx.date : (monthKey(view) === monthKey(new Date()) ? todayISO() : `${monthKey(view)}-01`);
  $('#note').value = tx ? tx.note : '';
  $('#deleteBtn').hidden = !tx;
  $('#dialog').showModal();
  if (!tx) $('#amount').focus();
}

document.querySelectorAll('input[name="type"]').forEach((r) =>
  r.addEventListener('change', () => fillCategories(r.value)));

$('#amount').addEventListener('input', (e) => {
  const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
  e.target.value = digits ? Number(digits).toLocaleString('id-ID') : '';
});

$('#form').addEventListener('submit', (e) => {
  const amount = Number($('#amount').value.replace(/\D/g, ''));
  if (!amount) { e.preventDefault(); toast('Isi jumlahnya dulu'); $('#amount').focus(); return; }
  const data = {
    type: document.querySelector('input[name="type"]:checked').value,
    amount,
    category: $('#category').value,
    date: $('#date').value,
    note: $('#note').value.trim(),
  };
  if (editingId) {
    Object.assign(txs.find((t) => t.id === editingId), data);
    toast('Transaksi diperbarui');
  } else {
    txs.push({ id: crypto.randomUUID?.() || String(Date.now() + Math.random()), created: Date.now(), ...data });
    toast('Transaksi disimpan');
  }
  save();
  // Pindah ke bulan transaksi supaya langsung terlihat
  const d = new Date(data.date + 'T00:00'); view = new Date(d.getFullYear(), d.getMonth(), 1);
  render();
});

$('#cancelBtn').addEventListener('click', () => $('#dialog').close());
$('#deleteBtn').addEventListener('click', () => {
  if (!confirm('Hapus transaksi ini?')) return;
  txs = txs.filter((t) => t.id !== editingId);
  save(); render(); $('#dialog').close(); toast('Transaksi dihapus');
});

$('#addBtn').addEventListener('click', () => openForm());
$('#list').addEventListener('click', (e) => {
  const li = e.target.closest('.tx'); if (li) openForm(txs.find((t) => t.id === li.dataset.id));
});
$('#list').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.closest('.tx')?.click();
});

$('#prevMonth').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
$('#nextMonth').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
$('#search').addEventListener('input', render);

// ---- Ekspor / Impor ----
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#exportBtn').addEventListener('click', () =>
  download(`keuangan-${todayISO()}.json`, JSON.stringify(txs, null, 2), 'application/json'));
$('#exportCsvBtn').addEventListener('click', () => {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Catatan'].join(',')];
  [...txs].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) =>
    lines.push([t.date, t.type === 'in' ? 'Pemasukan' : 'Pengeluaran', q(CAT_MAP[t.category]?.name || t.category), t.amount, q(t.note)].join(',')));
  download(`keuangan-${todayISO()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
});
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw 0;
    const valid = data.filter((t) => t && t.id && (t.type === 'in' || t.type === 'out') &&
      Number.isFinite(t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
    const ids = new Set(txs.map((t) => t.id));
    const added = valid.filter((t) => !ids.has(t.id)).map((t) => ({ note: '', created: Date.now(), ...t }));
    txs.push(...added); save(); render();
    toast(`${added.length} transaksi diimpor`);
  } catch { toast('File tidak valid'); }
  e.target.value = '';
});

// ---- PWA: service worker & tombol pasang ----
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
