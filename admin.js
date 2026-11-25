const PASS_KEY = 'ei6040-pass';
const admin = { password: '', data: null, filter: 'todos', open: null };

const ESTADO_LABEL = { pendiente: 'Pendiente', pagado: 'Pagado', rechazado: 'Rechazado' };
const TIER_LABEL = { disponible: 'a la venta', agotado: 'agotado', proximamente: 'en espera', cerrado: 'cerrado' };

const call = (action, payload = {}) => api(action, { ...payload, password: admin.password });

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Sesión ----------

async function login(password) {
  admin.password = password;
  admin.data = await call('adminData');
  try { sessionStorage.setItem(PASS_KEY, password); } catch (err) { /* sin almacenamiento */ }
  $('#login').hidden = true;
  $('#panel').hidden = false;
  $('#logout').hidden = false;
  renderAll();
}

$('#login').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').hidden = true;
  try {
    await login($('#password').value);
  } catch (err) {
    $('#loginError').textContent = err.message;
    $('#loginError').hidden = false;
  }
});

$('#logout').addEventListener('click', () => {
  try { sessionStorage.removeItem(PASS_KEY); } catch (err) { /* sin almacenamiento */ }
  location.reload();
});

$('#tabs').addEventListener('click', e => {
  const tab = e.target.dataset.tab;
  if (tab == null) return;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === e.target));
  ['regs', 'tiers', 'setup'].forEach(t => { $('#tab-' + t).hidden = t !== tab; });
});

function renderAll() {
  renderRegs();
  renderTiers();
  renderSetup();
}

// ---------- Registros ----------

function waLink(r) {
  let phone = String(r.telefono).replace(/\D/g, '');
  if (phone.length === 8) phone = '591' + phone;
  const text = `Hola ${r.nombre}, tu registro ${r.codigo} para ${admin.data.config.evento} está confirmado (${r.cantidad} × ${r.tier}). ¡Nos vemos!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function renderRegs() {
  const regs = admin.data.registros;
  const paid = regs.filter(r => r.estado === 'pagado');
  const sum = (list, key) => list.reduce((n, r) => n + Number(r[key]), 0);
  $('#stats').innerHTML = `
    <div><b>${sum(paid, 'cantidad')}</b><span>entradas pagadas</span></div>
    <div><b>${bs(sum(paid, 'total'))}</b><span>recaudado</span></div>
    <div class="warn"><b>${regs.filter(r => r.estado === 'pendiente').length}</b><span>por verificar</span></div>`;

  const q = $('#search').value.trim().toLowerCase();
  const list = regs.filter(r => (admin.filter === 'todos' || r.estado === admin.filter)
    && (q === '' || [r.nombre, r.ci, r.codigo, r.telefono].join(' ').toLowerCase().includes(q)));

  $('#regList').innerHTML = list.length === 0
    ? '<p class="hint center">No hay registros aquí.</p>'
    : list.map(r => `
    <details class="reg" data-codigo="${esc(r.codigo)}" ${admin.open === r.codigo ? 'open' : ''}>
      <summary>
        <div class="reg-main"><strong>${esc(r.nombre)}</strong>
          <small>${esc(r.codigo)} · ${esc(r.tier)} × ${esc(r.cantidad)}</small></div>
        <div class="reg-side"><span class="badge ${esc(r.estado)}">${ESTADO_LABEL[r.estado] ?? esc(r.estado)}</span>
          <small>${bs(r.total)}</small></div>
      </summary>
      <div class="reg-body">
        <p>CI ${esc(r.ci)} · <a href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a>${r.email ? ' · ' + esc(r.email) : ''}<br>
          <small>${new Date(r.fecha).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}</small></p>
        <div class="row">
          ${r.comprobante ? `<a class="btn ghost sm" href="${esc(r.comprobante)}" target="_blank" rel="noopener">Ver comprobante</a>` : ''}
          <a class="btn ghost sm" href="${esc(waLink(r))}" target="_blank" rel="noopener">WhatsApp</a>
        </div>
        <div class="row status">
          ${Object.keys(ESTADO_LABEL).map(s => `<button type="button" class="btn sm ${s} ${r.estado === s ? 'on' : ''}" data-estado="${s}">${ESTADO_LABEL[s]}</button>`).join('')}
        </div>
      </div>
    </details>`).join('');
}

$('#search').addEventListener('input', renderRegs);

$('#chips').addEventListener('click', e => {
  const f = e.target.dataset.f;
  if (f == null) return;
  admin.filter = f;
  document.querySelectorAll('#chips button').forEach(b => b.classList.toggle('on', b === e.target));
  renderRegs();
});

$('#regList').addEventListener('toggle', e => {
  if (e.target.open) admin.open = e.target.dataset.codigo;
  else if (admin.open === e.target.dataset.codigo) admin.open = null;
}, true);

$('#regList').addEventListener('click', async e => {
  const estado = e.target.dataset.estado;
  if (estado == null) return;
  const codigo = e.target.closest('.reg').dataset.codigo;
  e.target.disabled = true;
  try {
    await call('setStatus', { codigo, estado });
    admin.data.registros.find(r => r.codigo === codigo).estado = estado;
    admin.open = codigo;
    renderRegs();
    toast(`${codigo}: ${ESTADO_LABEL[estado].toLowerCase()}`);
  } catch (err) {
    e.target.disabled = false;
    toast(err.message, true);
  }
});

$('#refresh').addEventListener('click', async () => {
  try {
    admin.data = await call('adminData');
    renderAll();
    toast('Lista actualizada');
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- Tiers ----------

function tierCard(t) {
  const sold = t.vendidas != null ? `${t.vendidas} / ${t.cupo} vendidas · ${TIER_LABEL[t.estado]}` : 'Nuevo';
  return `
  <div class="card tier-edit" data-id="${esc(t.id ?? '')}" data-vendidas="${t.vendidas ?? 0}">
    <div class="tier-edit-head">
      <input class="t-nombre" value="${esc(t.nombre)}" placeholder="Nombre (ej. Preventa 1)" maxlength="60">
      <button type="button" class="icon up" aria-label="Subir">↑</button>
      <button type="button" class="icon del" aria-label="Eliminar">✕</button>
    </div>
    <div class="grid2">
      <label class="field"><span>Precio (Bs)</span><input class="t-precio" type="number" inputmode="decimal" min="0" value="${esc(t.precio)}"></label>
      <label class="field"><span>Cupo</span><input class="t-cupo" type="number" inputmode="numeric" min="0" value="${esc(t.cupo)}"></label>
      <label class="field"><span>Desde <em>opcional</em></span><input class="t-desde" type="date" value="${esc(t.desde)}"></label>
      <label class="field"><span>Hasta <em>opcional</em></span><input class="t-hasta" type="date" value="${esc(t.hasta)}"></label>
    </div>
    <div class="tier-edit-foot">
      <label class="check"><input type="checkbox" class="t-activo" ${t.activo ? 'checked' : ''}> Activo</label>
      <small>${esc(sold)}</small>
    </div>
  </div>`;
}

function renderTiers() {
  $('#tierList').innerHTML = admin.data.tiers.map(tierCard).join('');
}

$('#addTier').addEventListener('click', () => {
  $('#tierList').insertAdjacentHTML('beforeend',
    tierCard({ nombre: '', precio: '', cupo: '', desde: '', hasta: '', activo: true }));
  $('#tierList').lastElementChild.querySelector('.t-nombre').focus();
});

$('#tierList').addEventListener('click', e => {
  const card = e.target.closest('.tier-edit');
  if (e.target.classList.contains('up') && card.previousElementSibling != null) {
    card.parentNode.insertBefore(card, card.previousElementSibling);
  }
  if (e.target.classList.contains('del')) {
    const sold = Number(card.dataset.vendidas);
    if (sold > 0 && !confirm(`Este tier tiene ${sold} entradas registradas. ¿Eliminarlo igual? Los registros se mantienen.`)) return;
    card.remove();
  }
});

$('#saveTiers').addEventListener('click', async () => {
  const tiers = [...document.querySelectorAll('.tier-edit')].map(c => ({
    id: c.dataset.id,
    nombre: $('.t-nombre', c).value,
    precio: Number($('.t-precio', c).value),
    cupo: Number($('.t-cupo', c).value),
    desde: $('.t-desde', c).value,
    hasta: $('.t-hasta', c).value,
    activo: $('.t-activo', c).checked,
  }));
  try {
    admin.data.tiers = (await call('saveTiers', { tiers })).tiers;
    renderTiers();
    toast('Tiers guardados');
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- QR y evento ----------

function renderSetup() {
  const { qr, config } = admin.data;
  $('#qrPreview').hidden = qr == null;
  $('#qrEmpty').hidden = qr != null;
  if (qr != null) $('#qrPreview').src = qr;
  const form = $('#cfgForm');
  Object.entries(config).forEach(([key, value]) => {
    if (form.elements[key] != null) form.elements[key].value = value;
  });
}

$('#qrFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (file == null) return;
  try {
    const imagen = await readImage(file, { maxSide: 900, type: 'image/png' });
    admin.data.qr = (await call('uploadQr', { imagen })).qr;
    renderSetup();
    toast('QR actualizado');
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = '';
});

$('#cfgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const config = Object.fromEntries(new FormData(e.target));
  try {
    admin.data.config = (await call('saveConfig', { config })).config;
    toast('Evento guardado');
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- Inicio ----------

let saved = null;
try { saved = sessionStorage.getItem(PASS_KEY); } catch (err) { /* sin almacenamiento */ }
if (saved != null) {
  $('#login').hidden = true;
  login(saved).catch(() => { $('#login').hidden = false; });
}
