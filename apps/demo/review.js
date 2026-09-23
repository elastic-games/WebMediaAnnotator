const annotator = document.getElementById('annotator');
const status = document.getElementById('status');
const notesList = document.getElementById('notes');
const noteInput = document.getElementById('note');
const saveButton = document.getElementById('save');
let instance;
let notes = [];
let saveTimer;
let lastAnnotations = '';
let saving = Promise.resolve();

const info = await fetch('/api/feedback').then(response => response.json());
document.getElementById('filename').textContent = info.video;

async function waitForInstance() {
  for (let i = 0; i < 100; i++) {
    if (annotator.instance) return annotator.instance;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Annotator did not initialize');
}

function timecode(frame, fps) {
  const seconds = frame / fps;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${String(Math.round((seconds % 1) * 100)).padStart(2, '0')}`;
}

function renderNotes() {
  notesList.replaceChildren();
  const fps = instance.store.getState().fps;
  for (const note of [...notes].sort((a, b) => a.frame - b.frame)) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    const time = document.createElement('span');
    const body = document.createElement('span');
    time.className = 'time';
    body.className = 'note';
    time.textContent = `${timecode(note.frame, fps)} · frame ${note.frame}`;
    body.textContent = note.text;
    button.append(time, body);
    button.addEventListener('click', () => instance.player.seekToFrame(note.frame));
    li.append(button);
    notesList.append(li);
  }
  document.getElementById('count').textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
}

function updatePosition() {
  const state = instance.store.getState();
  document.getElementById('position').textContent = `${timecode(state.currentFrame, state.fps)} · frame ${state.currentFrame}`;
}

function save() {
  const state = instance.store.getState();
  const payload = { version: 1, video: info.video, fps: state.fps, notes, annotations: state.annotations };
  status.textContent = 'Saving…';
  saving = saving.catch(() => {}).then(async () => {
    const response = await fetch('/api/feedback', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    status.textContent = 'Saved';
  }).catch(error => { status.textContent = `Save failed: ${error.message}`; throw error; });
  return saving;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  status.textContent = 'Unsaved changes';
  saveTimer = setTimeout(() => { void save().catch(() => {}); }, 600);
}

try {
  instance = await waitForInstance();
  notes = Array.isArray(info.notes) ? info.notes : [];
  if (Array.isArray(info.annotations)) instance.store.setState({ annotations: info.annotations });
  lastAnnotations = JSON.stringify(instance.store.getState().annotations);
  instance.store.on('state:changed', () => {
    updatePosition();
    const next = JSON.stringify(instance.store.getState().annotations);
    if (next !== lastAnnotations) { lastAnnotations = next; scheduleSave(); }
  });
  updatePosition();
  renderNotes();
  status.textContent = 'Ready';
  document.getElementById('add').addEventListener('click', () => {
    const text = noteInput.value.trim();
    if (!text) return;
    notes.push({ id: crypto.randomUUID(), frame: instance.store.getState().currentFrame, text });
    noteInput.value = '';
    renderNotes();
    scheduleSave();
  });
  saveButton.addEventListener('click', () => { clearTimeout(saveTimer); void save().catch(() => {}); });
} catch (error) {
  status.textContent = error.message;
}
