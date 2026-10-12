export const API = `${window.location.origin}/api`;

function proxyUrl(url) {
  if (!url) return "";
  return `${API}/proxy?url=${encodeURIComponent(url)}`;
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...options,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text || `Erro ${res.status}` };
  }

  if (!res.ok) {
    const error = new Error(data.message || `Erro ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function searchSongs(query, limit = 20, signal = null) {
  const options = signal ? { signal } : {};
  return request(`/search?q=${encodeURIComponent(query)}&limit=${limit}`, options);
}

export async function enrichTrack(track) {
  const params = new URLSearchParams({
    title: track.title || "",
    artist: (track.artists?.[0]?.name) || "",
    album: (track.album?.name) || "",
    cover_url: track.cover_url || "",
    duration_ms: String(track.duration_ms || 0),
    external_url: track.external_url || "",
  });
  return request(`/enrich?${params.toString()}`);
}

export async function fetchLyrics(artist, title) {
  return request(`/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
}

export async function fetchPalette(coverUrl) {
  if (!coverUrl) return { hex: "#2F3037" };
  return request(`/palette?image_url=${encodeURIComponent(coverUrl)}`);
}

export { proxyUrl };
