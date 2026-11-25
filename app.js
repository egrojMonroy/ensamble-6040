const state = { data: null, tierId: null, qty: 1, proof: null };

const STATE_LABEL = {
  agotado: () => 'Agotado',
  cerrado: () => 'Cerrado',
  proximamente: t => (t.desde !== '' ? 'Desde el ' + fmtDay(t.desde) : 'Próximamente'),
  disponible: t => (t.quedan <= 20 ? `¡Quedan ${t.quedan}!` : 'Disponible'),
};

async function load() {
  $('#loading').hidden = false;
  $('#loadError').hidden = true;
  try {
    state.data = await api('public');
  } catch (err) {
    $('#loadError').innerHTML = `${esc(err.message)} <button class="link" type="button" onclick="load()">Reintentar</button>`;
    $('#loadError').hidden = false;
    return;
  } finally {
    $('#loading').hidden = true;
  }
  render();
}

function render() {
  const d = state.data;
  $('#meta').textContent = [d.fecha, d.lugar].filter(Boolean).join(' · ');
  $('#info').textContent = d.info;
  $('#info').hidden = !d.info;

  const available = d.tiers.filter(t => t.estado === 'disponible');
  if (available.find(t => t.id === state.tierId) == null) state.tierId = available[0]?.id ?? null;

  if (state.tierId == null) {
    const soon = d.tiers.find(t => t.estado === 'proximamente');
    $('#closed').textContent = soon != null
      ? `La venta abre pronto${soon.desde !== '' ? ' (' + fmtDay(soon.desde) + ')' : ''}. Vuelve a esta página.`
      : 'Las entradas están agotadas. ¡Gracias!';
    $('#closed').hidden = false;
    $('#form').hidden = true;
    return;
  }
  $('#closed').hidden = true;
  $('#form').hidden = false;

  $('#tiers').innerHTML = d.tiers.map(t => {
    const ok = t.estado === 'disponible';
    return `<label class="tier ${t.estado}">
      <input type="radio" name="tier" value="${esc(t.id)}" ${ok ? '' : 'disabled'} ${t.id === state.tierId ? 'checked' : ''}>
      <span class="tier-name">${esc(t.nombre)}</span>
      <span class="tier-price">${bs(t.precio)}</span>
      <span class="tier-state">${esc(STATE_LABEL[t.estado](t))}</span>
    </label>`;
  }).join('');

  $('#pay').hidden = d.qr == null;
  $('#noQr').hidden = d.qr != null;
  $('#submit').disabled = d.qr == null;
  if (d.qr != null) {
    $('#qrImg').src = d.qr;
    $('#qrDownload').href = d.qr;
  }
  renderTotal();
}

function maxQty() {
  const tier = state.data.tiers.find(t => t.id === state.tierId);
  return Math.min(Number(state.data.max_por_persona) || 10, tier.quedan);
}

function renderTotal() {
  state.qty = Math.max(1, Math.min(state.qty, maxQty()));
  const tier = state.data.tiers.find(t => t.id === state.tierId);
  const total = bs(tier.precio * state.qty);
  $('#qty').textContent = state.qty;
  $('#minus').disabled = state.qty <= 1;
  $('#plus').disabled = state.qty >= maxQty();
  $('#total').textContent = total;
  $('#totalBtn').textContent = total;
}

$('#tiers').addEventListener('change', e => {
  state.tierId = e.target.value;
  renderTotal();
});
$('#minus').addEventListener('click', () => { state.qty -= 1; renderTotal(); });
$('#plus').addEventListener('click', () => { state.qty += 1; renderTotal(); });

$('#proof').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file == null) return;
  state.proof = readImage(file, { maxSide: 1400, type: 'image/jpeg', quality: 0.72 });
  state.proof.then(src => {
    $('#proofPreview').src = src;
    $('#proofPreview').hidden = false;
    $('#proofText').innerHTML = '<strong>Comprobante listo</strong><br>Toca para cambiarlo';
    $('#upload').classList.add('ok');
  }).catch(err => showError(err.message));
});

function showError(msg) {
  $('#formError').textContent = msg;
  $('#formError').hidden = false;
  $('#formError').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#formError').hidden = true;
  const btn = $('#submit');
  btn.disabled = true;
  btn.firstChild.textContent = 'Enviando… ';
  const f = new FormData(e.target);
  try {
    const res = await api('register', {
      tierId: state.tierId,
      cantidad: state.qty,
      nombre: f.get('nombre'),
      ci: f.get('ci'),
      telefono: f.get('telefono'),
      email: f.get('email'),
      comprobante: await state.proof,
    });
    $('#doneCode').textContent = res.codigo;
    $('#doneSummary').textContent = `${res.cantidad} × ${res.tier} · ${bs(res.total)}`;
    $('#form').hidden = true;
    $('#done').hidden = false;
    window.scrollTo({ top: $('#done').offsetTop - 16, behavior: 'smooth' });
  } catch (err) {
    showError(err.message);
    api('public').then(data => { state.data = data; render(); }).catch(() => {});
  } finally {
    btn.disabled = state.data.qr == null;
    btn.firstChild.textContent = 'Enviar registro · ';
  }
});

$('#again').addEventListener('click', () => {
  $('#form').reset();
  state.proof = null;
  state.qty = 1;
  $('#proofPreview').hidden = true;
  $('#proofText').innerHTML = '<strong>Sube la captura del comprobante</strong><br>Toca aquí para elegirla';
  $('#upload').classList.remove('ok');
  $('#done').hidden = true;
  load();
});

load();
