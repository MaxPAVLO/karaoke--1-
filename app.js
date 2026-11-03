const $ = id => document.getElementById(id);

/* ---------- что запомнил телефон ---------- */
const store = {
  get room() { return localStorage.getItem('room') || ''; },
  set room(v) { if (v) localStorage.setItem('room', v); else localStorage.removeItem('room'); },
  get device() {
    let id = localStorage.getItem('device');
    if (!id) { id = uid(); localStorage.setItem('device', id); }
    return id;
  },
};

function show(name) {
  for (const id of ['list', 'form', 'player']) $(id).hidden = id !== name;
  window.scrollTo(0, 0);
}

function setStatus(text) {
  $('status').textContent = text;
  $('status').hidden = !text;
}

/* ---------- список ---------- */
async function renderList() {
  const room = store.room;

  $('roomBtn').textContent = room ? 'Комната: ' + room : 'Войти в комнату';
  $('roomBtn').disabled = !!room;
  $('leaveBtn').hidden = !room;
  $('legend').hidden = !room;

  // свои песни (без комнаты) и песни текущей комнаты
  const songs = (await DB.all()).filter(s => !s.room || s.room === room);
  songs.sort((a, b) => (b.room ? 1 : 0) - (a.room ? 1 : 0));

  $('empty').hidden = songs.length > 0;
  $('songs').replaceChildren(...songs.map(songCard));
}

function goList() {
  show('list');
  return renderList();
}

function songCard(song) {
  const card = document.createElement('div');
  card.className = 'card';

  // три вида песен: своя, общая (уже на телефоне), общая (ещё не скачана)
  const kind = !song.room ? '' : song.audio ? ' shared' : ' cloud';

  const open = document.createElement('button');
  open.className = 'song' + kind;
  const name = document.createElement('span');
  name.textContent = song.title;
  open.append(name);
  if (kind === ' cloud') {
    const hint = document.createElement('small');
    hint.textContent = 'не скачана · нужен интернет';
    open.append(hint);
  }
  open.onclick = () => play(song.id);

  card.append(open);

  // свою песню можно добавить в комнату
  if (!song.room && store.room) {
    const share = document.createElement('button');
    share.className = 'share';
    share.textContent = 'В комнату';
    share.onclick = () => shareSong(song);
    card.append(share);
  }

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '🗑';
  del.setAttribute('aria-label', 'Удалить песню');
  del.onclick = async () => {
    const text = song.room
      ? `Удалить «${song.title}» из комнаты? Песня пропадёт у всех.`
      : `Удалить «${song.title}»?`;
    if (!confirm(text)) return;
    try {
      if (song.room) await Cloud.removeSong(song.remoteId, song.audioPath);
      await DB.remove(song.id);
    } catch (e) {
      alert('Не удалось удалить. Проверьте интернет.');
    }
    renderList();
  };

  card.append(del);
  return card;
}

async function shareSong(song) {
  const room = store.room;
  if (!confirm(`Добавить «${song.title}» в комнату?\n\nЕё увидят все, кто в комнате.`)) return;

  busy++;
  try {
    setStatus('Загружаю песню в комнату…');
    const path = await Cloud.upload(song.audio);
    const row = await Cloud.addSong({ room, title: song.title, lyrics: song.lyrics, audio_path: path });
    song.room = room;
    song.remoteId = row.id;
    song.audioPath = path;
    await DB.put(song);
    setStatus('');
  } catch (e) {
    setStatus('');
    alert('Не удалось добавить песню в комнату. Проверьте интернет.');
  }
  busy--;
  renderList();
}

/* ---------- синхронизация с комнатой ---------- */
let busy = 0;          // пока идёт загрузка или выход, список не обновляем
let syncing = null;

function sync() {
  if (!store.room || busy) return Promise.resolve();
  if (!syncing) syncing = doSync().then(() => { syncing = null; }, () => { syncing = null; });
  return syncing;
}

async function doSync() {
  const room = store.room;
  setStatus('Обновляю список…');
  try {
    const remote = await Cloud.songs(room);
    if (busy) { setStatus(''); return; }
    const local = (await DB.all()).filter(s => s.room === room);
    const known = new Set(local.map(s => s.remoteId));
    const alive = new Set(remote.map(r => r.id));

    for (const r of remote) {
      if (!known.has(r.id)) {
        await DB.add({
          title: r.title, lyrics: r.lyrics, audio: null,
          audioPath: r.audio_path, room, remoteId: r.id,
        });
      }
    }
    for (const s of local) if (!alive.has(s.remoteId)) await DB.remove(s.id);
    setStatus('');
  } catch (e) {
    setStatus('Нет интернета: показаны сохранённые песни');
  }
  renderList();
}

/* ---------- вход и выход ---------- */
$('roomBtn').onclick = async () => {
  const code = (prompt('Введите код комнаты') || '').trim().toLowerCase();
  if (!code) return;

  try {
    setStatus('Проверяю комнату…');
    const exists = await Cloud.roomExists(code);
    const ok = confirm(exists
      ? 'Такая комната уже есть. Войти в неё?\n\nПесни комнаты добавятся на ваш телефон. Ваши песни останутся только у вас.'
      : 'Такой комнаты нет. Создать новую?\n\nЕсли вы ошиблись в коде, нажмите «Отмена».');
    if (!ok) { setStatus(''); return; }

    await Cloud.join(code, store.device);
    store.room = code;
    await renderList();
    await sync();
  } catch (e) {
    setStatus('');
    alert('Нет связи с интернетом. Попробуйте позже.');
  }
};

$('leaveBtn').onclick = async () => {
  const room = store.room;
  if (!confirm('Выйти из комнаты?\n\nВсе песни комнаты останутся на вашем телефоне. Нужен интернет.')) return;

  busy++;
  try {
    // 1. докачать все песни, чтобы они остались в телефоне
    const mine = (await DB.all()).filter(s => s.room === room);
    for (let i = 0; i < mine.length; i++) {
      if (!mine[i].audio) {
        setStatus(`Скачиваю песни: ${i + 1} из ${mine.length}`);
        mine[i].audio = await Cloud.download(mine[i].audioPath);
        await DB.put(mine[i]);
      }
    }
    // 2. выйти из комнаты
    const deleted = await Cloud.leave(room, store.device);
    // 3. песни становятся личными
    for (const s of mine) {
      s.room = null; s.remoteId = null; s.audioPath = null;
      await DB.put(s);
    }
    store.room = '';
    setStatus('');
    await renderList();
    if (deleted) alert('Комната удалена: в ней больше никого нет. Песни остались у вас на телефоне.');
  } catch (e) {
    setStatus('');
    alert('Не удалось выйти из комнаты. Проверьте интернет и повторите.');
  } finally {
    busy--;
  }
};

/* ---------- добавление ---------- */
$('add').onclick = () => {
  $('title').value = '';
  $('file').value = '';
  $('lyrics').value = '';
  show('form');
};

$('cancel').onclick = goList;

$('save').onclick = async () => {
  const title = $('title').value.trim();
  const file = $('file').files[0];
  if (!title) return alert('Введите название песни');
  if (!file)  return alert('Выберите файл с музыкой');

  const room = store.room;
  const song = { title, lyrics: $('lyrics').value, audio: file, room: room || null, remoteId: null };

  $('save').disabled = true;
  busy++;
  try {
    if (room) {                                  // в комнате: сначала в общую базу
      setStatus('Загружаю песню в комнату…');
      const path = await Cloud.upload(file);
      const row = await Cloud.addSong({ room, title, lyrics: song.lyrics, audio_path: path });
      song.remoteId = row.id;
      song.audioPath = path;
    }
    await DB.add(song);
    setStatus('');
    goList();
  } catch (e) {
    setStatus('');
    alert('Не удалось загрузить песню в комнату. Проверьте интернет.');
  }
  busy--;
  $('save').disabled = false;
};

/* ---------- проигрывание ---------- */
async function play(id) {
  const song = await DB.get(id);

  if (!song.audio) {                             // песня из комнаты ещё не скачана
    try {
      setStatus('Скачиваю песню…');
      song.audio = await Cloud.download(song.audioPath);
      await DB.put(song);
      setStatus('');
    } catch (e) {
      setStatus('');
      return alert('Эта песня ещё не скачана. Нужен интернет.');
    }
  }

  $('songTitle').textContent = song.title;
  $('songText').textContent = song.lyrics;
  $('songText').scrollTop = 0;
  $('toggle').textContent = 'Пауза';
  show('player');
  Player.play(song.audio);
}

$('toggle').onclick = () => {
  $('toggle').textContent = Player.toggle() ? 'Пауза' : 'Играть';
};

$('stop').onclick = () => { Player.stop(); goList(); };

Player.audio.addEventListener('ended', () => { Player.stop(); goList(); });

Player.audio.addEventListener('timeupdate', () => {
  const { currentTime, duration } = Player.audio;
  if (duration) $('seek').value = (currentTime / duration) * 1000;
});

$('seek').oninput = () => {
  const { duration } = Player.audio;
  if (duration) Player.audio.currentTime = ($('seek').value / 1000) * duration;
};

/* ---------- запуск ---------- */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if (navigator.serviceWorker) navigator.serviceWorker.register('sw.js');

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('list').hidden) sync();
});

renderList().then(sync);
