// Interfaz de la aplicación (todo en español). Sin dependencias externas.
import * as C from './core.js';
import * as DB from './db.js';
import { crearXlsx } from './xlsx.js';

const { ESTADOS, ESTADOS_RESERVA, REPORTES } = C;

/* ───────────── Estado ───────────── */

const VERSION_CONFIG = 2;
const VENDEDORAS_INICIALES = ['Grecia', 'Tatiana'];

const filtrosVacios = () => ({
  q: '', estado: '', estadoPrenda: '', vendedora: '', desde: '', hasta: '', tiendaOrigen: '', tiendaSolicitante: '',
});

const S = {
  reservas: [],
  prendas: [],
  config: { version: VERSION_CONFIG, tiendaActual: '', vendedoras: [...VENDEDORAS_INICIALES], tiendas: [], diasAviso: 1, diasSeparacion: C.DIAS_PLAZO },
  filtros: filtrosVacios(),
  mostrarFiltros: false,
  reporte: { id: 'periodo', desde: '', hasta: '', vendedora: '' },
  borrador: null,
  navs: 0,
  instalar: null,
};

const SUBCLASES = ['Chompa', 'Chalina', 'Saco', 'Polo', 'Blusa', 'Pantalón', 'Vestido', 'Falda', 'Casaca', 'Cardigan', 'Accesorio', 'Calzado', 'Cartera'];

/* ───────────── Utilidades de interfaz ───────────── */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hoy = () => C.hoyISO();
const plazo = () => S.config.diasSeparacion;
const ir = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

function vistas() {
  return C.enriquecer({ reservas: S.reservas, prendas: S.prendas }, hoy(), S.config.diasAviso, plazo());
}

function unicos(arr) {
  const vistos = new Set();
  const out = [];
  for (const x of arr) {
    const t = String(x ?? '').trim();
    if (!t) continue;
    const k = C.norm(t);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

const listaVendedoras = () => unicos([...S.config.vendedoras, ...S.reservas.map((r) => r.vendedora)]);
const listaTiendas = () =>
  unicos([S.config.tiendaActual, ...S.config.tiendas, ...S.reservas.map((r) => r.tienda), ...S.prendas.map((p) => p.tiendaOrigen)]);
const listaSubclases = () => unicos([...SUBCLASES, ...S.prendas.map((p) => p.subclase)]);

const opciones = (lista, sel, vacio) =>
  (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') +
  lista.map((x) => `<option value="${esc(x)}"${C.norm(x) === C.norm(sel) ? ' selected' : ''}>${esc(x)}</option>`).join('');

const datalist = (id, lista) => `<datalist id="${id}">${lista.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>`;

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), err ? 5000 : 2600);
}

function confirmar(titulo, texto, ok = 'Aceptar', peligro = false) {
  return new Promise((res) => {
    const m = $('#modal');
    m.innerHTML = `<div class="caja" role="dialog" aria-modal="true"><h3>${esc(titulo)}</h3><p>${esc(texto)}</p>
      <div class="btns"><button class="btn sec" id="m-no">Cancelar</button><button class="btn${peligro ? ' rojo' : ''}" id="m-si">${esc(ok)}</button></div></div>`;
    m.hidden = false;
    const cerrar = (v) => {
      m.hidden = true;
      m.innerHTML = '';
      res(v);
    };
    $('#m-no').onclick = () => cerrar(false);
    $('#m-si').onclick = () => cerrar(true);
    m.onclick = (e) => {
      if (e.target === m) cerrar(false);
    };
  });
}

const chip = (estado) => `<span class="chip st-${estado}">${esc(ESTADOS[estado].corto)}</span>`;
function chipReserva(v) {
  if (v.porVencer) return '<span class="chip st-porvencer">Por vencer</span>';
  return `<span class="chip st-${v.estado}">${esc(ESTADOS_RESERVA[v.estado])}</span>`;
}

/** Texto y color para los días que faltan (o pasaron) del plazo de una reserva. */
function diasTexto(v) {
  if (v.dias === null) return ['', ''];
  if (v.estado === 'activa') {
    if (v.dias === 0) return ['Vence hoy', 'warn'];
    if (v.dias === 1) return ['Vence mañana', 'warn'];
    return [`Faltan ${v.dias} días`, v.porVencer ? 'warn' : ''];
  }
  if (v.estado === 'vencida') {
    const n = -v.dias;
    return [`Venció hace ${n} ${n === 1 ? 'día' : 'días'}`, 'mal'];
  }
  return ['', ''];
}

const barra = (pct) => `<div class="barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;

const textoPlazoInicio = () => `El plazo de ${plazo()} días empieza cuando la prenda llega a la tienda.`;

/* ───────────── Persistencia ───────────── */

async function guardarConfig() {
  await DB.guardarConfig(S.config);
}

async function recordarCatalogo(r) {
  const c = S.config;
  let cambio = false;
  if (!c.vendedoras.some((x) => C.norm(x) === C.norm(r.vendedora))) {
    c.vendedoras.push(r.vendedora.trim());
    cambio = true;
  }
  if (!c.tiendas.some((x) => C.norm(x) === C.norm(r.tienda))) {
    c.tiendas.push(r.tienda.trim());
    cambio = true;
  }
  if (!c.tiendaActual) {
    c.tiendaActual = r.tienda.trim();
    cambio = true;
  }
  if (cambio) await guardarConfig();
}

/* ───────────── Navegación ───────────── */

const ICONOS = {
  panel: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  lista: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  mas: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  vend: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/></svg>',
  rep: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
};

function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [n, ...resto] = h.split('/');
  return { n: n || 'panel', arg: decodeURIComponent(resto.join('/')) };
}

function pintarTabbar(n) {
  const grupo = { panel: 'panel', lista: 'lista', reserva: 'lista', prenda: 'lista', editar: 'lista', nueva: 'nueva', vendedoras: 'vendedoras', reportes: 'reportes', ajustes: 'ajustes' }[n];
  const t = (id, href, icono, texto, extra = '') => `<a class="tab${grupo === id ? ' on' : ''}${extra}" href="${href}"${grupo === id ? ' aria-current="page"' : ''}>${icono}<span>${texto}</span></a>`;
  $('#tabbar').innerHTML =
    t('panel', '#/panel', ICONOS.panel, 'Panel') +
    t('lista', '#/lista', ICONOS.lista, 'Separaciones') +
    `<a class="tab nueva" href="#/nueva" aria-label="Nueva separación"><span class="fab">${ICONOS.mas}</span><span>Nueva</span></a>` +
    t('vendedoras', '#/vendedoras', ICONOS.vend, 'Vendedoras') +
    t('reportes', '#/reportes', ICONOS.rep, 'Reportes') +
    t('ajustes', '#/ajustes', ICONOS.ajustes, 'Ajustes', ' solo-pc');
}

function render(reset = true) {
  const { n, arg } = ruta();
  const vm = $('#vista');
  let res;
  try {
    switch (n) {
      case 'panel': res = vistaPanel(); break;
      case 'lista': res = vistaLista(); break;
      case 'nueva': res = vistaForm(null); break;
      case 'editar': res = vistaForm(arg); break;
      case 'reserva': res = vistaReserva(arg); break;
      case 'prenda': res = vistaPrenda(arg); break;
      case 'vendedoras': res = vistaVendedoras(); break;
      case 'reportes': res = vistaReportes(); break;
      case 'ajustes': res = vistaAjustes(); break;
      default: res = vistaPanel();
    }
  } catch (e) {
    console.error(e);
    res = { titulo: 'Error', html: `<div class="errores">Ocurrió un error al mostrar esta pantalla: ${esc(e.message)}</div>` };
  }
  if (!res) {
    toast('No se encontró el registro.', true);
    location.replace('#/lista');
    return;
  }
  $('#titulo').textContent = res.titulo;
  document.title = res.titulo + ' · Separaciones';
  vm.innerHTML = res.html;
  vm.dataset.ruta = n;
  const sub = ['nueva', 'editar', 'reserva', 'prenda', 'ajustes'].includes(n);
  $('#btn-atras').hidden = !sub;
  $('#btn-ajustes').hidden = n === 'ajustes';
  pintarTabbar(n);
  if (res.after) res.after();
  if (reset) window.scrollTo(0, 0);
}

/* ───────────── Panel principal ───────────── */

function tile(cls, n, etiqueta, attrs = '', alerta = false) {
  return `<button type="button" class="tile t-${cls}${alerta && n > 0 ? ' alerta' : ''}" data-act="ir-filtro" ${attrs}><div class="n">${n}</div><div class="l">${esc(etiqueta)}</div></button>`;
}

function vistaPanel() {
  const vs = vistas();
  const c = C.resumen(vs);
  const fecha = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let html = `<p class="saludo">${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))}</p>`;

  const avisos = [];
  if (c.disponible > 0)
    avisos.push(`<button type="button" class="aviso warn" data-act="ir-filtro" data-prenda="disponible"><b>${c.disponible} ${c.disponible === 1 ? 'prenda' : 'prendas'}</b> con disponibilidad confirmada ${c.disponible === 1 ? 'espera' : 'esperan'} el correo formal de transferencia.</button>`);
  if (c.vencidas > 0)
    avisos.push(`<button type="button" class="aviso mal" data-act="ir-filtro" data-estado="vencida"><b>${c.vencidas} ${c.vencidas === 1 ? 'separación vencida' : 'separaciones vencidas'}</b> ${c.vencidas === 1 ? 'requiere' : 'requieren'} decisión.</button>`);
  if (c.porVencer > 0)
    avisos.push(`<button type="button" class="aviso warn" data-act="ir-filtro" data-estado="porvencer"><b>${c.porVencer} ${c.porVencer === 1 ? 'separación vence' : 'separaciones vencen'}</b> ${S.config.diasAviso === 0 ? 'hoy' : S.config.diasAviso === 1 ? 'hoy o mañana' : 'en los próximos ' + S.config.diasAviso + ' días'}.</button>`);
  if (c.consulta > 0)
    avisos.push(`<button type="button" class="aviso info" data-act="ir-filtro" data-prenda="consulta"><b>${c.consulta} ${c.consulta === 1 ? 'consulta' : 'consultas'}</b> sin respuesta de otras tiendas.</button>`);
  if (!avisos.length && vs.length) avisos.push('<div class="aviso ok">Todo al día: no hay tareas urgentes.</div>');
  html += avisos.join('');

  html += `<h2>Separaciones</h2><div class="tiles">
    ${tile('activa', c.activas, 'Separaciones activas', 'data-estado="activa"')}
    ${tile('porvencer', c.porVencer, 'Próximas a vencer', 'data-estado="porvencer"', true)}
    ${tile('vencida', c.vencidas, 'Vencidas', 'data-estado="vencida"', true)}
    ${tile('entregada', c.entregadas, 'Entregadas', 'data-estado="entregada"')}
  </div>
  <h2>Seguimiento de prendas</h2><div class="tiles">
    ${tile('pendiente', c.pendiente, 'Pendientes de conseguir', 'data-prenda="pendiente"')}
    ${tile('consulta', c.consulta, 'Consultas sin respuesta', 'data-prenda="consulta"')}
    ${tile('disponible', c.disponible, 'Disponibilidad confirmada', 'data-prenda="disponible"', true)}
    ${tile('correo', c.correo, 'Correo de transferencia enviado', 'data-prenda="correo"')}
    ${tile('traslado', c.traslado, 'En traslado', 'data-prenda="traslado"')}
    ${tile('recibida', c.recibida, 'Recibidas en tienda', 'data-prenda="recibida"')}
  </div>`;

  const proximas = C.ordenarVistas(vs.filter((v) => v.estado === 'activa' || v.estado === 'vencida')).slice(0, 5);
  if (proximas.length) {
    html += '<h2>Requieren atención primero</h2><div class="cards-grid">' + proximas.map(tarjetaReserva).join('') + '</div>';
  }
  if (!vs.length) {
    html = `<div class="vacio"><b>Aún no hay separaciones</b>Toca el botón <b style="display:inline">+</b> para registrar la primera.</div>`;
  }
  return { titulo: 'Panel', html };
}

/* ───────────── Lista de separaciones ───────────── */

function tarjetaReserva(v) {
  const r = v.r;
  const [dt, dcls] = diasTexto(v);
  const lineas = v.ps.slice(0, 4).map((p, i) => {
    const origen = p.enStock ? 'en esta tienda' : p.tiendaOrigen ? `→ ${p.tiendaOrigen}` : '';
    return `<div class="linea">${chip(v.est[i])}<span class="t"><b>${esc(p.sku)}</b> · ${esc(p.subclase)}${origen ? ' ' + esc(origen) : ''}</span></div>`;
  });
  const extra = v.ps.length > 4 ? `<div class="small muted">+ ${v.ps.length - 4} prendas más</div>` : '';
  const izq = v.limite ? `Límite: ${esc(C.fmtFecha(v.limite))}` : v.estado === 'activa' ? 'Plazo: desde que llegue a tienda' : '';
  return `<a class="card sep-item" href="#/reserva/${esc(r.id)}">
    <div class="row between"><div class="grow"><div class="nom">${esc(C.nombreCliente(r))}</div>
      <div class="meta">Vendedora: ${esc(r.vendedora)} · ${esc(r.tienda)}</div></div>${chipReserva(v)}</div>
    <div class="lineas">${lineas.join('')}${extra}</div>
    ${v.prog.total ? barra(v.prog.pct) : ''}
    <div class="row between mt small"><span class="muted">${izq}</span><span class="dias ${dcls}">${esc(dt)}</span></div>
  </a>`;
}

const PILLS = [['', 'Todas'], ['activa', 'Activas'], ['porvencer', 'Por vencer'], ['vencida', 'Vencidas'], ['entregada', 'Entregadas'], ['cancelada', 'Canceladas']];

function contarFiltros() {
  const f = S.filtros;
  return ['estadoPrenda', 'vendedora', 'desde', 'hasta', 'tiendaOrigen', 'tiendaSolicitante'].filter((k) => f[k]).length;
}

function htmlFiltros() {
  const f = S.filtros;
  const estadosSeg = Object.keys(ESTADOS).map((k) => `<option value="${k}"${f.estadoPrenda === k ? ' selected' : ''}>${esc(ESTADOS[k].label)}</option>`).join('');
  const tiendas = listaTiendas();
  return `<div class="filtros" id="panel-filtros"${S.mostrarFiltros ? '' : ' hidden'}>
    <label class="f">Estado de seguimiento de las prendas<select class="in" data-filtro="estadoPrenda"><option value="">Todos</option>${estadosSeg}</select></label>
    <label class="f">Vendedora<select class="in" data-filtro="vendedora">${opciones(listaVendedoras(), f.vendedora, 'Todas')}</select></label>
    <div class="g2">
      <label class="f">Tienda de origen<select class="in" data-filtro="tiendaOrigen">${opciones(tiendas, f.tiendaOrigen, 'Todas')}</select></label>
      <label class="f">Tienda solicitante<select class="in" data-filtro="tiendaSolicitante">${opciones(tiendas, f.tiendaSolicitante, 'Todas')}</select></label>
    </div>
    <div class="g2">
      <label class="f">Registrada desde<input class="in" type="date" data-filtro="desde" value="${esc(f.desde)}"></label>
      <label class="f">Registrada hasta<input class="in" type="date" data-filtro="hasta" value="${esc(f.hasta)}"></label>
    </div>
    <button type="button" class="btn sec block" data-act="limpiar-filtros">Limpiar filtros</button>
  </div>`;
}

function resultadosLista() {
  const vs = C.ordenarVistas(C.filtrar(vistas(), S.filtros));
  const cont = `${vs.length} ${vs.length === 1 ? 'separación' : 'separaciones'}`;
  const html = vs.length
    ? vs.map(tarjetaReserva).join('')
    : S.reservas.length
      ? '<div class="vacio"><b>Sin resultados</b>Prueba con otra búsqueda o limpia los filtros.</div>'
      : '<div class="vacio"><b>Aún no hay separaciones</b>Toca el botón + para registrar la primera.</div>';
  return { cont, html };
}

function vistaLista() {
  const f = S.filtros;
  const nf = contarFiltros();
  const pills = PILLS.map(([v, t]) => `<button type="button" class="pill${f.estado === v ? ' on' : ''}" data-act="pill" data-v="${v}">${t}</button>`).join('');
  const r = resultadosLista();
  const html = `<div class="buscar"><input id="q" class="in" type="search" placeholder="Cliente, celular, código, vendedora, tienda…" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="pills">${pills}<button type="button" class="pill${nf ? ' on' : ''}" data-act="toggle-filtros">Filtros${nf ? ' (' + nf + ')' : ''} ▾</button></div>
    ${htmlFiltros()}
    <div class="contador" id="contador">${r.cont}</div>
    <div id="lista-res" class="cards-grid">${r.html}</div>`;
  return { titulo: 'Separaciones', html };
}

function refrescarResultados() {
  const r = resultadosLista();
  const c = $('#contador');
  const l = $('#lista-res');
  if (c) c.textContent = r.cont;
  if (l) l.innerHTML = r.html;
  const nf = contarFiltros();
  const b = $('[data-act="toggle-filtros"]');
  if (b) {
    b.textContent = `Filtros${nf ? ' (' + nf + ')' : ''} ▾`;
    b.classList.toggle('on', nf > 0);
  }
}

/* ───────────── Formulario de separación ───────────── */

function vistaForm(id) {
  let titulo = 'Nueva separación';
  if (id) {
    const r = S.reservas.find((x) => x.id === id);
    if (!r) return null;
    titulo = 'Editar separación';
    S.borrador = {
      editando: true,
      r: { ...r },
      ps: S.prendas
        .filter((p) => p.reservaId === id)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map((p) => ({ ...p, _existe: true, _stock: p.enStock })),
      borrar: [],
    };
  } else {
    const r = C.nuevaReserva(S.config, hoy());
    const p = C.nuevaPrenda(r.id, r.tienda, 0);
    S.borrador = { editando: false, r, ps: [{ ...p, _stock: false }], borrar: [] };
  }
  return { titulo, html: htmlForm() };
}

function bloquePrenda(p, i, total) {
  const e = C.etapa(p);
  const puedeStock = e === 'pendiente' || (e === 'recibida' && p.enStock);
  return `<div class="bloque-prenda" data-pid="${esc(p.id)}">
    <div class="cab"><span>Prenda ${i + 1}${p._existe ? ' · ' + chip(C.estadoPrenda(p, hoy(), plazo())) : ''}</span>
      ${total > 1 ? `<button type="button" class="btn peligro peq" data-act="quitar-prenda" data-id="${esc(p.id)}">Quitar</button>` : ''}</div>
    <div class="g2">
      <label class="f">Código de la prenda <span class="req">*</span><input class="in" data-f="sku" value="${esc(p.sku)}" autocomplete="off" autocapitalize="characters"></label>
      <label class="f">Subclase <span class="req">*</span><input class="in" data-f="subclase" list="dl-sub" value="${esc(p.subclase)}" autocomplete="off" placeholder="Ej.: Chompa"></label>
    </div>
    <label class="f">Observaciones de la prenda<input class="in" data-f="obs" value="${esc(p.obs)}" autocomplete="off"></label>
    ${puedeStock ? `<label class="chk"><input type="checkbox" data-f="_stock"${p._stock ? ' checked' : ''}> Ya está en esta tienda (hay stock, no requiere transferencia)</label>` : ''}
  </div>`;
}

function htmlForm() {
  const { r, ps } = S.borrador;
  const vend = listaVendedoras();
  const enLista = vend.some((x) => C.norm(x) === C.norm(r.vendedora));
  return `<form id="form-sep" class="form-grid" novalidate onsubmit="return false">
    <div id="form-errores"></div>
    <div class="card">
      <h3>Cliente</h3>
      <div class="g2">
        <label class="f">Nombre <span class="req">*</span><input class="in" name="nombre" value="${esc(r.nombre)}" autocomplete="off" autocapitalize="words"></label>
        <label class="f">Apellido <span class="req">*</span><input class="in" name="apellido" value="${esc(r.apellido)}" autocomplete="off" autocapitalize="words"></label>
      </div>
      <label class="f">Número de celular <span class="req">*</span><input class="in" name="celular" type="tel" inputmode="tel" value="${esc(r.celular)}" autocomplete="off"></label>
    </div>
    <div class="card">
      <h3>Separación</h3>
      <label class="f">Vendedora responsable <span class="req">*</span>
        <select class="in" name="vendedoraSel"><option value="">Selecciona…</option>${opciones(vend, enLista ? r.vendedora : '')}<option value="__otra">Otra persona…</option></select></label>
      <label class="f" id="wrap-otra" hidden>Nombre de la vendedora<input class="in" name="vendedoraOtra" value="" autocomplete="off" autocapitalize="words"></label>
      <div class="g2">
        <label class="f">Tienda <span class="req">*</span><input class="in" name="tienda" list="dl-tienda" value="${esc(r.tienda)}" autocomplete="off" autocapitalize="words"></label>
        <label class="f">Fecha de registro <span class="req">*</span><input class="in" name="fechaRegistro" type="date" value="${esc(r.fechaRegistro)}"></label>
      </div>
      <label class="f">Observaciones adicionales<textarea class="in" name="observaciones" rows="2" placeholder="Ej.: el cliente avisó que viaja y recogerá después">${esc(r.observaciones)}</textarea></label>
      <p class="small muted" style="margin:0">${esc(textoPlazoInicio())} Se puede extender si el cliente lo pide.</p>
    </div>
    <h2>Prendas separadas</h2>
    <div id="prendas-form">${ps.map((p, i) => bloquePrenda(p, i, ps.length)).join('')}</div>
    <button type="button" class="btn sec block mb" data-act="add-prenda">+ Agregar otra prenda</button>
    <button type="button" class="btn block" data-act="guardar-sep">${S.borrador.editando ? 'Guardar cambios' : 'Guardar separación'}</button>
    ${datalist('dl-tienda', listaTiendas())}${datalist('dl-sub', listaSubclases())}
  </form>`;
}

function leerForm() {
  const f = $('#form-sep');
  if (!f || !S.borrador) return;
  const b = S.borrador;
  for (const k of ['nombre', 'apellido', 'celular', 'tienda', 'fechaRegistro', 'observaciones']) {
    b.r[k] = f.elements[k].value;
  }
  const sel = f.elements.vendedoraSel.value;
  b.r.vendedora = sel === '__otra' ? f.elements.vendedoraOtra.value.trim() : sel;
  for (const div of $$('.bloque-prenda', f)) {
    const p = b.ps.find((x) => x.id === div.dataset.pid);
    if (!p) continue;
    for (const inp of $$('[data-f]', div)) p[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value;
  }
}

function repintarPrendasForm() {
  const { ps } = S.borrador;
  $('#prendas-form').innerHTML = ps.map((p, i) => bloquePrenda(p, i, ps.length)).join('');
}

async function guardarSeparacion() {
  leerForm();
  const b = S.borrador;
  const r = {
    ...b.r,
    nombre: b.r.nombre.trim(),
    apellido: b.r.apellido.trim(),
    celular: b.r.celular.trim(),
    vendedora: b.r.vendedora.trim(),
    tienda: b.r.tienda.trim(),
    observaciones: b.r.observaciones.trim(),
  };
  delete r.fechaLimite; // ya no se usa: el plazo corre por prenda desde que llega a tienda
  const errores = C.validarReserva(r, b.ps);
  const caja = $('#form-errores');
  if (errores.length) {
    caja.innerHTML = `<div class="errores"><b>Revisa estos datos:</b><ul>${errores.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  caja.innerHTML = '';
  let finales;
  try {
    finales = b.ps.map((p, i) => {
      let q = {
        ...p,
        orden: i,
        sku: p.sku.trim(),
        subclase: p.subclase.trim(),
        obs: p.obs.trim(),
        tiendaSolicitante: r.tienda,
      };
      const quiereStock = q._stock;
      delete q._stock;
      delete q._existe;
      if (quiereStock && !q.enStock && C.etapa(q) === 'pendiente') q = C.aplicarAccion(q, 'stock', { fecha: r.fechaRegistro });
      else if (!quiereStock && q.enStock && C.etapa(q) === 'recibida') q = C.aplicarAccion(q, 'retroceder');
      return q;
    });
    await DB.guardarReserva(r, finales, b.borrar);
  } catch (e) {
    toast('No se pudo guardar: ' + e.message, true);
    return;
  }
  S.reservas = S.reservas.filter((x) => x.id !== r.id).concat(r);
  S.prendas = S.prendas.filter((x) => x.reservaId !== r.id).concat(finales);
  try {
    await recordarCatalogo(r);
  } catch (_) {
    /* el catálogo es solo una ayuda */
  }
  S.borrador = null;
  toast(b.editando ? 'Cambios guardados' : 'Separación registrada');
  ir('#/reserva/' + r.id);
}

/* ───────────── Detalle de la separación ───────────── */

function vistaReserva(id) {
  const v = vistas().find((x) => x.r.id === id);
  if (!v) return null;
  const r = v.r;
  const [dt, dcls] = diasTexto(v);
  const tel = r.celular.replace(/[^\d+]/g, '');
  const items = v.ps
    .map((p, i) => {
      const origen = p.enStock ? 'Stock en esta tienda' : p.tiendaOrigen ? `Origen: ${p.tiendaOrigen}` : 'Origen: por definir';
      const lim = v.lims[i] && !p.fechaEntrega && !p.fechaCancelacion ? ` · Plazo hasta ${C.fmtFecha(v.lims[i])}` : '';
      return `<a class="prenda-item" href="#/prenda/${esc(p.id)}">
        <div class="row between"><div class="t1">${esc(p.sku)} · ${esc(p.subclase)}</div>${chip(v.est[i])}</div>
        <div class="t2">${esc(origen + lim)}</div>${p.obs ? `<div class="t2">${esc(p.obs)}</div>` : ''}</a>`;
    })
    .join('');
  const hayCanceladas = v.ps.some((p) => p.fechaCancelacion);
  const plazoHtml = v.limite
    ? `${esc(C.fmtFecha(v.limite))} <span class="dias ${dcls}">${esc(dt)}</span>`
    : `<span class="muted" style="font-weight:500">${esc(textoPlazoInicio())}</span>`;
  const html = `<div class="dos-col"><div class="col"><div class="card">
      <div class="row between"><div class="grow"><div class="nom-grande">${esc(C.nombreCliente(r))}</div>
        <a href="tel:${esc(tel)}" class="small">📞 ${esc(r.celular)}</a></div>${chipReserva(v)}</div>
      <dl class="kv mt">
        <dt>Vendedora responsable</dt><dd>${esc(r.vendedora)}</dd>
        <dt>Tienda</dt><dd>${esc(r.tienda)}</dd>
        <dt>Fecha de registro</dt><dd>${esc(C.fmtFecha(r.fechaRegistro))}</dd>
        <dt>Fecha límite</dt><dd>${plazoHtml}</dd>
        ${r.observaciones ? `<dt>Observaciones</dt><dd>${esc(r.observaciones)}</dd>` : ''}
      </dl>
    </div>
    <div class="card"><h3>Avance de la separación</h3>${barra(v.prog.pct)}
      <div class="small muted mt">${v.prog.total ? `${v.prog.recibidas + v.prog.entregadas} de ${v.prog.total} prendas ya están en tienda · ${v.prog.entregadas} entregadas` : 'Todas las prendas están canceladas'}</div></div>
    <div class="btns mt"><a class="btn" href="#/editar/${esc(r.id)}">Editar / agregar prendas</a></div>
    <div class="btns mt">
      ${hayCanceladas ? '<button type="button" class="btn sec" data-act="reactivar-reserva">Reactivar prendas canceladas</button>' : ''}
      ${v.estado !== 'cancelada' && v.estado !== 'entregada' ? '<button type="button" class="btn peligro" data-act="cancelar-reserva">Cancelar separación</button>' : ''}
      <button type="button" class="btn peligro" data-act="eliminar-reserva">Eliminar</button>
    </div></div><div class="col"><h2>Prendas (${v.ps.length})</h2>${items}</div></div>`;
  return { titulo: C.nombreCliente(r), html };
}

async function cancelarReserva() {
  const id = ruta().arg;
  if (!(await confirmar('Cancelar separación', 'Se cancelarán todas las prendas que aún no fueron entregadas. ¿Continuar?', 'Cancelar separación', true))) return;
  const nuevas = [];
  for (const p of S.prendas.filter((x) => x.reservaId === id)) {
    const e = C.etapa(p);
    if (e !== 'entregada' && e !== 'cancelada') nuevas.push(C.aplicarAccion(p, 'cancelar', { fecha: hoy() }));
  }
  await persistirPrendas(nuevas);
  toast('Separación cancelada');
  render(false);
}

async function reactivarReserva() {
  const id = ruta().arg;
  const nuevas = S.prendas.filter((x) => x.reservaId === id && x.fechaCancelacion).map((p) => C.aplicarAccion(p, 'reactivar'));
  await persistirPrendas(nuevas);
  toast('Prendas reactivadas');
  render(false);
}

async function eliminarReserva() {
  const id = ruta().arg;
  if (!(await confirmar('Eliminar separación', 'Se borrará la separación con todas sus prendas. Esta acción no se puede deshacer.', 'Eliminar', true))) return;
  try {
    await DB.borrarReserva(id);
  } catch (e) {
    toast('No se pudo eliminar: ' + e.message, true);
    return;
  }
  S.reservas = S.reservas.filter((x) => x.id !== id);
  S.prendas = S.prendas.filter((x) => x.reservaId !== id);
  toast('Separación eliminada');
  ir('#/lista');
}

async function persistirPrendas(nuevas) {
  if (!nuevas.length) return;
  await DB.guardarPrendas(nuevas);
  const m = new Map(nuevas.map((p) => [p.id, p]));
  S.prendas = S.prendas.map((p) => m.get(p.id) || p);
}

/* ───────────── Seguimiento de una prenda ───────────── */

const IDX = { pendiente: 0, consulta: 1, disponible: 2, correo: 3, traslado: 4, recibida: 5, entregada: 6 };

function pasosPrenda(p) {
  const base = C.etapa({ ...p, fechaCancelacion: '' });
  const i = IDX[base];
  const F = C.fmtFecha;
  const lim = C.limitePrenda(p, plazo());
  const plazoTxt = lim && i === 5 ? `Plazo de separación hasta el ${F(lim)}${p.limiteManual ? ' (extendido)' : ''}` : '';
  if (p.enStock) {
    return [
      { n: 'Disponible en esta tienda', done: i >= 5, fecha: F(p.fechaRecepcion), d: plazoTxt || 'Hay stock, no requiere transferencia' },
      { n: 'Entregada al cliente', done: i >= 6, fecha: F(p.fechaEntrega), d: p.entregadoPor ? 'Entregó: ' + p.entregadoPor : '' },
    ];
  }
  const noDisp = base === 'pendiente' && p.resultadoConsulta === 'no_disponible' && p.tiendaOrigen;
  return [
    {
      n: 'Consultar a la tienda de origen',
      done: i >= 1,
      fecha: i >= 1 ? F(p.fechaConsulta) : '',
      d: i >= 1 ? 'Tienda: ' + p.tiendaOrigen : noDisp ? `${p.tiendaOrigen} no tiene la prenda (${F(p.fechaConsulta)})` : '',
    },
    { n: 'La tienda confirma disponibilidad', done: i >= 2, fecha: F(p.fechaConfirmacion), d: 'Confirmación inicial (verbal)' },
    { n: 'Correo formal de transferencia enviado', done: i >= 3, fecha: F(p.fechaCorreo), d: 'Solo así queda solicitada formalmente' },
    { n: 'En traslado (opcional)', done: i >= 4, fecha: F(p.fechaTraslado), d: '' },
    { n: 'Recibida en la tienda solicitante', done: i >= 5, fecha: F(p.fechaRecepcion), d: plazoTxt },
    { n: 'Entregada al cliente', done: i >= 6, fecha: F(p.fechaEntrega), d: p.entregadoPor ? 'Entregó: ' + p.entregadoPor : '' },
  ];
}

function htmlPasos(p, cancelada) {
  const pasos = pasosPrenda(p);
  const actual = cancelada ? -1 : pasos.findIndex((x) => !x.done);
  return `<ol class="pasos">${pasos
    .map((s, i) => {
      const cls = s.done ? 'hecho' : i === actual ? 'actual' : 'bloq';
      return `<li class="paso ${cls}"><span class="pt">${s.done ? '✓' : i + 1}</span><div class="pb"><div class="pn">${esc(s.n)}</div>
        ${s.fecha ? `<div class="pd"><b>${esc(s.fecha)}</b></div>` : ''}${s.d ? `<div class="pd">${esc(s.d)}</div>` : ''}</div></li>`;
    })
    .join('')}</ol>`;
}

function campoFecha(etiqueta = 'Fecha') {
  return `<label class="f">${esc(etiqueta)}<input class="in" type="date" id="a-fecha" value="${hoy()}"></label>`;
}

function textoCorreo(p, r) {
  const asunto = `Solicitud de transferencia – código ${p.sku}`;
  const cuerpo = [
    'Hola, buen día.',
    '',
    'Les escribimos para solicitar formalmente la transferencia de la siguiente prenda, cuya disponibilidad ya fue confirmada:',
    '',
    `• Código: ${p.sku}`,
    `• Subclase: ${p.subclase}`,
    `• Tienda de origen: ${p.tiendaOrigen}`,
    `• Tienda que solicita: ${p.tiendaSolicitante || r.tienda}`,
    '',
    'Quedamos atentos a su confirmación del envío. Gracias.',
  ].join('\r\n');
  return { asunto, cuerpo };
}

function correoMailto(p, r) {
  const { asunto, cuerpo } = textoCorreo(p, r);
  return `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

async function copiarCorreo() {
  const p = S.prendas.find((x) => x.id === ruta().arg);
  const r = p && S.reservas.find((x) => x.id === p.reservaId);
  if (!p || !r) return;
  const { asunto, cuerpo } = textoCorreo(p, r);
  try {
    await navigator.clipboard.writeText(`Asunto: ${asunto}\n\n${cuerpo.replace(/\r\n/g, '\n')}`);
    toast('Texto del correo copiado. Pégalo en tu correo.');
  } catch (_) {
    toast('No se pudo copiar. Usa “Redactar correo”.', true);
  }
}

function cardPlazo(p) {
  const lim = C.limitePrenda(p, plazo());
  const ext = !!p.limiteManual;
  const vencido = hoy() > lim;
  return `<div class="card"><h3>Plazo de separación</h3>
    <div class="aviso ${vencido ? 'mal' : 'info'}" style="cursor:default">${
      vencido
        ? `El plazo terminó el <b>${esc(C.fmtFecha(lim))}</b>. Extiéndelo si el cliente avisó que vendrá más tarde, o cancela la prenda.`
        : `Tiene hasta el <b>${esc(C.fmtFecha(lim))}</b>`
    }${ext ? ` (plazo extendido${p.motivoLimite ? ': ' + esc(p.motivoLimite) : ''})` : ` · ${plazo()} días desde que llegó el ${esc(C.fmtFecha(p.fechaRecepcion))}`}.</div>
    <label class="f">Extender hasta<input class="in" type="date" id="a-limite" value="${esc(lim > hoy() ? lim : hoy())}" min="${esc(p.fechaRecepcion)}"></label>
    <label class="f">Motivo (ej.: el cliente está de viaje)<input class="in" id="a-motivo" value="${esc(p.motivoLimite)}" autocomplete="off"></label>
    <div class="btns"><button type="button" class="btn sec" data-act="p-extender">Extender plazo</button>
    ${ext ? '<button type="button" class="btn peligro" data-act="p-plazonormal">Volver al plazo normal</button>' : ''}</div></div>`;
}

function panelAccion(p, r) {
  const e = C.etapa(p);
  switch (e) {
    case 'pendiente': {
      const nota = C.notaConsultaNegativa(p);
      return `<div class="accion"><h3>1 · Conseguir la prenda</h3>
        ${nota ? `<div class="aviso warn" style="cursor:default">${esc(nota)}</div>` : '<p class="small muted" style="margin-top:0">Primero consulta a una tienda si tiene la prenda. Cuando confirme, se envía el correo.</p>'}
        <label class="f">Tienda de origen a la que consultas<input class="in" id="a-origen" list="dl-tienda" autocomplete="off" placeholder="Ej.: Jockey Plaza" autocapitalize="words"></label>
        ${campoFecha('Fecha de la consulta')}
        <label class="f">Observaciones sobre la solicitud<textarea class="in" id="a-obs" rows="2">${esc(p.obsSolicitud)}</textarea></label>
        <button type="button" class="btn block" data-act="p-consultar">Registrar consulta</button>
        <button type="button" class="btn sec block mt" data-act="p-stock">Ya hay stock en esta tienda</button></div>${datalist('dl-tienda', listaTiendas())}`;
    }
    case 'consulta':
      return `<div class="accion"><h3>2 · ¿Qué respondió ${esc(p.tiendaOrigen)}?</h3>
        <p class="small muted" style="margin-top:0">Consultada el ${esc(C.fmtFecha(p.fechaConsulta))}. Registra la respuesta de la tienda.</p>
        ${campoFecha('Fecha de la respuesta')}
        <div class="btns"><button type="button" class="btn verde" data-act="p-resp-si">Sí, tiene disponibilidad</button>
        <button type="button" class="btn peligro" data-act="p-resp-no">No tiene la prenda</button></div></div>`;
    case 'disponible':
      return `<div class="accion"><h3>3 · Enviar el correo formal</h3>
        <div class="aviso warn" style="cursor:default"><b>${esc(p.tiendaOrigen)}</b> confirmó disponibilidad el ${esc(C.fmtFecha(p.fechaConfirmacion))}, pero la transferencia <b>aún NO está solicitada formalmente</b>. Envía el correo y registra la fecha.</div>
        <div class="btns mb"><a class="btn sec" href="${correoMailto(p, r)}">Redactar correo</a>
        <button type="button" class="btn sec" data-act="copiar-correo">Copiar texto del correo</button></div>
        ${campoFecha('Fecha en que se envió el correo')}
        <button type="button" class="btn block" data-act="p-correo">Registrar correo enviado</button></div>`;
    case 'correo':
      return `<div class="accion"><h3>4 · Seguimiento hasta recibir la prenda</h3>
        <p class="small muted" style="margin-top:0">Correo enviado el ${esc(C.fmtFecha(p.fechaCorreo))} a ${esc(p.tiendaOrigen)}. Al recibirla en tienda empiezan a correr los ${plazo()} días de plazo.</p>
        ${campoFecha()}
        <div class="btns"><button type="button" class="btn sec" data-act="p-traslado">Marcar en traslado</button>
        <button type="button" class="btn verde" data-act="p-recibir">Recibida en tienda</button></div></div>`;
    case 'traslado':
      return `<div class="accion"><h3>5 · Recepción en tienda</h3>
        <p class="small muted" style="margin-top:0">En traslado desde el ${esc(C.fmtFecha(p.fechaTraslado))}. Al recibirla empiezan a correr los ${plazo()} días de plazo.</p>
        ${campoFecha('Fecha de recepción')}
        <button type="button" class="btn verde block" data-act="p-recibir">Registrar recepción en tienda</button></div>`;
    case 'recibida':
      return `<div class="accion"><h3>${p.enStock ? '2' : '6'} · Entrega al cliente</h3>
        <p class="small muted" style="margin-top:0">${p.enStock ? 'La prenda está en esta tienda.' : 'Recibida el ' + esc(C.fmtFecha(p.fechaRecepcion)) + '.'} Avisa al cliente y registra la entrega.</p>
        ${campoFecha('Fecha de entrega')}
        <label class="f">¿Quién entrega? (opcional)<input class="in" id="a-por" list="dl-vend" autocomplete="off"></label>
        <button type="button" class="btn verde block" data-act="p-entregar">Registrar entrega al cliente</button></div>${datalist('dl-vend', listaVendedoras())}${cardPlazo(p)}`;
    case 'entregada':
      return `<div class="aviso ok" style="cursor:default">Entregada al cliente el <b>${esc(C.fmtFecha(p.fechaEntrega))}</b>${p.entregadoPor ? ' por ' + esc(p.entregadoPor) : ''}. La vendedora responsable de la separación sigue siendo <b>${esc(r.vendedora)}</b>.</div>`;
    case 'cancelada':
      return `<div class="aviso mal" style="cursor:default">Prenda cancelada el ${esc(C.fmtFecha(p.fechaCancelacion))}.</div>
        <button type="button" class="btn sec block mb" data-act="p-reactivar">Reactivar prenda</button>`;
    default:
      return '';
  }
}

function vistaPrenda(id) {
  const p = S.prendas.find((x) => x.id === id);
  if (!p) return null;
  const v = vistas().find((x) => x.r.id === p.reservaId);
  if (!v) return null;
  const r = v.r;
  const estado = v.est[v.ps.findIndex((x) => x.id === p.id)];
  const e = C.etapa(p);
  let puedeRetroceder = true;
  try {
    C.aplicarAccion(p, 'retroceder');
  } catch (_) {
    puedeRetroceder = false;
  }
  const html = `<div class="dos-col"><div class="col"><div class="card">
      <div class="row between"><div class="grow"><div class="nom-grande">${esc(p.sku)}</div><div>${esc(p.subclase)}</div></div>${chip(estado)}</div>
      ${p.obs ? `<div class="small mt"><b>Obs.:</b> ${esc(p.obs)}</div>` : ''}
      <hr class="sep">
      <a href="#/reserva/${esc(r.id)}" class="row between" style="text-decoration:none;color:inherit">
        <div><div style="font-weight:700">${esc(C.nombreCliente(r))}</div>
        <div class="small muted">Vendedora: ${esc(r.vendedora)} · ${esc(r.tienda)}</div></div><span>›</span></a>
    </div>
    ${panelAccion(p, r)}
    </div><div class="col"><div class="card"><h3>Seguimiento</h3>${htmlPasos(p, e === 'cancelada')}</div>
    ${
      e !== 'entregada' && e !== 'cancelada' && e !== 'pendiente'
        ? `<div class="card"><label class="f" style="margin:0">Observaciones sobre la solicitud<textarea class="in" id="obs-sol" rows="2">${esc(p.obsSolicitud)}</textarea></label>
        <button type="button" class="btn sec block mt" data-act="p-obs">Guardar observaciones</button></div>`
        : e === 'entregada' && p.obsSolicitud
          ? `<div class="card small"><b>Observaciones de la solicitud:</b> ${esc(p.obsSolicitud)}</div>`
          : ''
    }
    <div class="btns">
      ${puedeRetroceder ? '<button type="button" class="btn sec" data-act="p-retroceder">Deshacer último paso</button>' : ''}
      ${e !== 'entregada' && e !== 'cancelada' ? '<button type="button" class="btn peligro" data-act="p-cancelar">Cancelar prenda</button>' : ''}
    </div></div></div>`;
  return { titulo: p.sku, html };
}

async function accionPrenda(tipo) {
  const p = S.prendas.find((x) => x.id === ruta().arg);
  if (!p) return;
  const val = (sel) => {
    const el = $(sel);
    return el ? el.value : undefined;
  };
  const datos = {
    fecha: (tipo === 'extender' ? val('#a-limite') : val('#a-fecha')) || (tipo === 'extender' ? '' : hoy()),
    tiendaOrigen: val('#a-origen'),
    obs: tipo === 'observaciones' ? val('#obs-sol') : val('#a-obs'),
    entregadoPor: val('#a-por'),
    motivo: val('#a-motivo'),
  };
  const [tipoReal, resultado] = tipo === 'resp-si' ? ['respuesta', 'disponible'] : tipo === 'resp-no' ? ['respuesta', 'no_disponible'] : [tipo, undefined];
  if (resultado) datos.resultado = resultado;
  let nueva;
  try {
    nueva = C.aplicarAccion(p, tipoReal, datos);
  } catch (e) {
    toast(e.message, true);
    return;
  }
  try {
    await DB.guardarPrenda(nueva);
  } catch (e) {
    toast('No se pudo guardar: ' + e.message, true);
    return;
  }
  S.prendas = S.prendas.map((x) => (x.id === nueva.id ? nueva : x));
  render(false);
  toast(
    tipo === 'resp-no'
      ? 'Registrado: la tienda no tiene la prenda. Consulta a otra tienda.'
      : tipo === 'extender'
        ? 'Plazo extendido'
        : tipo === 'recibir' || tipo === 'stock'
          ? `Guardado. El plazo de ${plazo()} días empieza hoy.`
          : 'Guardado',
  );
}

/* ───────────── Vendedoras ───────────── */

function vistaVendedoras() {
  const lista = C.porVendedora(vistas(), S.config.vendedoras);
  if (!lista.length) {
    return { titulo: 'Vendedoras', html: '<div class="vacio"><b>Aún no hay vendedoras</b>Aparecerán aquí al registrar separaciones.</div>' };
  }
  const html =
    '<p class="saludo">La vendedora responsable queda asociada a cada separación durante todo el proceso.</p>' +
    '<div class="cards-grid">' +
    lista
      .map((x) => {
        const a = (estado, n, etq) =>
          `<button type="button" class="tile" style="padding:6px 2px;text-align:center;box-shadow:none;background:var(--bg)" data-act="ir-filtro" data-vendedora="${esc(x.nombre)}" data-estado="${estado}"><b style="display:block;font-size:1.15rem">${n}</b><small class="muted" style="font-size:.7rem;font-weight:600">${etq}</small></button>`;
        return `<div class="card"><div class="row between"><div class="grow"><div class="nom" style="font-weight:700;font-size:1.05rem">${esc(x.nombre)}</div>
          <div class="small muted">${x.total} ${x.total === 1 ? 'reserva realizada' : 'reservas realizadas'}</div></div>
          <button type="button" class="btn sec peq" data-act="ir-filtro" data-vendedora="${esc(x.nombre)}">Ver todas</button></div>
          <div class="stats5">${a('activa', x.pendientes, 'Pendientes')}${a('entregada', x.entregadas, 'Entregadas')}${a('cancelada', x.canceladas, 'Canceladas')}${a('vencida', x.vencidas, 'Vencidas')}</div></div>`;
      })
      .join('') +
    '</div>';
  return { titulo: 'Vendedoras', html };
}

/* ───────────── Reportes y exportación ───────────── */

const LIMITE_PANTALLA = 200;

function datosReporte() {
  return C.generarReporte(S.reporte.id, vistas(), S.reporte);
}

function htmlResultadoReporte() {
  const rep = datosReporte();
  const n = rep.filas.length;
  const cols = rep.columnas;
  const filas = rep.filas.slice(0, LIMITE_PANTALLA);
  const tarjetas = filas
    .map((fila) => {
      const kv = cols
        .map((c, i) => (i > 0 && c.pantalla && fila[i] !== '' && fila[i] !== null && fila[i] !== undefined ? `<span>${esc(c.h)}</span><span>${esc(fila[i])}</span>` : ''))
        .join('');
      return `<div class="rep-card"><div class="tt">${esc(fila[0])}</div><div class="kvs">${kv}</div></div>`;
    })
    .join('');
  const tabla = `<div class="tabla-wrap"><table class="tabla"><thead><tr>${cols.map((c) => `<th>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${filas
    .map((f) => `<tr>${f.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
  const nota = n > LIMITE_PANTALLA ? `<p class="small muted">Se muestran ${LIMITE_PANTALLA} de ${n}. El archivo de Excel incluye todos.</p>` : '';
  return {
    cont: `${n} ${n === 1 ? 'resultado' : 'resultados'}`,
    html: n
      ? `<div class="card rep-cards" style="padding-top:4px;padding-bottom:4px">${tarjetas}</div><div class="rep-tabla">${tabla}</div>${nota}`
      : '<div class="vacio"><b>Sin resultados</b>No hay datos para este reporte con los filtros elegidos.</div>',
  };
}

function vistaReportes() {
  const rp = S.reporte;
  const res = htmlResultadoReporte();
  const html = `<div class="card limitado">
      <label class="f">Reporte<select class="in" data-rep="id">${REPORTES.map((x) => `<option value="${x.id}"${rp.id === x.id ? ' selected' : ''}>${esc(x.titulo)}</option>`).join('')}</select></label>
      <div class="g2">
        <label class="f">Registradas desde<input class="in" type="date" data-rep="desde" value="${esc(rp.desde)}"></label>
        <label class="f">Registradas hasta<input class="in" type="date" data-rep="hasta" value="${esc(rp.hasta)}"></label>
      </div>
      <label class="f" style="margin-bottom:0">Vendedora<select class="in" data-rep="vendedora">${opciones(listaVendedoras(), rp.vendedora, 'Todas')}</select></label>
    </div>
    <div class="btns mb"><button type="button" class="btn" data-act="exportar">Exportar este reporte a Excel</button>
      <button type="button" class="btn sec" data-act="exportar-todo">Exportar todo a Excel</button></div>
    <div class="contador" id="rep-cont">${res.cont}</div><div id="rep-res">${res.html}</div>`;
  return { titulo: 'Reportes', html };
}

function refrescarReporte() {
  const res = htmlResultadoReporte();
  $('#rep-cont').textContent = res.cont;
  $('#rep-res').innerHTML = res.html;
}

function descargar(bytes, nombre) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportarReporte() {
  try {
    const rep = datosReporte();
    const bytes = crearXlsx([{ nombre: rep.titulo, columnas: rep.columnas, filas: rep.filas }]);
    descargar(bytes, `Separaciones_${rep.id}_${hoy()}.xlsx`);
    toast('Excel generado. Revisa tu carpeta de Descargas.');
  } catch (e) {
    toast('No se pudo exportar: ' + e.message, true);
  }
}

function exportarTodo() {
  try {
    const bytes = crearXlsx(C.hojasCompletas(vistas(), S.config.vendedoras));
    descargar(bytes, `Separaciones_completo_${hoy()}.xlsx`);
    toast('Excel generado. Revisa tu carpeta de Descargas.');
  } catch (e) {
    toast('No se pudo exportar: ' + e.message, true);
  }
}

/* ───────────── Ajustes ───────────── */

function vistaAjustes() {
  const c = S.config;
  const html = `<div class="estrecho"><div class="card">
      <h3>Esta tienda</h3>
      <label class="f">Tienda donde se usa esta aplicación<input class="in" id="aj-tienda" value="${esc(c.tiendaActual)}" autocomplete="off" placeholder="Ej.: Miraflores"></label>
      <div class="g2">
        <label class="f">Plazo de separación (días desde que llega a tienda)<input class="in" id="aj-plazo" type="number" inputmode="numeric" min="1" max="60" value="${esc(c.diasSeparacion)}"></label>
        <label class="f">Avisar “por vencer” (días antes)<input class="in" id="aj-aviso" type="number" inputmode="numeric" min="0" max="30" value="${esc(c.diasAviso)}"></label>
      </div>
    </div>
    <div class="card">
      <h3>Listas de ayuda</h3>
      <label class="f">Vendedoras (una por línea)<textarea class="in" id="aj-vend" rows="4">${esc(listaVendedoras().join('\n'))}</textarea></label>
      <label class="f">Tiendas (una por línea)<textarea class="in" id="aj-tiendas" rows="4">${esc(listaTiendas().join('\n'))}</textarea></label>
      <p class="small muted" style="margin-top:0">Para agregar otra vendedora, escribe su nombre en una línea nueva y guarda.</p>
    </div>
    <button type="button" class="btn block mb" data-act="guardar-ajustes">Guardar ajustes</button>
    ${S.instalar ? '<button type="button" class="btn sec block mb" data-act="instalar">Instalar aplicación en este dispositivo</button>' : ''}
    <div class="card">
      <h3>Datos</h3>
      <p class="small muted" style="margin-top:0">Todo se guarda solo en este dispositivo (${S.reservas.length} separaciones, ${S.prendas.length} prendas). No se envía nada a Internet. Si borras los datos del navegador o desinstalas la aplicación, se pierden.</p>
      <button type="button" class="btn peligro block" data-act="borrar-todo">Borrar todos los datos</button>
    </div></div>`;
  return { titulo: 'Ajustes', html };
}

async function guardarAjustes() {
  const c = S.config;
  const lineas = (id) => unicos($(id).value.split('\n'));
  c.tiendaActual = $('#aj-tienda').value.trim();
  c.diasSeparacion = Math.min(60, Math.max(1, parseInt($('#aj-plazo').value, 10) || C.DIAS_PLAZO));
  c.diasAviso = Math.min(30, Math.max(0, parseInt($('#aj-aviso').value, 10) || 0));
  c.vendedoras = lineas('#aj-vend');
  c.tiendas = lineas('#aj-tiendas');
  try {
    await guardarConfig();
    toast('Ajustes guardados');
  } catch (e) {
    toast('No se pudo guardar: ' + e.message, true);
  }
}

async function borrarTodo() {
  if (!(await confirmar('Borrar todos los datos', 'Se eliminarán todas las separaciones y prendas de este dispositivo. No se puede deshacer.', 'Borrar todo', true))) return;
  if (!(await confirmar('¿Seguro?', 'Última confirmación: se perderán todos los registros.', 'Sí, borrar todo', true))) return;
  try {
    await DB.borrarTodo();
  } catch (e) {
    toast('No se pudo borrar: ' + e.message, true);
    return;
  }
  S.reservas = [];
  S.prendas = [];
  S.filtros = filtrosVacios();
  toast('Datos borrados');
  ir('#/panel');
}

/* ───────────── Eventos ───────────── */

function irConFiltro(el) {
  S.filtros = filtrosVacios();
  const d = el.dataset;
  if (d.estado) S.filtros.estado = d.estado;
  if (d.prenda) S.filtros.estadoPrenda = d.prenda;
  if (d.vendedora) S.filtros.vendedora = d.vendedora;
  S.mostrarFiltros = false;
  ir('#/lista');
}

const ACCIONES = {
  'ir-filtro': irConFiltro,
  pill: (el) => {
    S.filtros.estado = el.dataset.v;
    render(false);
  },
  'toggle-filtros': () => {
    S.mostrarFiltros = !S.mostrarFiltros;
    const p = $('#panel-filtros');
    if (p) p.hidden = !S.mostrarFiltros;
  },
  'limpiar-filtros': () => {
    const q = S.filtros.q;
    const estado = S.filtros.estado;
    S.filtros = { ...filtrosVacios(), q, estado };
    render(false);
    S.mostrarFiltros = true;
    const p = $('#panel-filtros');
    if (p) p.hidden = false;
  },
  'add-prenda': () => {
    leerForm();
    const b = S.borrador;
    const p = C.nuevaPrenda(b.r.id, b.r.tienda, b.ps.length);
    b.ps.push({ ...p, _stock: false });
    repintarPrendasForm();
    const bloques = $$('.bloque-prenda');
    bloques[bloques.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    const sku = $('[data-f="sku"]', bloques[bloques.length - 1]);
    if (sku) sku.focus({ preventScroll: true });
  },
  'quitar-prenda': async (el) => {
    leerForm();
    const b = S.borrador;
    const p = b.ps.find((x) => x.id === el.dataset.id);
    if (!p || b.ps.length <= 1) return;
    if (p._existe && C.etapa(p) !== 'pendiente') {
      if (!(await confirmar('Quitar prenda', 'Esta prenda ya tiene seguimiento registrado. Si la quitas se perderá. ¿Continuar?', 'Quitar', true))) return;
    }
    b.ps = b.ps.filter((x) => x.id !== p.id);
    if (p._existe) b.borrar.push(p.id);
    repintarPrendasForm();
  },
  'guardar-sep': guardarSeparacion,
  'cancelar-reserva': cancelarReserva,
  'reactivar-reserva': reactivarReserva,
  'eliminar-reserva': eliminarReserva,
  'p-consultar': () => accionPrenda('consultar'),
  'p-stock': () => accionPrenda('stock'),
  'p-resp-si': () => accionPrenda('resp-si'),
  'p-resp-no': () => accionPrenda('resp-no'),
  'p-correo': () => accionPrenda('correo'),
  'p-traslado': () => accionPrenda('traslado'),
  'p-recibir': () => accionPrenda('recibir'),
  'p-entregar': () => accionPrenda('entregar'),
  'p-obs': () => accionPrenda('observaciones'),
  'p-reactivar': () => accionPrenda('reactivar'),
  'copiar-correo': copiarCorreo,
  'p-extender': () => accionPrenda('extender'),
  'p-plazonormal': () => accionPrenda('plazonormal'),
  'p-cancelar': async () => {
    if (await confirmar('Cancelar prenda', 'La prenda quedará como cancelada. Podrás reactivarla después.', 'Cancelar prenda', true)) accionPrenda('cancelar');
  },
  'p-retroceder': async () => {
    if (await confirmar('Deshacer último paso', 'Se borrará el último paso registrado de esta prenda.', 'Deshacer')) accionPrenda('retroceder');
  },
  exportar: exportarReporte,
  'exportar-todo': exportarTodo,
  'guardar-ajustes': guardarAjustes,
  'borrar-todo': borrarTodo,
  instalar: async () => {
    if (!S.instalar) return;
    S.instalar.prompt();
    await S.instalar.userChoice;
    S.instalar = null;
    render(false);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACCIONES[el.dataset.act];
  if (fn) {
    e.preventDefault();
    Promise.resolve(fn(el)).catch((err) => {
      console.error(err);
      toast('Ocurrió un error: ' + err.message, true);
    });
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    S.filtros.q = e.target.value;
    refrescarResultados();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.filtro) {
    S.filtros[t.dataset.filtro] = t.value;
    refrescarResultados();
  } else if (t.dataset.rep) {
    S.reporte[t.dataset.rep] = t.value;
    refrescarReporte();
  } else if (t.name === 'vendedoraSel') {
    const w = $('#wrap-otra');
    if (w) {
      w.hidden = t.value !== '__otra';
      if (!w.hidden) $('input', w).focus();
    }
  }
});

$('#btn-atras').addEventListener('click', () => {
  if (S.navs > 0) history.back();
  else {
    const { n } = ruta();
    location.hash = n === 'prenda' ? '#/lista' : '#/panel';
  }
});

window.addEventListener('hashchange', () => {
  S.navs++;
  render();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  S.instalar = e;
});

/* ───────────── Inicio ───────────── */

async function iniciar() {
  try {
    const d = await DB.cargarTodo();
    S.reservas = d.reservas;
    S.prendas = d.prendas;
    if (d.config) {
      if (d.config.version === VERSION_CONFIG) {
        S.config = { ...S.config, ...d.config };
      } else {
        // Ajustes guardados con una versión anterior: pasan al plazo de 3 días y a las vendedoras actuales
        S.config = {
          ...S.config,
          ...d.config,
          version: VERSION_CONFIG,
          diasSeparacion: C.DIAS_PLAZO,
          diasAviso: 1,
          vendedoras: unicos([...VENDEDORAS_INICIALES, ...(d.config.vendedoras || [])]),
        };
        await guardarConfig();
      }
    }
    DB.pedirPersistencia();
  } catch (e) {
    console.error(e);
    $('#vista').innerHTML = `<div class="errores"><b>No se pudo abrir el almacenamiento local.</b><br>${esc(e.message)}<br>Cierra el modo incógnito o revisa los permisos del navegador y vuelve a intentarlo.</div>`;
    return;
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Sin modo sin conexión:', err));
  }
  render();
}

iniciar();
