
const BODY_FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const MAX_LYRIC_CHARS = 200;
const MAX_LYRIC_LINES = 8;
const MAX_FRAME_AREA = 0.5;
const CHAR_W = 0.55;
const LINE_H = 1.28;
const TEXT_SAFETY = 0.9;

function totalChars(lines) {
  let n = 0;
  for (const line of lines) n += String(line || "").length;
  return n;
}

function fontForChars(chars, area) {
  if (!chars || area <= 0) return 0;
  return Math.sqrt((area * TEXT_SAFETY) / (chars * CHAR_W * LINE_H));
}

function fitTextSize(ctx, text, weight, area, maxPx, minPx, maxLines, maxWidth) {
  const chars = String(text || "").length;
  let px = chars ? Math.round(fontForChars(chars, area)) : maxPx;
  px = Math.max(minPx, Math.min(maxPx, px));
  for (; px >= minPx; px -= 2) {
    ctx.font = `${weight} ${px}px ${BODY_FONT}`;
    if (wrapLines(ctx, [text], maxWidth).length <= maxLines) return px;
  }
  return minPx;
}

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
  const strength = Math.max(0, Math.min(100, opt.gradientIntensity ?? 50)) / 50;
  return { type: "gradient", from: shade(base, top), to: shade(base, -0.18 * strength), base };
}

function selectLyricsLines(track, opt) {
  if (opt.lyrics === false) return [];
  if (opt.lyricsManual && opt.lyricsManual.trim()) {
    const manual = opt.lyricsManual.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return clipToCharBudget(manual, MAX_LYRIC_CHARS);
  }
  const synced = (track && track.lyrics && track.lyrics.synced) || [];
  if (!synced.length) return [];
  const start = Math.max(1, opt.lyricsStart || 1);
  const end = opt.lyricsEnd > 0 ? Math.min(opt.lyricsEnd, synced.length) : synced.length;
  const lines = synced.slice(start - 1, end).map((s) => s.line || "").filter(Boolean);
  return clipToCharBudget(lines, MAX_LYRIC_CHARS);
}

function clipToCharBudget(lines, maxChars) {
  let out = lines.slice();
  let chars = totalChars(out);
  while (out.length > 1 && (chars > maxChars || out.length > MAX_LYRIC_LINES)) {
    chars -= out[0].length;
    out = out.slice(1);
  }
  if (out.length && chars > maxChars) {
    out[0] = `${out[0].slice(0, maxChars - 1)}…`;
  }
  return out;
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

function splitLongWord(ctx, word, maxWidth) {
  // Quebra palavra sem espaços (ex.: "aaaaaaa...") em pedaços que cabem.
  const parts = [];
  let current = "";
  for (const ch of String(word)) {
    const test = current + ch;
    if (current && ctx.measureText(test).width > maxWidth) {
      parts.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) parts.push(current);
  return parts.length ? parts : [word];
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
    if (current) {
      // Palavra única maior que a largura: quebra por caractere.
      if (!current.includes(" ") && ctx.measureText(current).width > maxWidth) {
        out.push(...splitLongWord(ctx, current, maxWidth));
      } else {
        out.push(current);
      }
    }
  }
  return out;
}

function drawLyricLine(ctx, line, x, y, maxWidth, fontSize) {
  // "Justificado" via letter-spacing: distribui a folga entre TODOS os
  // caracteres, mas SÓ em linhas que já ocupam >= 75% da largura e com teto
  // baixo (4% da fonte) para nunca ficar esticado.
  const natural = ctx.measureText(line).width;
  const extra = maxWidth - natural;
  if (natural < maxWidth * 0.75 || extra <= 0 || line.length < 12) {
    ctx.fillText(line, x, y);
    return;
  }
  const prev = ctx.letterSpacing;
  const ls = Math.min(extra / line.length, fontSize * 0.04);
  if (ls >= 0.5) {
    try { ctx.letterSpacing = `${ls.toFixed(2)}px`; } catch { /* canvas antigo */ }
    ctx.fillText(line, x, y);
    try { ctx.letterSpacing = prev ?? "0px"; } catch { /* canvas antigo */ }
    return;
  }
  ctx.fillText(line, x, y);
}

function wrapLyricsLines(ctx, lines, maxWidth) {
  // Greedy por linha original (preserva as quebras da letra) + rebalanceamento:
  // se UMA linha crua gerou 2+ linhas, testa todas as divisões em N-1..N partes
  // e escolhe a que minimiza a maior largura (texto mais "quadrado"), desde que
  // não aumente o nº de linhas. Ex.: 3 finas -> 2 equilibradas.
  const out = [];
  for (const raw of lines) {
    const words = String(raw).split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const greedy = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        greedy.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) greedy.push(current);
    // Palavra única maior que a largura (ex.: "aaaa..."): quebra por caractere.
    if (greedy.length === 1 && words.length === 1 && ctx.measureText(greedy[0]).width > maxWidth) {
      out.push(...splitLongWord(ctx, words[0], maxWidth));
    } else if (greedy.length >= 2 && words.length > greedy.length) {
      const widthOf = (a, b) => ctx.measureText(words.slice(a, b).join(" ")).width;
      let best = null;
      for (let n = greedy.length - 1; n <= greedy.length; n++) {
        if (n < 1 || n >= words.length) continue;
        // DP simples: divide em n partes minimizando a maior largura.
        const dp = Array.from({ length: words.length + 1 }, () => Array(n + 1).fill(Infinity));
        const cut = Array.from({ length: words.length + 1 }, () => Array(n + 1).fill(-1));
        dp[0][0] = 0;
        for (let p = 1; p <= n; p++) {
          for (let i = p; i <= words.length; i++) {
            for (let j = p - 1; j < i; j++) {
              const w = widthOf(j, i);
              if (w > maxWidth) continue;
              const m = Math.max(dp[j][p - 1], w);
              if (m < dp[i][p]) { dp[i][p] = m; cut[i][p] = j; }
            }
          }
        }
        if (dp[words.length][n] < Infinity && (!best || dp[words.length][n] < best.max)) {
          const parts = [];
          let i = words.length;
          let p = n;
          while (p > 0) { const j = cut[i][p]; parts.unshift(words.slice(j, i).join(" ")); i = j; p--; }
          best = { lines: parts, max: dp[words.length][n] };
        }
      }
      // Só troca se a maior linha ficar >= 10% mais equilibrada.
      const greedyMax = Math.max(...greedy.map((l) => ctx.measureText(l).width));
      if (best && best.max < greedyMax * 0.9) out.push(...best.lines);
      else out.push(...greedy);
    } else {
      out.push(...greedy);
    }
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
  const widthRatio = 1 + sideRatio * 2;
  const ratio = widthRatio + infoRatio;
  const maxCardArea = size.w * size.h * MAX_FRAME_AREA;
  const areaCap = Math.sqrt((maxCardArea * 0.995) / (widthRatio * ratio));
  const coverSize = Math.max(
    120,
    Math.floor(Math.min(availW / widthRatio, availH / ratio, areaCap))
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
  const textTop = coverY + coverSize + Math.round(infoH * 0.4);
  const textBottom = cardY + cardH - Math.round(sidePad * 0.5);
  const maxTextH = Math.max(40, textBottom - textTop);
  const textArea = textW * maxTextH;
  const gapTitle = Math.round(coverSize * 0.02);
  const gapAlbum = Math.round(coverSize * 0.015);
  const showAlbum = Boolean(album && album !== title && album !== artist);

  let titlePx = fitTextSize(ctx, title, 800, textArea * 0.5, Math.round(coverSize * 0.12), 22, 2, textW);
  let artistPx = fitTextSize(ctx, artist, 600, textArea * 0.3, Math.round(coverSize * 0.052), 18, 2, textW);
  let albumPx = showAlbum
    ? fitTextSize(ctx, album, 400, textArea * 0.2, Math.round(coverSize * 0.045), 16, 1, textW)
    : 0;

  let titleLines = [];
  let artistLines = [];
  for (let i = 0; i < 12; i++) {
    ctx.font = `800 ${titlePx}px ${BODY_FONT}`;
    titleLines = wrapLines(ctx, [title], textW).slice(0, 2);
    ctx.font = `600 ${artistPx}px ${BODY_FONT}`;
    artistLines = wrapLines(ctx, [artist], textW).slice(0, 2);
    const gaps =
      (titleLines.length ? gapTitle : 0) + (artistLines.length && showAlbum ? gapAlbum : 0);
    const blockH =
      titleLines.length * Math.round(titlePx * 1.12) +
      artistLines.length * Math.round(artistPx * 1.2) +
      (albumPx ? Math.round(albumPx * 1.3) : 0) +
      gaps;
    if (blockH <= maxTextH) break;
    titlePx = Math.max(22, titlePx - 2);
    artistPx = Math.max(18, artistPx - 2);
    albumPx = albumPx ? Math.max(16, albumPx - 2) : 0;
  }

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let y = textTop;
  if (titleLines.length) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${titlePx}px ${BODY_FONT}`;
    const titleLineH = Math.round(titlePx * 1.12);
    titleLines.forEach((line) => {
      ctx.fillText(line, tx, y);
      y += titleLineH;
    });
  }

  if (artistLines.length) {
    y += gapTitle;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `600 ${artistPx}px ${BODY_FONT}`;
    const artistLineH = Math.round(artistPx * 1.2);
    artistLines.forEach((line) => {
      ctx.fillText(line, tx, y);
      y += artistLineH;
    });
  }

  if (albumPx) {
    y += gapAlbum;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `400 ${albumPx}px ${BODY_FONT}`;
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
  const maxCardH = Math.min(availH, Math.floor((size.w * size.h * MAX_FRAME_AREA) / cardW));
  const innerPad = Math.round(cardW * 0.09);
  const topPad = Math.round(cardW * 0.115);
  const textW = cardW - innerPad * 2;
  const thumb = Math.round(cardW * 0.18);

  const title = (g.track && g.track.title) || "";
  const artist = sampleArtist(g.track);
  const album = sampleAlbum(g.track);
  const lyrics = g.lyrics || [];

  const headerH = thumb;
  const gapTop = Math.round(cardW * 0.025);
  const gapBottom = Math.round(cardW * 0.012);
  const footerH = album ? Math.round(cardW * 0.05) : 0;
  const bottomPad = Math.round(cardW * 0.055);
  const chromeH = topPad + headerH + gapTop + gapBottom + footerH + bottomPad;
  const lyricAreaH = Math.max(Math.round(cardW * 0.3), maxCardH - chromeH);
  const lyricArea = textW * lyricAreaH;

  let fit = { fontSize: 18, lineH: 24, wrapped: [] };
  if (lyrics.length) {
    const startFs = Math.min(
      Math.round(cardW * 0.15),
      Math.max(18, Math.round(fontForChars(totalChars(lyrics), lyricArea)))
    );
    for (let fs = startFs; fs >= 18; fs -= 2) {
      ctx.font = `800 ${fs}px ${BODY_FONT}`;
      const wrapped = wrapLyricsLines(ctx, lyrics, textW);
      const lineH = Math.round(fs * LINE_H);
      const blockH = wrapped.length * lineH;
      fit = { fontSize: fs, lineH, wrapped, blockH };
      if (chromeH + blockH <= maxCardH && wrapped.length <= MAX_LYRIC_LINES) break;
    }
  }

  if (fit.wrapped.length) {
    // Grow-to-fill: cresce a fonte até o bloco ocupar a altura livre,
    // colando a última linha no álbum (linha vermelha de baixo dos prints).
    const maxLyricH = Math.max(0, maxCardH - chromeH);
    const fsCap = Math.round(cardW * 0.2);
    for (let fs = fit.fontSize + 2; fs <= fsCap; fs += 2) {
      ctx.font = `800 ${fs}px ${BODY_FONT}`;
      const wrapped = wrapLyricsLines(ctx, lyrics, textW);
      if (wrapped.length > MAX_LYRIC_LINES) break;
      if (wrapped.some((line) => ctx.measureText(line).width > textW)) break;
      const lineH = Math.round(fs * LINE_H);
      const blockH = wrapped.length * lineH;
      if (blockH > maxLyricH) break;
      fit = { fontSize: fs, lineH, wrapped, blockH };
    }
  }
  const blockH = fit.wrapped.length * fit.lineH;
  const contentH = topPad + headerH + gapTop + blockH + gapBottom + footerH + bottomPad;
  const cardH = fit.wrapped.length ? maxCardH : Math.min(maxCardH, contentH);
  const cardX = Math.round((size.w - cardW) / 2);
  const cardY = Math.round((size.h - cardH) / 2);

  ctx.save();
  ctx.fillStyle = shade(darker, -0.3);
  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.fill();
  ctx.restore();

  const ix = cardX + innerPad;
  const top = cardY + topPad;

  drawRoundedImage(ctx, cover, ix, top, thumb, 12);

  const infoX = ix + thumb + Math.round(cardW * 0.05);
  const infoW = cardX + cardW - innerPad - infoX;
  const infoArea = infoW * headerH;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  const titlePx = fitTextSize(ctx, title, 700, infoArea * 0.7, Math.round(cardW * 0.07), 22, 2, infoW);
  ctx.font = `700 ${titlePx}px ${BODY_FONT}`;
  const tLines = wrapLines(ctx, [title], infoW).slice(0, 2);
  let iy = top + Math.round(thumb * 0.12);
  const titleLineH = Math.round(titlePx * 1.17);
  tLines.forEach((line) => {
    ctx.fillText(line, infoX, iy);
    iy += titleLineH;
  });
  const artistText = `Song · ${artist}`;
  const artistPx = fitTextSize(ctx, artistText, 500, infoArea * 0.3, Math.round(cardW * 0.045), 16, 1, infoW);
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `500 ${artistPx}px ${BODY_FONT}`;
  ctx.fillText(artistText, infoX, iy + 2);
  ctx.restore();

  if (fit.wrapped.length) {
    // Bloco centralizado na zona livre (cabeçalho -> álbum): folgas iguais
    // em cima e embaixo, com mínimo de respiro.
    const albumZoneTop = cardY + cardH - bottomPad - footerH;
    const zoneTop = top + headerH + gapTop;
    const zoneBottom = albumZoneTop - gapBottom;
    let ly = zoneTop + Math.max(0, (zoneBottom - zoneTop - blockH) / 2);
    if (ly < zoneTop) ly = zoneTop;
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${fit.fontSize}px ${BODY_FONT}`;
    fit.wrapped.forEach((line) => {
      drawLyricLine(ctx, line, ix, ly, textW, fit.fontSize);
      ly += fit.lineH;
    });
    ctx.restore();
  }

  if (album) {
    const albumW = textW;
    const albumArea = albumW * bottomPad;
    const albumPx = fitTextSize(ctx, album, 500, albumArea * 2, Math.round(cardW * 0.045), 16, 1, albumW);
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `500 ${albumPx}px ${BODY_FONT}`;
    ctx.fillText(album, ix, cardY + cardH - bottomPad);
    ctx.restore();
  }
}

async function renderCard(canvas, track, options, pixelScale = 1) {
  if (!track) return;
  const size = { w: 1080, h: 1920, cover: 700, coverY: 240, textMax: 780, pad: 72 };
  const background = resolveBackground(options, options.palette);
  const lyrics = selectLyricsLines(track, options);

  const dpr = Math.max(1, pixelScale);
  canvas.width = Math.round(size.w * dpr);
  canvas.height = Math.round(size.h * dpr);
  canvas.style.width = "";
  canvas.style.height = "";
  canvas.style.aspectRatio = `${size.w} / ${size.h}`;

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

export { CardRenderer, renderCard, MAX_LYRIC_CHARS, MAX_LYRIC_LINES };

