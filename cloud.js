// Общая комната песен в Supabase. Работает через обычные запросы, без библиотек.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const Cloud = (() => {
  const q = encodeURIComponent;
  const auth = { apikey: CONFIG.key };
  if (CONFIG.key.indexOf('eyJ') === 0) auth.Authorization = 'Bearer ' + CONFIG.key;

  async function call(path, opts) {
    opts = opts || {};
    const res = await fetch(CONFIG.url + path, {
      method: opts.method,
      body: opts.body,
      headers: Object.assign({}, auth, opts.headers),
    });
    if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
    return res;
  }

  const send = (method, data, prefer) => ({
    method,
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json', Prefer: prefer },
  });

  const api = {
    async roomExists(room) {
      const res = await call(`/rest/v1/room_members?room=eq.${q(room)}&select=device&limit=1`);
      return (await res.json()).length > 0;
    },

    join(room, device) {
      return call('/rest/v1/room_members',
        send('POST', { room, device }, 'resolution=ignore-duplicates,return=minimal'));
    },

    async songs(room) {
      const res = await call(`/rest/v1/songs?room=eq.${q(room)}&select=id,title,lyrics,audio_path&order=created_at`);
      return res.json();
    },

    async upload(file) {
      const path = uid();
      await call(`/storage/v1/object/songs/${path}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
      });
      return path;
    },

    async addSong(row) {
      const res = await call('/rest/v1/songs', send('POST', row, 'return=representation'));
      return (await res.json())[0];
    },

    async download(path) {
      const res = await call(`/storage/v1/object/public/songs/${path}`);
      return res.blob();
    },

    async removeSong(id, path) {
      await call(`/rest/v1/songs?id=eq.${id}`, { method: 'DELETE' });
      try { await call(`/storage/v1/object/songs/${path}`, { method: 'DELETE' }); } catch (e) {}
    },

    // Выйти из комнаты. Если вышел последний, комната удаляется. Возвращает true, если удалена.
    async leave(room, device) {
      await call(`/rest/v1/room_members?room=eq.${q(room)}&device=eq.${q(device)}`, { method: 'DELETE' });
      const res = await call(`/rest/v1/room_members?room=eq.${q(room)}&select=device&limit=1`);
      if ((await res.json()).length) return false;

      for (const s of await api.songs(room)) await api.removeSong(s.id, s.audio_path);
      return true;
    },
  };
  return api;
})();
