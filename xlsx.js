// Generador mínimo de archivos .xlsx (sin dependencias, funciona sin conexión).
// Un .xlsx es un ZIP con XML; aquí se escribe un ZIP sin compresión.

const enc = new TextEncoder();

/* ───────────── ZIP (método "store") ───────────── */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function fechaDos(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function crearZip(archivos, ahora = new Date()) {
  const { time, date } = fechaDos(ahora);
  const partes = [];
  const central = [];
  let offset = 0;

  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos;
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin compresión
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, datos.length, true);
    cd.setUint32(24, datos.length, true);
    cd.setUint16(28, nombre.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nombre);

    offset += 30 + nombre.length + datos.length;
  }

  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(4, 0, true);
  fin.setUint16(6, 0, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  fin.setUint16(20, 0, true);

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const total = todo.reduce((s, x) => s + x.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const x of todo) {
    salida.set(x, pos);
    pos += x.length;
  }
  return salida;
}

/* ───────────── XML de la hoja de cálculo ───────────── */

function esc(s) {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nombreColumna(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function nombreHoja(n, usados) {
  let base = String(n).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let nombre = base;
  let i = 2;
  while (usados.has(nombre.toLowerCase())) {
    const suf = ` (${i++})`;
    nombre = base.slice(0, 31 - suf.length) + suf;
  }
  usados.add(nombre.toLowerCase());
  return nombre;
}

// Estilos: 0 normal, 1 encabezado, 2 dinero, 3 texto con ajuste de línea
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3B3F8F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function xmlHoja(h) {
  const nCols = h.columnas.length;
  const ultima = nombreColumna(nCols - 1);
  const nFilas = h.filas.length + 1;
  const cols = h.columnas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 14}" customWidth="1"/>`)
    .join('');

  let filas = `<row r="1" ht="30" customHeight="1">`;
  h.columnas.forEach((c, i) => {
    filas += `<c r="${nombreColumna(i)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(c.h)}</t></is></c>`;
  });
  filas += '</row>';

  h.filas.forEach((fila, ri) => {
    const n = ri + 2;
    filas += `<row r="${n}">`;
    fila.forEach((val, ci) => {
      const ref = `${nombreColumna(ci)}${n}`;
      const col = h.columnas[ci] || {};
      if (val === '' || val === null || val === undefined) return;
      if (typeof val === 'number' && Number.isFinite(val)) {
        filas += `<c r="${ref}"${col.money ? ' s="2"' : ''}><v>${val}</v></c>`;
      } else {
        const largo = String(val).length > 40;
        filas += `<c r="${ref}" t="inlineStr"${largo ? ' s="3"' : ''}><is><t xml:space="preserve">${esc(val)}</t></is></c>`;
      }
    });
    filas += '</row>';
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${ultima}${nFilas}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${filas}</sheetData>
<autoFilter ref="A1:${ultima}${nFilas}"/>
</worksheet>`;
}

/**
 * hojas: [{ nombre, columnas: [{ h, w, money? }], filas: [[...]] }]
 * Devuelve un Uint8Array con el contenido del archivo .xlsx
 */
export function crearXlsx(hojas, ahora = new Date()) {
  if (!hojas.length) throw new Error('No hay hojas para exportar.');
  const usados = new Set();
  const nombres = hojas.map((h) => nombreHoja(h.nombre, usados));

  const archivos = [
    {
      nombre: '[Content_Types].xml',
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    },
    {
      nombre: '_rels/.rels',
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres
        .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nombre: 'xl/styles.xml', datos: ESTILOS },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: xmlHoja(h) })),
  ];

  return crearZip(archivos, ahora);
}
