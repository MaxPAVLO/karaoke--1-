// Песни хранятся прямо в телефоне (IndexedDB): название, текст и аудиофайл.
const DB = (() => {
  const open = () => new Promise((ok, fail) => {
    const req = indexedDB.open('karaoke', 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });

  const run = async (mode, action) => {
    const db = await open();
    return new Promise((ok, fail) => {
      const req = action(db.transaction('songs', mode).objectStore('songs'));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
  };

  return {
    add:    song => run('readwrite', s => s.add(song)),
    put:    song => run('readwrite', s => s.put(song)),
    all:    ()   => run('readonly',  s => s.getAll()),
    get:    id   => run('readonly',  s => s.get(id)),
    remove: id   => run('readwrite', s => s.delete(id)),
  };
})();
