// Ensamble Inmediato: 60/40 — backend en Google Apps Script.
// Pasos (detalle en README.md):
//   1. Cambia ADMIN_PASSWORD.
//   2. Ejecuta la función setup una vez.
//   3. Implementa como aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).

const ADMIN_PASSWORD = 'cambia-esta-clave';

const SHEETS = { config: 'Config', tiers: 'Tiers', regs: 'Registros' };
const TIER_HEADERS = ['id', 'nombre', 'precio', 'cupo', 'desde', 'hasta', 'activo'];
const REG_HEADERS = [
  'codigo', 'fecha', 'tier_id', 'tier', 'cantidad', 'precio', 'total',
  'nombre', 'ci', 'telefono', 'email', 'comprobante', 'estado', 'nota',
];
const ESTADOS = ['pendiente', 'pagado', 'rechazado'];
const PUBLIC_CONFIG = ['evento', 'fecha', 'lugar', 'info', 'modo_tiers', 'max_por_persona'];

function setup() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEETS.config, ['clave', 'valor'], [
    ['evento', 'Ensamble Inmediato: 60/40'],
    ['fecha', ''],
    ['lugar', ''],
    ['info', ''],
    ['modo_tiers', 'secuencial'],
    ['max_por_persona', 10],
    ['qr_file_id', ''],
    ['folder_id', ''],
  ]);
  ensureSheet_(ss, SHEETS.tiers, TIER_HEADERS, [
    ['preventa-1', 'Preventa 1', 50, 100, '', '', true],
    ['preventa-2', 'Preventa 2', 70, 150, '', '', true],
    ['general', 'General', 90, 200, '', '', true],
  ]);
  ensureSheet_(ss, SHEETS.regs, REG_HEADERS, []);
  folder_();
}

function doGet() {
  return respond_(() => publicData_());
}

function doPost(e) {
  return respond_(() => {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'public': return publicData_();
      case 'register': return withLock_(() => register_(body));
      case 'adminData': auth_(body); return adminData_();
      case 'setStatus': auth_(body); return withLock_(() => setStatus_(body));
      case 'saveTiers': auth_(body); return withLock_(() => saveTiers_(body.tiers));
      case 'saveConfig': auth_(body); return withLock_(() => saveConfig_(body.config));
      case 'uploadQr': auth_(body); return withLock_(() => uploadQr_(body.imagen));
      default: throw new Error('Acción desconocida.');
    }
  });
}

// ---------- Acciones ----------

function publicData_() {
  const cfg = config_();
  const tiers = tierStates_(cfg).map(t => ({
    id: t.id, nombre: t.nombre, precio: t.precio, quedan: t.quedan, estado: t.estado, desde: t.desde,
  }));
  return { ...pick_(cfg, PUBLIC_CONFIG), tiers, qr: qrDataUrl_(cfg) };
}

function register_(b) {
  const cfg = config_();
  const cantidad = Math.floor(Number(b.cantidad));
  const max = Number(cfg.max_por_persona) || 10;
  if (!(cantidad >= 1 && cantidad <= max)) throw new Error('Cantidad inválida (máximo ' + max + ').');

  const nombre = clean_(b.nombre, 100);
  const ci = clean_(b.ci, 20);
  const telefono = clean_(b.telefono, 20);
  const email = clean_(b.email, 100);
  if (nombre === '' || ci === '' || telefono === '') throw new Error('Completa nombre, carnet y celular.');
  if (b.comprobante == null || b.comprobante === '') throw new Error('Falta la captura del comprobante.');

  const tier = tierStates_(cfg).find(t => t.id === b.tierId);
  if (tier == null || tier.estado !== 'disponible') throw new Error('Esa entrada ya no está disponible. Elige otra.');
  if (cantidad > tier.quedan) throw new Error('Solo quedan ' + tier.quedan + ' entradas de ' + tier.nombre + '.');

  const codigo = newCode_();
  const file = saveImage_(b.comprobante, codigo + ' · ' + nombre);
  const total = cantidad * tier.precio;
  sheet_(SHEETS.regs).appendRow([
    codigo, new Date(), tier.id, tier.nombre, cantidad, tier.precio, total,
    nombre, ci, telefono, email, file.getUrl(), 'pendiente', '',
  ]);
  return { codigo, total, cantidad, tier: tier.nombre };
}

function adminData_() {
  const cfg = config_();
  const registros = rows_(SHEETS.regs).map(({ _row, ...r }) => r).reverse();
  return { config: pick_(cfg, PUBLIC_CONFIG), tiers: tierStates_(cfg), registros, qr: qrDataUrl_(cfg) };
}

function setStatus_(b) {
  if (!ESTADOS.includes(b.estado)) throw new Error('Estado inválido.');
  const reg = rows_(SHEETS.regs).find(r => r.codigo === b.codigo);
  if (reg == null) throw new Error('No encontré el registro ' + b.codigo + '.');
  sheet_(SHEETS.regs).getRange(reg._row, REG_HEADERS.indexOf('estado') + 1).setValue(b.estado);
  return { codigo: b.codigo, estado: b.estado };
}

function saveTiers_(list) {
  if (!Array.isArray(list)) throw new Error('Lista de tiers inválida.');
  const rows = list.map(t => [
    t.id ? String(t.id) : 't-' + Utilities.getUuid().slice(0, 8),
    clean_(t.nombre, 60) || 'Entrada',
    Math.max(0, Number(t.precio) || 0),
    Math.max(0, Math.floor(Number(t.cupo) || 0)),
    clean_(t.desde, 10),
    clean_(t.hasta, 10),
    t.activo === true,
  ]);
  const sh = sheet_(SHEETS.tiers);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, TIER_HEADERS.length).clearContent();
  if (rows.length > 0) sh.getRange(2, 1, rows.length, TIER_HEADERS.length).setValues(rows);
  return { tiers: tierStates_(config_()) };
}

function saveConfig_(input) {
  if (input == null) throw new Error('Configuración vacía.');
  PUBLIC_CONFIG.forEach(key => {
    if (input[key] != null) setConfig_(key, clean_(input[key], 500));
  });
  return { config: pick_(config_(), PUBLIC_CONFIG) };
}

function uploadQr_(imagen) {
  const cfg = config_();
  const file = saveImage_(imagen, 'QR de pago');
  if (cfg.qr_file_id) {
    try { DriveApp.getFileById(cfg.qr_file_id).setTrashed(true); } catch (err) { /* ya no existe */ }
  }
  setConfig_('qr_file_id', file.getId());
  return { qr: imagen };
}

// ---------- Tiers ----------

// Estado de cada tier: disponible | agotado | proximamente | cerrado.
// En modo "secuencial" solo se vende el primer tier disponible; el resto espera su turno.
function tierStates_(cfg) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const sold = {};
  rows_(SHEETS.regs).forEach(r => {
    if (r.estado !== 'rechazado') sold[r.tier_id] = (sold[r.tier_id] ?? 0) + Number(r.cantidad);
  });

  let open = false;
  return rows_(SHEETS.tiers).map(r => {
    const t = {
      id: String(r.id),
      nombre: String(r.nombre),
      precio: Number(r.precio) || 0,
      cupo: Number(r.cupo) || 0,
      desde: day_(r.desde, tz),
      hasta: day_(r.hasta, tz),
      activo: bool_(r.activo),
    };
    const vendidas = sold[t.id] ?? 0;
    const quedan = Math.max(0, t.cupo - vendidas);
    let estado = 'disponible';
    if (!t.activo || (t.hasta !== '' && today > t.hasta)) estado = 'cerrado';
    else if (quedan === 0) estado = 'agotado';
    else if (t.desde !== '' && today < t.desde) estado = 'proximamente';
    else if (open && cfg.modo_tiers !== 'todos') estado = 'proximamente';
    if (estado === 'disponible') open = true;
    return { ...t, vendidas, quedan, estado };
  });
}

// ---------- Hoja de cálculo ----------

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (sh == null) throw new Error('Falta la hoja "' + name + '". Ejecuta setup en Apps Script.');
  return sh;
}

function ensureSheet_(ss, name, headers, rows) {
  if (ss.getSheetByName(name) != null) return;
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (rows.length > 0) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

// Filas como objetos { encabezado: valor, _row: número de fila }.
function rows_(name) {
  const values = sheet_(name).getDataRange().getValues();
  const headers = values.shift();
  return values
    .map((r, i) => headers.reduce((o, h, j) => ({ ...o, [h]: r[j] }), { _row: i + 2 }))
    .filter(o => o[headers[0]] !== '');
}

function config_() {
  return rows_(SHEETS.config).reduce((o, r) => ({ ...o, [r.clave]: r.valor }), {});
}

function setConfig_(key, value) {
  const row = rows_(SHEETS.config).find(r => r.clave === key);
  const sh = sheet_(SHEETS.config);
  if (row == null) sh.appendRow([key, value]);
  else sh.getRange(row._row, 2).setValue(value);
}

// ---------- Drive ----------

function folder_() {
  const id = config_().folder_id;
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* se borró: crear otra */ }
  }
  const folder = DriveApp.createFolder('Ensamble Inmediato 60-40 · archivos');
  setConfig_('folder_id', folder.getId());
  return folder;
}

function saveImage_(dataUrl, name) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(dataUrl));
  if (m == null) throw new Error('La imagen no es válida.');
  if (m[2].length > 8e6) throw new Error('La imagen es muy grande.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
  return folder_().createFile(blob);
}

function qrDataUrl_(cfg) {
  if (!cfg.qr_file_id) return null;
  try {
    const blob = DriveApp.getFileById(cfg.qr_file_id).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    return null;
  }
}

// ---------- Utilidades ----------

function respond_(fn) {
  let out;
  try {
    out = { ok: true, data: fn() };
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function auth_(body) {
  if (ADMIN_PASSWORD === 'cambia-esta-clave') throw new Error('Primero cambia ADMIN_PASSWORD en Code.gs.');
  if (body.password !== ADMIN_PASSWORD) throw new Error('Contraseña incorrecta.');
}

function newCode_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const used = new Set(rows_(SHEETS.regs).map(r => r.codigo));
  let code;
  do {
    code = 'EI-' + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (used.has(code));
  return code;
}

// Texto limpio; un ' delante evita que la hoja lo tome como fórmula.
function clean_(v, max) {
  const s = String(v ?? '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function day_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return String(v).trim().slice(0, 10);
}

function bool_(v) {
  return v === true || /^(true|si|sí|1|x)$/i.test(String(v).trim());
}

function pick_(obj, keys) {
  return keys.reduce((o, k) => ({ ...o, [k]: obj[k] ?? '' }), {});
}
