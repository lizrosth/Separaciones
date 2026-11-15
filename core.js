// Lógica de negocio pura (sin DOM, sin base de datos): estados, flujo de
// transferencias, plazos, filtros, resumen y reportes.

/* ───────────── Catálogo de estados ───────────── */

export const ETAPAS = ['pendiente', 'consulta', 'disponible', 'correo', 'traslado', 'recibida', 'entregada'];

export const ESTADOS = {
  pendiente: { label: 'Pendiente de conseguir', corto: 'Pendiente' },
  consulta: { label: 'Consulta realizada a otra tienda', corto: 'Consultada' },
  disponible: { label: 'Disponibilidad confirmada', corto: 'Disponible' },
  correo: { label: 'Correo de transferencia enviado', corto: 'Correo enviado' },
  traslado: { label: 'En traslado', corto: 'En traslado' },
  recibida: { label: 'Recibida en tienda', corto: 'Recibida' },
  entregada: { label: 'Entregada al cliente', corto: 'Entregada' },
  cancelada: { label: 'Cancelada', corto: 'Cancelada' },
  vencida: { label: 'Vencida', corto: 'Vencida' },
};

export const ESTADOS_RESERVA = {
  activa: 'Activa',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
  vencida: 'Vencida',
};

/** Días de plazo, contados desde que la prenda llega a la tienda. */
export const DIAS_PLAZO = 3;

/* ───────────── Utilidades ───────────── */

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function hoyISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function diasEntre(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return hoyISO(new Date(y, m - 1, d + n));
}

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');

export const nombreCliente = (r) => `${r.nombre || ''} ${r.apellido || ''}`.trim();

/* ───────────── Fábricas ───────────── */

export function nuevaReserva(config = {}, hoy = hoyISO()) {
  return {
    id: uid(),
    nombre: '',
    apellido: '',
    celular: '',
    vendedora: '',
    tienda: config.tiendaActual || '',
    fechaRegistro: hoy,
    observaciones: '',
    creada: Date.now(),
  };
}

export function nuevaPrenda(reservaId, tiendaSolicitante = '', orden = 0) {
  return {
    id: uid(),
    reservaId,
    orden,
    sku: '',
    subclase: '',
    obs: '',
    tiendaSolicitante,
    enStock: false,
    tiendaOrigen: '',
    fechaConsulta: '',
    resultadoConsulta: '', // '' | 'disponible' | 'no_disponible'
    fechaConfirmacion: '',
    correoEnviado: false,
    fechaCorreo: '',
    obsSolicitud: '',
    fechaTraslado: '',
    fechaRecepcion: '',
    limiteManual: '', // plazo extendido a mano (ej.: el cliente viaja)
    motivoLimite: '',
    fechaEntrega: '',
    entregadoPor: '',
    fechaCancelacion: '',
  };
}

/* ───────────── Plazo de separación ───────────── */

/**
 * Fecha límite de una prenda: 3 días desde que llegó a la tienda (o la fecha
 * extendida a mano). Antes de llegar a la tienda no hay plazo corriendo.
 */
export function limitePrenda(p, plazo = DIAS_PLAZO) {
  if (!p.fechaRecepcion) return '';
  if (p.limiteManual) return p.limiteManual;
  return sumarDias(p.fechaRecepcion, plazo);
}

/* ───────────── Estados de una prenda ───────────── */

/** Etapa del flujo, sin considerar vencimiento. */
export function etapa(p) {
  if (p.fechaCancelacion) return 'cancelada';
  if (p.fechaEntrega) return 'entregada';
  if (p.fechaRecepcion) return 'recibida';
  if (p.fechaTraslado) return 'traslado';
  // Una transferencia solo cuenta como solicitada formalmente con correo enviado.
  if (p.correoEnviado && p.fechaCorreo) return 'correo';
  if (p.resultadoConsulta === 'disponible') return 'disponible';
  if (p.fechaConsulta && !p.resultadoConsulta) return 'consulta';
  // Sin consulta, o la tienda consultada respondió que no tiene: hay que conseguirla.
  return 'pendiente';
}

/** Estado visible: la etapa, salvo que el plazo desde la recepción ya haya pasado. */
export function estadoPrenda(p, hoy, plazo = DIAS_PLAZO) {
  const e = etapa(p);
  if (e === 'cancelada' || e === 'entregada') return e;
  const lim = limitePrenda(p, plazo);
  if (lim && hoy > lim) return 'vencida';
  return e;
}

export function estadoReserva(prendas, hoy, plazo = DIAS_PLAZO) {
  const vivas = prendas.filter((p) => !p.fechaCancelacion);
  if (prendas.length && !vivas.length) return 'cancelada';
  if (vivas.length && vivas.every((p) => p.fechaEntrega)) return 'entregada';
  if (vivas.some((p) => estadoPrenda(p, hoy, plazo) === 'vencida')) return 'vencida';
  return 'activa';
}

const PESO = { pendiente: 0, consulta: 1, disponible: 2, correo: 3, traslado: 4, recibida: 5, entregada: 6 };

export function progreso(prendas) {
  const vivas = prendas.filter((p) => !p.fechaCancelacion);
  const total = vivas.length;
  if (!total) return { total: 0, recibidas: 0, entregadas: 0, pct: 0 };
  let suma = 0;
  let recibidas = 0;
  let entregadas = 0;
  for (const p of vivas) {
    const e = etapa(p);
    suma += PESO[e] / 6;
    if (e === 'recibida') recibidas++;
    if (e === 'entregada') entregadas++;
  }
  return { total, recibidas, entregadas, pct: Math.round((suma / total) * 100) };
}

/** Texto de la última consulta negativa, si la hay. */
export function notaConsultaNegativa(p) {
  if (etapa(p) === 'pendiente' && p.resultadoConsulta === 'no_disponible' && p.tiendaOrigen) {
    return `${p.tiendaOrigen} respondió que no tiene (${fmtFecha(p.fechaConsulta)}). Consulta a otra tienda.`;
  }
  return '';
}

/* ───────────── Flujo de transferencia ───────────── */

function exigeFecha(f) {
  if (!f) throw new Error('Indica la fecha.');
}
function noAntes(f, min, texto) {
  if (min && f < min) throw new Error(`La fecha no puede ser anterior a ${texto} (${fmtFecha(min)}).`);
}

/**
 * Aplica un paso del flujo y devuelve una copia nueva de la prenda.
 * Lanza Error (en español) si el paso no es válido en el estado actual.
 * Pasos: consultar, respuesta, correo, traslado, recibir, entregar, stock,
 *        extender, plazonormal, cancelar, reactivar, retroceder, observaciones.
 */
export function aplicarAccion(p, tipo, d = {}) {
  const et = etapa(p);
  const q = { ...p };
  switch (tipo) {
    case 'consultar': {
      if (et !== 'pendiente') throw new Error('Esta prenda ya tiene una consulta en curso.');
      const origen = (d.tiendaOrigen || '').trim();
      if (!origen) throw new Error('Indica la tienda de origen a la que consultas.');
      if (p.tiendaSolicitante && norm(origen) === norm(p.tiendaSolicitante)) {
        throw new Error('La tienda de origen debe ser distinta de la tienda que solicita.');
      }
      exigeFecha(d.fecha);
      q.tiendaOrigen = origen;
      q.fechaConsulta = d.fecha;
      q.resultadoConsulta = '';
      q.fechaConfirmacion = '';
      if (d.obs !== undefined) q.obsSolicitud = d.obs.trim();
      return q;
    }
    case 'respuesta': {
      if (et !== 'consulta') throw new Error('Primero registra la consulta a la tienda de origen.');
      if (d.resultado !== 'disponible' && d.resultado !== 'no_disponible') {
        throw new Error('Indica si la tienda tiene o no la prenda.');
      }
      exigeFecha(d.fecha);
      noAntes(d.fecha, p.fechaConsulta, 'la consulta');
      q.resultadoConsulta = d.resultado;
      q.fechaConfirmacion = d.resultado === 'disponible' ? d.fecha : '';
      if (d.resultado === 'no_disponible') q.fechaConsulta = d.fecha;
      if (d.obs !== undefined) q.obsSolicitud = d.obs.trim();
      return q;
    }
    case 'correo': {
      if (et !== 'disponible') {
        throw new Error('Solo se registra el correo cuando la tienda ya confirmó disponibilidad.');
      }
      exigeFecha(d.fecha);
      noAntes(d.fecha, p.fechaConfirmacion, 'la confirmación de disponibilidad');
      q.correoEnviado = true;
      q.fechaCorreo = d.fecha;
      return q;
    }
    case 'traslado': {
      if (et !== 'correo') throw new Error('El traslado se registra después de enviar el correo formal.');
      exigeFecha(d.fecha);
      noAntes(d.fecha, p.fechaCorreo, 'el envío del correo');
      q.fechaTraslado = d.fecha;
      return q;
    }
    case 'recibir': {
      if (et !== 'correo' && et !== 'traslado') {
        throw new Error('La prenda debe tener el correo de transferencia enviado antes de recibirla.');
      }
      exigeFecha(d.fecha);
      noAntes(d.fecha, p.fechaTraslado || p.fechaCorreo, p.fechaTraslado ? 'el traslado' : 'el envío del correo');
      q.fechaRecepcion = d.fecha;
      q.limiteManual = '';
      q.motivoLimite = '';
      return q;
    }
    case 'stock': {
      if (et !== 'pendiente') throw new Error('Solo una prenda pendiente puede marcarse como disponible en tienda.');
      exigeFecha(d.fecha);
      q.enStock = true;
      q.tiendaOrigen = '';
      q.fechaRecepcion = d.fecha;
      q.limiteManual = '';
      q.motivoLimite = '';
      return q;
    }
    case 'extender': {
      if (et !== 'recibida') {
        throw new Error('El plazo corre desde que la prenda llega a la tienda; solo se extiende cuando ya está recibida.');
      }
      if (!d.fecha) throw new Error('Indica hasta qué fecha extiendes el plazo.');
      noAntes(d.fecha, p.fechaRecepcion, 'la recepción');
      q.limiteManual = d.fecha;
      q.motivoLimite = (d.motivo || '').trim();
      return q;
    }
    case 'plazonormal': {
      if (et !== 'recibida' || !p.limiteManual) throw new Error('El plazo ya es el normal.');
      q.limiteManual = '';
      q.motivoLimite = '';
      return q;
    }
    case 'entregar': {
      if (et !== 'recibida') throw new Error('La prenda debe estar recibida en tienda para entregarla.');
      exigeFecha(d.fecha);
      noAntes(d.fecha, p.fechaRecepcion, 'la recepción');
      q.fechaEntrega = d.fecha;
      q.entregadoPor = (d.entregadoPor || '').trim();
      return q;
    }
    case 'cancelar': {
      if (et === 'entregada') throw new Error('Una prenda entregada no se puede cancelar.');
      if (et === 'cancelada') throw new Error('La prenda ya está cancelada.');
      exigeFecha(d.fecha);
      q.fechaCancelacion = d.fecha;
      return q;
    }
    case 'reactivar': {
      if (et !== 'cancelada') throw new Error('La prenda no está cancelada.');
      q.fechaCancelacion = '';
      return q;
    }
    case 'observaciones': {
      q.obsSolicitud = (d.obs || '').trim();
      return q;
    }
    case 'retroceder': {
      switch (et) {
        case 'entregada':
          q.fechaEntrega = '';
          q.entregadoPor = '';
          return q;
        case 'recibida':
          q.fechaRecepcion = '';
          q.enStock = false;
          q.limiteManual = '';
          q.motivoLimite = '';
          return q;
        case 'traslado':
          q.fechaTraslado = '';
          return q;
        case 'correo':
          q.correoEnviado = false;
          q.fechaCorreo = '';
          return q;
        case 'disponible':
          q.resultadoConsulta = '';
          q.fechaConfirmacion = '';
          return q;
        case 'consulta':
          q.fechaConsulta = '';
          q.tiendaOrigen = '';
          return q;
        case 'pendiente':
          if (p.resultadoConsulta === 'no_disponible') {
            q.resultadoConsulta = '';
            return q;
          }
          throw new Error('No hay pasos que deshacer.');
        default:
          throw new Error('No hay pasos que deshacer.');
      }
    }
    default:
      throw new Error('Acción desconocida.');
  }
}

/* ───────────── Validación del formulario ───────────── */

export function validarReserva(r, prendas) {
  const e = [];
  if (!r.nombre.trim()) e.push('Falta el nombre del cliente.');
  if (!r.apellido.trim()) e.push('Falta el apellido del cliente.');
  const dig = soloDigitos(r.celular);
  if (dig.length < 7 || dig.length > 15) e.push('El número de celular no es válido.');
  if (!r.vendedora.trim()) e.push('Indica la vendedora responsable.');
  if (!r.tienda.trim()) e.push('Indica la tienda donde se hizo la separación.');
  if (!r.fechaRegistro) e.push('Falta la fecha de registro.');
  if (!prendas.length) e.push('Agrega al menos una prenda.');
  prendas.forEach((p, i) => {
    const n = prendas.length > 1 ? ` (prenda ${i + 1})` : '';
    if (!p.sku.trim()) e.push(`Falta el código de la prenda${n}.`);
    if (!p.subclase.trim()) e.push(`Falta la subclase${n}.`);
  });
  return e;
}

/* ───────────── Vistas, filtros y resumen ───────────── */

export function enriquecer(data, hoy, aviso = 1, plazo = DIAS_PLAZO) {
  const por = new Map();
  for (const p of data.prendas) {
    if (!por.has(p.reservaId)) por.set(p.reservaId, []);
    por.get(p.reservaId).push(p);
  }
  return data.reservas.map((r) => {
    const ps = (por.get(r.id) || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const estado = estadoReserva(ps, hoy, plazo);
    const lims = ps.map((p) => limitePrenda(p, plazo));
    // Fecha límite más próxima entre las prendas vivas, recibidas y aún no entregadas
    const pend = ps
      .map((p, i) => (!p.fechaCancelacion && !p.fechaEntrega ? lims[i] : ''))
      .filter(Boolean)
      .sort();
    const limite = pend[0] || '';
    const dias = limite ? diasEntre(hoy, limite) : null;
    return {
      r,
      ps,
      estado,
      limite,
      dias,
      porVencer: estado === 'activa' && dias !== null && dias >= 0 && dias <= aviso,
      est: ps.map((p) => estadoPrenda(p, hoy, plazo)),
      lims,
      prog: progreso(ps),
    };
  });
}

export function filtrar(vistas, f = {}) {
  const q = norm(f.q || '');
  const qd = soloDigitos(f.q || '');
  return vistas.filter((v) => {
    const r = v.r;
    if (f.estado) {
      if (f.estado === 'porvencer') {
        if (!v.porVencer) return false;
      } else if (v.estado !== f.estado) return false;
    }
    if (f.vendedora && norm(r.vendedora) !== norm(f.vendedora)) return false;
    if (f.desde && r.fechaRegistro < f.desde) return false;
    if (f.hasta && r.fechaRegistro > f.hasta) return false;
    if (f.estadoPrenda && !v.est.includes(f.estadoPrenda)) return false;
    if (f.tiendaOrigen && !v.ps.some((p) => norm(p.tiendaOrigen) === norm(f.tiendaOrigen))) return false;
    if (f.tiendaSolicitante) {
      const t = norm(f.tiendaSolicitante);
      if (!(norm(r.tienda) === t || v.ps.some((p) => norm(p.tiendaSolicitante) === t))) return false;
    }
    if (q) {
      const blob = norm(
        [
          r.nombre,
          r.apellido,
          r.celular,
          r.vendedora,
          r.tienda,
          ...v.ps.flatMap((p) => [p.sku, p.subclase, p.tiendaOrigen, p.tiendaSolicitante]),
        ].join(' '),
      );
      const okTexto = blob.includes(q);
      const okTel = qd.length >= 3 && soloDigitos(r.celular).includes(qd);
      if (!okTexto && !okTel) return false;
    }
    return true;
  });
}

export function ordenarVistas(vistas) {
  const grupo = (v) => (v.estado === 'vencida' ? 0 : v.estado === 'activa' ? 1 : 2);
  return vistas.slice().sort((a, b) => {
    const ga = grupo(a);
    const gb = grupo(b);
    if (ga !== gb) return ga - gb;
    if (ga < 2) {
      const la = a.limite || '9999-12-31';
      const lb = b.limite || '9999-12-31';
      if (la !== lb) return la < lb ? -1 : 1;
      return a.r.fechaRegistro < b.r.fechaRegistro ? -1 : a.r.fechaRegistro > b.r.fechaRegistro ? 1 : 0;
    }
    return a.r.fechaRegistro < b.r.fechaRegistro ? 1 : a.r.fechaRegistro > b.r.fechaRegistro ? -1 : 0;
  });
}

export function resumen(vistas) {
  const c = {
    activas: 0,
    porVencer: 0,
    vencidas: 0,
    entregadas: 0,
    canceladas: 0,
    pendiente: 0,
    consulta: 0,
    disponible: 0,
    correo: 0,
    traslado: 0,
    recibida: 0,
  };
  for (const v of vistas) {
    if (v.estado === 'activa') c.activas++;
    if (v.porVencer) c.porVencer++;
    if (v.estado === 'vencida') c.vencidas++;
    if (v.estado === 'entregada') c.entregadas++;
    if (v.estado === 'cancelada') c.canceladas++;
    for (const e of v.est) if (e in c) c[e]++;
  }
  return c;
}

export function porVendedora(vistas, catalogo = []) {
  const m = new Map();
  const get = (nombre) => {
    const k = norm(nombre);
    if (!m.has(k)) m.set(k, { nombre: nombre.trim(), total: 0, pendientes: 0, entregadas: 0, canceladas: 0, vencidas: 0 });
    return m.get(k);
  };
  for (const n of catalogo) if (n.trim()) get(n);
  for (const v of vistas) {
    const x = get(v.r.vendedora || '(sin vendedora)');
    x.total++;
    if (v.estado === 'activa') x.pendientes++;
    if (v.estado === 'entregada') x.entregadas++;
    if (v.estado === 'cancelada') x.canceladas++;
    if (v.estado === 'vencida') x.vencidas++;
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
}

/* ───────────── Reportes ───────────── */

export const REPORTES = [
  { id: 'periodo', titulo: 'Separaciones por período' },
  { id: 'vendedora', titulo: 'Separaciones por vendedora' },
  { id: 'estado', titulo: 'Separaciones por estado' },
  { id: 'solicitadas', titulo: 'Prendas solicitadas a otras tiendas' },
  { id: 'confirmadas', titulo: 'Transferencias confirmadas' },
  { id: 'conCorreo', titulo: 'Transferencias con correo enviado' },
  { id: 'sinCorreo', titulo: 'Transferencias pendientes de correo' },
  { id: 'porRecibir', titulo: 'Prendas pendientes de recepción' },
  { id: 'cerradas', titulo: 'Entregadas, canceladas y vencidas' },
];

export const COLS_RESERVA = [
  { h: 'Cliente', w: 26 },
  { h: 'Celular', w: 14 },
  { h: 'Vendedora', w: 16, pantalla: true },
  { h: 'Tienda', w: 16, pantalla: true },
  { h: 'Fecha de registro', w: 14, pantalla: true },
  { h: 'Fecha límite (más próxima)', w: 16, pantalla: true },
  { h: 'N.º de prendas', w: 12, pantalla: true },
  { h: 'Prendas entregadas', w: 12 },
  { h: 'Estado', w: 14, pantalla: true },
  { h: 'Observaciones', w: 34 },
];

export const COLS_PRENDA = [
  { h: 'Cliente', w: 26 },
  { h: 'Celular', w: 14 },
  { h: 'Vendedora', w: 16, pantalla: true },
  { h: 'Código de la prenda', w: 16, pantalla: true },
  { h: 'Subclase', w: 16, pantalla: true },
  { h: 'Tienda solicitante', w: 18 },
  { h: 'Tienda de origen', w: 18, pantalla: true },
  { h: 'Estado', w: 24, pantalla: true },
  { h: 'Fecha de consulta', w: 14 },
  { h: 'Resultado de la consulta', w: 20 },
  { h: 'Fecha de confirmación', w: 14 },
  { h: 'Correo formal enviado', w: 12, pantalla: true },
  { h: 'Fecha del correo', w: 14, pantalla: true },
  { h: 'Fecha de traslado', w: 14 },
  { h: 'Fecha de recepción', w: 14, pantalla: true },
  { h: 'Fecha límite', w: 14, pantalla: true },
  { h: 'Fecha de entrega', w: 14 },
  { h: 'Observaciones de la solicitud', w: 34 },
  { h: 'Observaciones de la prenda', w: 28 },
];

export const COLS_VENDEDORA = [
  { h: 'Vendedora', w: 22 },
  { h: 'Reservas realizadas', w: 14, pantalla: true },
  { h: 'Pendientes', w: 12, pantalla: true },
  { h: 'Entregadas', w: 12, pantalla: true },
  { h: 'Canceladas', w: 12, pantalla: true },
  { h: 'Vencidas', w: 12, pantalla: true },
];

const RESULTADO = { disponible: 'Tiene disponibilidad', no_disponible: 'No tiene' };

export function filaReserva(v) {
  const r = v.r;
  return [
    nombreCliente(r),
    r.celular,
    r.vendedora,
    r.tienda,
    fmtFecha(r.fechaRegistro),
    fmtFecha(v.limite),
    v.ps.length,
    v.ps.filter((p) => p.fechaEntrega).length,
    ESTADOS_RESERVA[v.estado],
    r.observaciones || '',
  ];
}

export function filaPrenda(p, v) {
  const r = v.r;
  const idx = v.ps.indexOf(p);
  const estado = v.est[idx];
  const resultado = p.resultadoConsulta ? RESULTADO[p.resultadoConsulta] : p.fechaConsulta ? 'Sin respuesta' : '';
  return [
    nombreCliente(r),
    r.celular,
    r.vendedora,
    p.sku,
    p.subclase,
    p.tiendaSolicitante || r.tienda,
    p.enStock ? '(stock en tienda)' : p.tiendaOrigen,
    ESTADOS[estado].label,
    fmtFecha(p.fechaConsulta),
    resultado,
    fmtFecha(p.fechaConfirmacion),
    p.correoEnviado ? 'Sí' : 'No',
    fmtFecha(p.fechaCorreo),
    fmtFecha(p.fechaTraslado),
    fmtFecha(p.fechaRecepcion),
    fmtFecha(v.lims[idx]),
    fmtFecha(p.fechaEntrega),
    p.obsSolicitud || '',
    p.obs || '',
  ];
}

function filasPrendas(vistas, pred) {
  const filas = [];
  for (const v of vistas) {
    for (const p of v.ps) if (pred(p, v)) filas.push(filaPrenda(p, v));
  }
  return filas;
}

const viva = (p) => !p.fechaCancelacion;

export function generarReporte(id, vistas, f = {}) {
  const base = filtrar(vistas, { desde: f.desde, hasta: f.hasta, vendedora: f.vendedora });
  const def = REPORTES.find((x) => x.id === id);
  if (!def) throw new Error('Reporte desconocido.');
  const out = { id, titulo: def.titulo };
  switch (id) {
    case 'periodo': {
      const ord = base.slice().sort((a, b) => (a.r.fechaRegistro < b.r.fechaRegistro ? -1 : 1));
      return { ...out, columnas: COLS_RESERVA, filas: ord.map(filaReserva) };
    }
    case 'vendedora': {
      const filas = porVendedora(base).map((x) => [x.nombre, x.total, x.pendientes, x.entregadas, x.canceladas, x.vencidas]);
      return { ...out, columnas: COLS_VENDEDORA, filas };
    }
    case 'estado': {
      const orden = ['activa', 'vencida', 'entregada', 'cancelada'];
      const ord = base.slice().sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado));
      return { ...out, columnas: COLS_RESERVA, filas: ord.map(filaReserva) };
    }
    case 'solicitadas':
      return { ...out, columnas: COLS_PRENDA, filas: filasPrendas(base, (p) => !p.enStock && p.fechaConsulta) };
    case 'confirmadas':
      return {
        ...out,
        columnas: COLS_PRENDA,
        filas: filasPrendas(base, (p) => p.resultadoConsulta === 'disponible' && viva(p)),
      };
    case 'conCorreo':
      return { ...out, columnas: COLS_PRENDA, filas: filasPrendas(base, (p) => p.correoEnviado && viva(p)) };
    case 'sinCorreo':
      return {
        ...out,
        columnas: COLS_PRENDA,
        filas: filasPrendas(base, (p) => p.resultadoConsulta === 'disponible' && !p.correoEnviado && viva(p) && !p.fechaEntrega),
      };
    case 'porRecibir':
      return {
        ...out,
        columnas: COLS_PRENDA,
        filas: filasPrendas(base, (p) => p.correoEnviado && !p.fechaRecepcion && viva(p)),
      };
    case 'cerradas': {
      const orden = ['entregada', 'cancelada', 'vencida'];
      const ord = base
        .filter((v) => orden.includes(v.estado))
        .sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado));
      return { ...out, columnas: COLS_RESERVA, filas: ord.map(filaReserva) };
    }
    default:
      throw new Error('Reporte desconocido.');
  }
}

/** Hojas para exportar todo a un solo libro de Excel. */
export function hojasCompletas(vistas, catalogoVendedoras = []) {
  const ord = ordenarVistas(vistas);
  return [
    { nombre: 'Separaciones', columnas: COLS_RESERVA, filas: ord.map(filaReserva) },
    { nombre: 'Prendas', columnas: COLS_PRENDA, filas: filasPrendas(ord, () => true) },
    {
      nombre: 'Vendedoras',
      columnas: COLS_VENDEDORA,
      filas: porVendedora(vistas, catalogoVendedoras).map((x) => [x.nombre, x.total, x.pendientes, x.entregadas, x.canceladas, x.vencidas]),
    },
  ];
}
