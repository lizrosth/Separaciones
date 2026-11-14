// Base de datos local (IndexedDB). Los datos quedan guardados en el dispositivo.

const NOMBRE = 'separaciones-db';
const VERSION = 1;
let _db = null;

function abrir() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('reservas')) db.createObjectStore('reservas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prendas')) {
        const s = db.createObjectStore('prendas', { keyPath: 'id' });
        s.createIndex('reservaId', 'reservaId', { unique: false });
      }
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'clave' });
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };
      resolve(_db);
    };
    req.onerror = () => reject(req.error || new Error('No se pudo abrir la base de datos.'));
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
}

function pedir(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function terminar(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Operación cancelada.'));
  });
}

export async function cargarTodo() {
  const db = await abrir();
  const tx = db.transaction(['reservas', 'prendas', 'config'], 'readonly');
  const [reservas, prendas, cfg] = await Promise.all([
    pedir(tx.objectStore('reservas').getAll()),
    pedir(tx.objectStore('prendas').getAll()),
    pedir(tx.objectStore('config').get('ajustes')),
  ]);
  return { reservas, prendas, config: cfg ? cfg.valor : null };
}

/** Guarda una reserva con sus prendas y borra las prendas indicadas, todo en una transacción. */
export async function guardarReserva(reserva, prendas, idsPrendasBorrar = []) {
  const db = await abrir();
  const tx = db.transaction(['reservas', 'prendas'], 'readwrite');
  const done = terminar(tx);
  tx.objectStore('reservas').put(reserva);
  const sp = tx.objectStore('prendas');
  for (const p of prendas) sp.put(p);
  for (const id of idsPrendasBorrar) sp.delete(id);
  await done;
}

export async function guardarPrenda(prenda) {
  const db = await abrir();
  const tx = db.transaction('prendas', 'readwrite');
  const done = terminar(tx);
  tx.objectStore('prendas').put(prenda);
  await done;
}

export async function guardarPrendas(prendas) {
  const db = await abrir();
  const tx = db.transaction('prendas', 'readwrite');
  const done = terminar(tx);
  for (const p of prendas) tx.objectStore('prendas').put(p);
  await done;
}

export async function borrarReserva(id) {
  const db = await abrir();
  const tx = db.transaction(['reservas', 'prendas'], 'readwrite');
  const done = terminar(tx);
  tx.objectStore('reservas').delete(id);
  const idx = tx.objectStore('prendas').index('reservaId');
  const req = idx.openKeyCursor(IDBKeyRange.only(id));
  req.onsuccess = () => {
    const cur = req.result;
    if (cur) {
      tx.objectStore('prendas').delete(cur.primaryKey);
      cur.continue();
    }
  };
  await done;
}

export async function guardarConfig(valor) {
  const db = await abrir();
  const tx = db.transaction('config', 'readwrite');
  const done = terminar(tx);
  tx.objectStore('config').put({ clave: 'ajustes', valor });
  await done;
}

export async function borrarTodo() {
  const db = await abrir();
  const tx = db.transaction(['reservas', 'prendas'], 'readwrite');
  const done = terminar(tx);
  tx.objectStore('reservas').clear();
  tx.objectStore('prendas').clear();
  await done;
}

/** Pide al navegador que no borre los datos automáticamente. */
export async function pedirPersistencia() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (_) {
    /* sin soporte */
  }
  return false;
}
