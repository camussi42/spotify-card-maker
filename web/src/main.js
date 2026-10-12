import { CardRenderer, renderCard } from "./render/card-renderer.js";
import { searchSongs, enrichTrack, fetchPalette, proxyUrl } from "./api.js";

const $ = (id) => document.getElementById(id);

const state = {
  query: "",
  results: [],
  track: null,
  covers: [],
  coverUrl: "",
  coverPalette: {},
  layout: "cover-album",
  background: "auto",
  color: "#2F3037",
  gradient: true,
  output: "portrait",
  lyricsStart: 1,
  lyricsEnd: 0,
  lyricsManual: "",
  loaded: false,
};

const MAX_LYRICS_LINES = 5;

const canvas = $("card-canvas");
const renderer = new CardRenderer(canvas);

const screens = {
  search: $("step-search"),
  results: $("step-results"),
  settings: $("step-settings"),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

function getSegmentedButtons(container) {
  return Array.from(container.querySelectorAll(".seg-btn"));
}

function setSegmentedActive(buttons, activeValue, activeKey, getValue = (btn) => btn.dataset.value) {
  buttons.forEach((btn) => {
    const active = String(getValue(btn)) === String(activeValue);
    btn.classList.toggle("active", active);
    if (active) state[activeKey] = activeValue;
  });
}

function formatSize(output) {
  if (output === "square") return "1080×1080";
  if (output === "landscape") return "1920×1080";
  return "1080×1920";
}

let searchTimer = null;
let searchAbort = null;
let activeIndex = -1;

function showSuggestions() {
  $("suggestions").classList.remove("hidden");
}

function hideSuggestions() {
  $("suggestions").classList.add("hidden");
  activeIndex = -1;
}

function highlightActive() {
  const items = Array.from($("suggestions").querySelectorAll(".suggestion-item"));
  items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
  const el = items[activeIndex];
  if (el) el.scrollIntoView({ block: "nearest" });
}

function renderSuggestions(list) {
  const box = $("suggestions");
  box.innerHTML = "";
  if (!list.length) {
    box.innerHTML = `<div class="suggestion-empty">Nenhum resultado. Tente outro nome.</div>`;
    showSuggestions();
    return;
  }
  list.forEach((track, index) => {
    const artist = (track.artists || [{}])[0].name || "";
    const album = (track.album || {}).name || "";
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.dataset.index = String(index);
    const thumb = track.cover_url
      ? `<img src="${proxyUrl(track.cover_url)}" alt="" loading="lazy" />`
      : `<span class="suggestion-thumb-empty">🎵</span>`;
    item.innerHTML = `
      <div class="suggestion-thumb">${thumb}</div>
      <div class="suggestion-info">
        <div class="suggestion-title">${escapeHtml(track.title)}</div>
        <div class="suggestion-sub">${escapeHtml(artist)}${album ? " • " + escapeHtml(album) : ""}</div>
      </div>
    `;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      chooseTrack(track);
    });
    box.appendChild(item);
  });
  showSuggestions();
  highlightActive();
}

async function runSearch(q) {
  if (searchAbort) searchAbort.abort();
  const controller = new AbortController();
  searchAbort = controller;
  $("search-hint").textContent = "Buscando…";
  try {
    const data = await searchSongs(q, 8, controller.signal);
    state.results = data.results || [];
    $("search-hint").textContent = "";
    renderSuggestions(state.results);
  } catch (err) {
    if (err.name !== "AbortError") {
      $("search-hint").textContent = err.message || "Falha na busca.";
      hideSuggestions();
    }
  }
}

function onSearchInput(e) {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (searchAbort && !q) searchAbort.abort();
  if (!q) {
    hideSuggestions();
    $("search-hint").textContent = "";
    return;
  }
  searchTimer = setTimeout(() => runSearch(q), 300);
}

function onSearchKeydown(e) {
  const box = $("suggestions");
  const visible = !box.classList.contains("hidden");
  const items = Array.from(box.querySelectorAll(".suggestion-item"));

  if (e.key === "ArrowDown" && items.length) {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % items.length;
    highlightActive();
  } else if (e.key === "ArrowUp" && items.length) {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + items.length) % items.length;
    highlightActive();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (visible && activeIndex >= 0 && state.results[activeIndex]) {
      chooseTrack(state.results[activeIndex]);
    } else if (state.results[0]) {
      chooseTrack(state.results[0]);
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
}

function onSearchSubmit(e) {
  e.preventDefault();
  const q = $("search-input").value.trim();
  if (!q) return;
  clearTimeout(searchTimer);
  runSearch(q);
}


function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function chooseTrack(track) {
  hideSuggestions();
  clearTimeout(searchTimer);
  if (searchAbort) searchAbort.abort();
  $("status-msg").textContent = "Carregando letra e capas…";
  $("status-msg").classList.remove("hidden");
  showScreen("settings");
  try {
    const data = await enrichTrack(track);
    state.track = data.track;
    state.covers = (data.track.covers || []).filter((c) => c.url);
    const firstCover = state.covers[0]?.url || track.cover_url || "";
    state.coverUrl = firstCover;
    state.track.cover_url = firstCover;
    renderCovers();
    updateMeta();
    await refreshPalette();
    state.lyricsStart = 1;
    state.lyricsEnd = 0;
    updateLyricsControls();
    updateLyricsVisibility();
    state.loaded = true;
    $("export-btn").disabled = false;
    await refresh();
  } catch (err) {
    $("status-msg").textContent = err.message || "Falha ao carregar a música.";
  }
}

function renderCovers() {
  const list = $("covers-list");
  list.innerHTML = "";
  if (!state.covers.length) {
    $("covers-hint").textContent = "Nenhuma capa extra encontrada. Usando a capa principal.";
    return;
  }
  $("covers-hint").textContent = "Escolha qual capa usar no card.";
  state.covers.forEach((cover, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cover-thumb-btn";
    btn.classList.toggle("active", cover.url === state.coverUrl);
    const label = (cover.types && cover.types[0]) || "Capa";
    btn.innerHTML = `<img src="${proxyUrl(cover.thumb || cover.url)}" alt="${escapeHtml(label)}" loading="lazy" />
      <span class="cover-label">${escapeHtml(label)}</span>`;
    btn.addEventListener("click", () => selectCover(index));
    list.appendChild(btn);
  });
}

async function selectCover(index) {
  const cover = state.covers[index];
  if (!cover) return;
  state.coverUrl = cover.url;
  state.track.cover_url = cover.url;
  Array.from($("covers-list").children).forEach((el, i) => {
    el.classList.toggle("active", i === index);
  });
  await refreshPalette();
  await refresh();
}

async function refreshPalette() {
  try {
    const p = await fetchPalette(state.coverUrl);
    state.coverPalette = p || {};
    if (state.background === "auto") await refresh();
  } catch {
    state.coverPalette = {};
  }
}

function updateLyricsVisibility() {
  const detail = $("lyrics-detail");
  if (!detail) return;
  const show = state.layout === "full";
  detail.classList.toggle("hidden", !show);
}

function clampLyrics() {
  const synced = (state.track?.lyrics?.synced || []);
  const total = synced.length;
  const warn = $("lyrics-limit");
  if (!total || state.lyricsManual.trim()) {
    if (warn) warn.classList.add("hidden");
    return;
  }
  let start = Math.max(1, Math.min(state.lyricsStart || 1, total));
  const explicitEnd = state.lyricsEnd > 0;
  let end = explicitEnd
    ? Math.min(state.lyricsEnd, total)
    : Math.min(total, start + MAX_LYRICS_LINES - 1);
  if (end < start) start = Math.max(1, end - MAX_LYRICS_LINES + 1);

  let over = false;
  if (end - start + 1 > MAX_LYRICS_LINES) {
    start = Math.max(1, end - MAX_LYRICS_LINES + 1);
    over = true;
  }

  state.lyricsStart = start;
  state.lyricsEnd = end;
  if (warn) warn.classList.toggle("hidden", !over);
  const startInput = $("lyrics-start");
  const endInput = $("lyrics-end");
  if (startInput) startInput.value = start;
  if (endInput) endInput.value = end;
}

function updateLyricsControls() {
  const list = $("lyrics-list");
  const start = $("lyrics-start");
  const end = $("lyrics-end");

  if (state.lyricsManual.trim()) {
    list.innerHTML = "";
    list.classList.add("hidden");
    $("lyrics-limit").classList.add("hidden");
    return;
  }

  const synced = (state.track?.lyrics?.synced || []);
  list.innerHTML = "";
  if (!synced.length) {
    list.classList.remove("hidden");
    list.innerHTML = "<span class='hint'>Nenhuma letra encontrada. Cole manualmente acima se quiser.</span>";
    start.disabled = true;
    end.disabled = true;
    $("lyrics-limit").classList.add("hidden");
    return;
  }

  start.disabled = false;
  end.disabled = false;
  list.classList.remove("hidden");

  clampLyrics();

  synced.forEach((item, index) => {
    const lineNo = index + 1;
    const line = item.line || `Linha ${lineNo}`;
    const span = document.createElement("span");
    span.dataset.index = String(index);
    span.innerHTML = `<span>${escapeHtml(line)}</span><span class="muted">${lineNo}</span>`;
    span.addEventListener("click", () => {
      state.lyricsEnd = lineNo;
      clampLyrics();
      updateLyricsControls();
      refresh();
    });
    span.classList.toggle(
      "active",
      lineNo >= state.lyricsStart && lineNo <= state.lyricsEnd
    );
    list.appendChild(span);
  });
}

function buildRendererOptions() {
  const lyricsEnabled =
    state.lyricsManual.trim() !== "" ||
    (state.track?.lyrics?.synced || []).length > 0 ||
    state.lyricsStart <= state.lyricsEnd;

  return {
    layout: state.layout,
    background: state.background,
    color: state.color,
    gradient: state.gradient,
    palette: state.coverPalette,
    lyricsStart: state.lyricsStart,
    lyricsEnd: state.lyricsEnd,
    lyricsManual: state.lyricsManual,
    output: state.output,
    lyrics: lyricsEnabled,
  };
}

async function refresh() {
  if (!state.loaded || !state.track) return;
  $("status-msg").classList.add("hidden");
  await renderCard(canvas, state.track, buildRendererOptions());
  $("preview-size").textContent = formatSize(state.output);
}

async function exportPNG() {
  if (!state.loaded) return;
  try {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (item) => (item ? resolve(item) : reject(new Error("Falha ao gerar a imagem."))),
        "image/png"
      );
    });
    const url = URL.createObjectURL(blob);
    const name = (state.track?.title || "spotify-card")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "spotify-card"}.png`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1200);
  } catch (err) {
    $("status-msg").textContent = err.message || "Não foi possível gerar o PNG.";
    $("status-msg").classList.remove("hidden");
  }
}

function updateMeta() {
  const t = state.track || {};
  $("track-title").textContent = t.title || "—";
  $("track-artists").textContent = (t.artists || []).map((a) => a.name).filter(Boolean).join(", ") || "—";
  $("track-album").textContent = (t.album || {}).name || "—";
}

function bindEvents() {
  const input = $("search-input");
  $("search-form").addEventListener("submit", onSearchSubmit);
  input.addEventListener("input", onSearchInput);
  input.addEventListener("keydown", onSearchKeydown);
  input.addEventListener("focus", () => {
    if (state.results.length) showSuggestions();
  });
  input.addEventListener("blur", () => {
    setTimeout(() => hideSuggestions(), 150);
  });

  $("back-search-btn").addEventListener("click", () => showScreen("search"));
  $("back-results-btn").addEventListener("click", () => showScreen("search"));

  document.querySelectorAll('input[name="layout"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.layout = radio.value;
      updateLyricsVisibility();
      refresh();
    });
  });

  const bgBtns = getSegmentedButtons($("background-detail"));
  setSegmentedActive(bgBtns, state.background, "background", (btn) => btn.dataset.bg);
  bgBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.background = btn.dataset.bg;
      setSegmentedActive(bgBtns, state.background, "background", (b) => b.dataset.bg);
      refresh();
    });
  });

  $("color-input").addEventListener("input", (e) => {
    state.color = e.target.value;
    state.background = "solid";
    setSegmentedActive(bgBtns, "solid", "background", (b) => b.dataset.bg);
    refresh();
  });

  $("gradient-toggle").addEventListener("change", (e) => {
    state.gradient = e.target.checked;
    refresh();
  });

  const formatBtns = getSegmentedButtons($("output-detail"));
  setSegmentedActive(formatBtns, state.output, "output", (btn) => btn.dataset.format);
  formatBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.output = btn.dataset.format;
      setSegmentedActive(formatBtns, state.output, "output", (b) => b.dataset.format);
      refresh();
    });
  });

  $("lyrics-start").addEventListener("input", (e) => {
    state.lyricsStart = Math.max(1, Number(e.target.value) || 1);
    clampLyrics();
    updateLyricsControls();
    refresh();
  });
  $("lyrics-end").addEventListener("input", (e) => {
    state.lyricsEnd = Math.max(0, Number(e.target.value) || 0);
    clampLyrics();
    updateLyricsControls();
    refresh();
  });
  $("lyrics-reset").addEventListener("click", () => {
    state.lyricsStart = 1;
    state.lyricsEnd = 0;
    clampLyrics();
    updateLyricsControls();
    refresh();
  });
  $("lyrics-manual").addEventListener("input", (e) => {
    state.lyricsManual = e.target.value;
    updateLyricsControls();
    refresh();
  });

  $("export-btn").addEventListener("click", exportPNG);
  $("capture-btn").addEventListener("click", refresh);
}

bindEvents();
showScreen("search");

