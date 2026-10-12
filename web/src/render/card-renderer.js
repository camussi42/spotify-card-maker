
const BODY_FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function getBaseSize(output) {
  switch (output) {
    case "square":
      return { w: 1080, h: 1080, cover: 600, coverY: 170, textMax: 700, pad: 72 };
    case "landscape":
      return { w: 1920, h: 1080, cover: 640, coverY: 220, textMax: 900, pad: 96 };
    case "portrait":
    default:
      return { w: 1080, h: 1920, cover: 700, coverY: 240, textMax: 780, pad: 72 };
  }
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
  if (!m) return { r: 47, g: 48, b: 55 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

function resolveBackground(opt, palette) {
  const base =
    opt.background === "solid"
      ? opt.color || "#2F3037"
      : (palette && palette.hex) || "#2F3037";
  if (opt.gradient === false) {
    return { type: "solid", color: base, base };
  }
  const top = opt.background === "solid" ? 0.06 : 0.0;
  return { type: "gradient", from: shade(base, top), to: shade(base, -0.18), base };
}

function selectLyricsLines(track, opt) {
  if (opt.lyrics === false) return [];
  if (opt.lyricsManual && opt.lyricsManual.trim()) {
    return opt.lyricsManual.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  const synced = (track && track.lyrics && track.lyrics.synced) || [];
  if (!synced.length) return [];
  const start = Math.max(1, opt.lyricsStart || 1);
  const end = opt.lyricsEnd > 0 ? Math.min(opt.lyricsEnd, synced.length) : synced.length;
  return synced.slice(start - 1, end).map((s) => s.line || "").filter(Boolean);
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawBackground(ctx, g) {
  const { size, background } = g;
  if (background.type === "gradient") {
    const grad = ctx.createLinearGradient(0, 0, 0, size.h);
    grad.addColorStop(0, background.from);
    grad.addColorStop(1, background.to);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = background.color;
  }
  ctx.fillRect(0, 0, size.w, size.h);
}

function wrapLines(ctx, lines, maxWidth) {
  const out = [];
  for (const raw of lines) {
    const words = String(raw).split(/\s+/);
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

function sampleArtist(track) {
  return (track && track.artists && track.artists[0] && track.artists[0].name) || "Artista desconhecido";
}

function sampleAlbum(track) {
  return (track && track.album && track.album.name) || "";
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawRoundedImage(ctx, img, x, y, size, radius) {
  if (!img) return;
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

function drawCoverAlbum(ctx, g) {
  const { size, cover } = g;
  const darker = g.background.base || "#000000";

  const pad = size.pad;
  const availW = size.w - pad * 2;
  const availH = size.h - pad * 2;

  const sideRatio = 0.05;
  const infoRatio = 0.4;
  const ratio = 1 + sideRatio * 2 + infoRatio;
  const coverSize = Math.max(
    120,
    Math.floor(Math.min(availW / (1 + sideRatio * 2), availH / ratio))
  );
  const sidePad = Math.round(coverSize * sideRatio);
  const infoH = Math.round(coverSize * infoRatio);
  const cardW = coverSize + sidePad * 2;
  const cardH = coverSize + sidePad * 2 + infoH;
  const cardX = Math.round((size.w - cardW) / 2);
  const cardY = Math.round((size.h - cardH) / 2);

  ctx.save();
  ctx.fillStyle = shade(darker, -0.34);
  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.fill();
  ctx.restore();

  const coverX = cardX + sidePad;
  const coverY = cardY + sidePad;
  if (cover) {
    ctx.save();
    roundRect(ctx, coverX, coverY, coverSize, coverSize, 22);
    ctx.clip();
    ctx.drawImage(cover, coverX, coverY, coverSize, coverSize);
    ctx.restore();
  }

  const title = (g.track && g.track.title) || "";
  const artist = sampleArtist(g.track);
  const album = sampleAlbum(g.track);
  const tx = coverX;
  const textW = cardW - sidePad * 2;

  function fitText(lines, weight, maxPx, startRatio) {
    for (let px = Math.round(coverSize * startRatio); px >= 18; px -= 2) {
      ctx.font = `${weight} ${px}px ${BODY_FONT}`;
      if (wrapLines(ctx, lines, textW).length <= maxPx) return px;
    }
    return 18;
  }

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let y = coverY + coverSize + Math.round(infoH * 0.4);

  const titlePx = fitText([title], 800, 2, 0.12);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titlePx}px ${BODY_FONT}`;
  const titleLines = wrapLines(ctx, [title], textW).slice(0, 2);
  const titleLineH = Math.round(titlePx * 1.12);
  titleLines.forEach((line) => {
    ctx.fillText(line, tx, y);
    y += titleLineH;
  });

  y += Math.round(coverSize * 0.02);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `600 ${Math.round(coverSize * 0.052)}px ${BODY_FONT}`;
  const artistLines = wrapLines(ctx, [artist], textW).slice(0, 2);
  const artistLineH = Math.round(coverSize * 0.062);
  artistLines.forEach((line) => {
    ctx.fillText(line, tx, y);
    y += artistLineH;
  });

  if (album && album !== title && album !== artist) {
    y += Math.round(coverSize * 0.015);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `400 ${Math.round(coverSize * 0.045)}px ${BODY_FONT}`;
    ctx.fillText(album, tx, y);
  }
  ctx.restore();
}

function drawFull(ctx, g) {
  const { size, cover } = g;
  const darker = g.background.base || "#000000";

  const pad = size.pad;
  const availW = size.w - pad * 2;
  const availH = size.h - pad * 2;

  const cardW = Math.floor(Math.min(availW, availH * 0.82));
  const innerPad = Math.round(cardW * 0.09);
  const textW = cardW - innerPad * 2;
  const thumb = Math.round(cardW * 0.18);

  const title = (g.track && g.track.title) || "";
  const artist = sampleArtist(g.track);
  const album = sampleAlbum(g.track);
  const lyrics = (g.lyrics || []).slice(0, 5);

  const headerH = thumb;
  const gap = Math.round(cardW * 0.12);
  const footerH = album ? Math.round(cardW * 0.12) : 0;
  const bottomPad = Math.round(cardW * 0.1);

  let fit = { fontSize: 18, lineH: 24, wrapped: [] };
  for (let fs = Math.round(cardW * 0.15); fs >= 18; fs -= 2) {
    ctx.font = `800 ${fs}px ${BODY_FONT}`;
    const wrapped = lyrics.length ? wrapLines(ctx, lyrics, textW) : [];
    if (wrapped.length > 5) continue;
    const lineH = Math.round(fs * 1.3);
    const blockH = wrapped.length * lineH;
    const total = innerPad + headerH + gap + blockH + gap + footerH + bottomPad;
    fit = { fontSize: fs, lineH, wrapped, blockH };
    if (total <= availH) break;
  }

  const blockH = fit.wrapped.length * fit.lineH;
  const cardH = Math.min(
    availH,
    innerPad + headerH + gap + blockH + gap + footerH + bottomPad
  );
  const cardX = Math.round((size.w - cardW) / 2);
  const cardY = Math.round((size.h - cardH) / 2);

  ctx.save();
  ctx.fillStyle = shade(darker, -0.3);
  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.fill();
  ctx.restore();

  const ix = cardX + innerPad;
  const top = cardY + innerPad;

  drawRoundedImage(ctx, cover, ix, top, thumb, 12);

  const infoX = ix + thumb + Math.round(cardW * 0.05);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(cardW * 0.07)}px ${BODY_FONT}`;
  const tLines = wrapLines(ctx, [title], cardX + cardW - innerPad - infoX).slice(0, 2);
  let iy = top + Math.round(thumb * 0.12);
  tLines.forEach((line) => {
    ctx.fillText(line, infoX, iy);
    iy += Math.round(cardW * 0.082);
  });
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `500 ${Math.round(cardW * 0.045)}px ${BODY_FONT}`;
  ctx.fillText(`Song · ${artist}`, infoX, iy + 2);
  ctx.restore();

  if (fit.wrapped.length) {
    let ly = top + headerH + gap;
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${fit.fontSize}px ${BODY_FONT}`;
    fit.wrapped.forEach((line) => {
      ctx.fillText(line, ix, ly);
      ly += fit.lineH;
    });
    ctx.restore();
  }

  if (album) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `500 ${Math.round(cardW * 0.045)}px ${BODY_FONT}`;
    ctx.fillText(album, ix, top + headerH + gap + blockH + gap + footerH);
    ctx.restore();
  }
}

async function renderCard(canvas, track, options, pixelScale = 2) {
  if (!track) return;
  const size = getBaseSize(options.output);
  const background = resolveBackground(options, options.palette);
  const lyrics = selectLyricsLines(track, options);

  const dpr = Math.max(1, pixelScale);
  canvas.width = Math.round(size.w * dpr);
  canvas.height = Math.round(size.h * dpr);
  canvas.style.width = `${size.w}px`;
  canvas.style.height = `${size.h}px`;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);

  const g = { size, track, background, lyrics };
  g.cover = await loadImage(track.cover_url || null);

  drawBackground(ctx, g);

  ctx.save();
  switch (options.layout) {
    case "full":
      drawFull(ctx, g);
      break;
    case "cover-album":
    default:
      drawCoverAlbum(ctx, g);
      break;
  }
  ctx.restore();
}

class CardRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.pixelScale = opts.pixelScale || 2;
  }
  async render(track, options) {
    return renderCard(this.canvas, track, options, this.pixelScale);
  }
}

export { CardRenderer, renderCard };

