// Conexión con Google Apps Script. Sin API_URL corre en modo demo (datos solo en este navegador).
const DEMO = !window.API_URL;

async function api(action, payload = {}) {
  if (DEMO) return demoApi(action, payload);
  let res;
  try {
    // Sin Content-Type: el navegador envía text/plain y Apps Script lo acepta sin preflight CORS.
    res = await fetch(window.API_URL, { method: 'POST', body: JSON.stringify({ action, ...payload }) });
  } catch (err) {
    throw new Error('No se pudo conectar. Revisa tu internet e intenta de nuevo.');
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

// ---------- Utilidades compartidas ----------

const $ = (sel, root = document) => root.querySelector(sel);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const bs = n => 'Bs ' + Number(n).toLocaleString('es-BO', { maximumFractionDigits: 2 });

function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
}

// Reduce la foto en el teléfono antes de enviarla (las capturas pesan varios MB).
function readImage(file, { maxSide, type, quality }) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(type, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen. Prueba con otra captura.'));
    };
    img.src = url;
  });
}

if (DEMO) {
  document.addEventListener('DOMContentLoaded', () => {
    const banner = $('#demoBanner');
    if (banner != null) banner.hidden = false;
  });
}

// ---------- Modo demo (imita al backend) ----------

const DEMO_KEY = 'ei6040-demo';

function demoQr() {
  const n = 25;
  let cells = '';
  let seed = 7;
  const finder = (x, y) => `<path d="M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z" fill-rule="evenodd"/>`;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      seed = (seed * 16807) % 2147483647;
      if (!inFinder && seed % 2 === 0) cells += `M${x} ${y}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" width="400" height="400">`
    + `<rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/>`
    + `<path d="${cells}"/>${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}`
    + `<rect x="8.5" y="10.5" width="8" height="4" fill="#ff5b2e"/>`
    + `<text x="12.5" y="13.4" font-size="2.4" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">DEMO</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function demoState() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_KEY));
    if (saved != null) return saved;
  } catch (err) { /* sin almacenamiento: estado nuevo */ }
  return {
    config: {
      evento: 'Ensamble Inmediato: 60/40',
      fecha: 'Sábado 13 de diciembre · 20:00',
      lugar: 'Lugar por confirmar',
      info: '',
      modo_tiers: 'secuencial',
      max_por_persona: 10,
    },
    tiers: [
      { id: 'preventa-1', nombre: 'Preventa 1', precio: 50, cupo: 100, desde: '', hasta: '', activo: true },
      { id: 'preventa-2', nombre: 'Preventa 2', precio: 70, cupo: 150, desde: '', hasta: '', activo: true },
      { id: 'general', nombre: 'General', precio: 90, cupo: 200, desde: '', hasta: '', activo: true },
    ],
    regs: [],
    qr: demoQr(),
  };
}

function demoSave(s) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch (err) { /* sin almacenamiento */ }
}

function demoTiers(s) {
  const today = new Date().toLocaleDateString('en-CA');
  const sold = {};
  s.regs.forEach(r => {
    if (r.estado !== 'rechazado') sold[r.tier_id] = (sold[r.tier_id] ?? 0) + r.cantidad;
  });
  let open = false;
  return s.tiers.map(t => {
    const vendidas = sold[t.id] ?? 0;
    const quedan = Math.max(0, t.cupo - vendidas);
    let estado = 'disponible';
    if (!t.activo || (t.hasta !== '' && today > t.hasta)) estado = 'cerrado';
    else if (quedan === 0) estado = 'agotado';
    else if (t.desde !== '' && today < t.desde) estado = 'proximamente';
    else if (open && s.config.modo_tiers !== 'todos') estado = 'proximamente';
    if (estado === 'disponible') open = true;
    return { ...t, vendidas, quedan, estado };
  });
}

function demoApi(action, p) {
  const s = demoState();
  const isAdmin = !['public', 'register'].includes(action);
  if (isAdmin && p.password !== 'demo') throw new Error('Contraseña incorrecta (en modo demo es "demo").');

  switch (action) {
    case 'public':
      return { ...s.config, tiers: demoTiers(s), qr: s.qr };
    case 'register': {
      const tier = demoTiers(s).find(t => t.id === p.tierId);
      if (tier == null || tier.estado !== 'disponible') throw new Error('Esa entrada ya no está disponible. Elige otra.');
      if (p.cantidad > tier.quedan) throw new Error(`Solo quedan ${tier.quedan} entradas de ${tier.nombre}.`);
      const reg = {
        codigo: 'EI-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
        fecha: new Date().toISOString(),
        tier_id: tier.id,
        tier: tier.nombre,
        cantidad: p.cantidad,
        precio: tier.precio,
        total: p.cantidad * tier.precio,
        nombre: p.nombre,
        ci: p.ci,
        telefono: p.telefono,
        email: p.email,
        comprobante: '',
        estado: 'pendiente',
        nota: '',
      };
      s.regs.push(reg);
      demoSave(s);
      return { codigo: reg.codigo, total: reg.total, cantidad: reg.cantidad, tier: reg.tier };
    }
    case 'adminData':
      return { config: s.config, tiers: demoTiers(s), registros: [...s.regs].reverse(), qr: s.qr };
    case 'setStatus':
      s.regs.find(r => r.codigo === p.codigo).estado = p.estado;
      demoSave(s);
      return { codigo: p.codigo, estado: p.estado };
    case 'saveTiers':
      s.tiers = p.tiers.map(t => ({ ...t, id: t.id || 't-' + Math.random().toString(36).slice(2, 10) }));
      demoSave(s);
      return { tiers: demoTiers(s) };
    case 'saveConfig':
      Object.assign(s.config, p.config);
      demoSave(s);
      return { config: s.config };
    case 'uploadQr':
      s.qr = p.imagen;
      demoSave(s);
      return { qr: p.imagen };
    default:
      throw new Error('Acción desconocida.');
  }
}
