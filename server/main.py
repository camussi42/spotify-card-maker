"""Servidor API para o gerador de cards (fonte: iTunes + LRCLIB + Cover Art)."""
from __future__ import annotations

import io
import os
from pathlib import Path

import asyncio

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from catalog import enrich_track, get_lyrics, search_itunes

BASE_DIR = Path(__file__).resolve().parent
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1), limit: int = 20):
    """Busca músicas pelo nome. Retorna lista de resultados (sem letra/capas)."""
    results = await asyncio.to_thread(search_itunes, q, max(1, min(limit, 50)))
    return JSONResponse({"query": q, "results": results})


@app.get("/api/enrich")
async def enrich(
    title: str = Query(..., min_length=1),
    artist: str = Query(""),
    album: str = Query(""),
    cover_url: str = Query(""),
    duration_ms: int = Query(0),
    external_url: str = Query(""),
):
    """Recebe uma faixa escolhida e adiciona letra + capas alternativas."""
    track = {
        "id": "custom",
        "title": title,
        "artists": [{"name": artist or "Artista desconhecido"}],
        "album": {"name": album or ""},
        "duration_ms": duration_ms or None,
        "cover_url": cover_url or None,
        "external_url": external_url or None,
    }
    enriched = await asyncio.to_thread(enrich_track, track)
    return JSONResponse({"track": enriched})


@app.get("/api/lyrics")
async def lyrics_endpoint(artist: str = Query(...), title: str = Query(...)):
    return JSONResponse(await asyncio.to_thread(get_lyrics, artist, title))


@app.get("/api/palette")
async def palette(image_url: str = Query(...)):
    """Extrai a cor dominante de uma capa (média simples)."""
    if not image_url:
        return {"hex": "#2F3037"}
    try:
        resp = await asyncio.to_thread(requests.get, image_url, timeout=20)
        resp.raise_for_status()
        with Image.open(io.BytesIO(resp.content)) as img:
            img = img.convert("RGB").resize((1, 1))
            r, g, b = img.getpixel((0, 0))
        return {"hex": f"#{r:02X}{g:02X}{b:02X}"}
    except Exception:
        return {"hex": "#2F3037"}


@app.get("/api/proxy")
async def proxy_image(url: str = Query(...)):
    """Serve imagem remota (resolve CORS para o canvas conseguir exportar em HD)."""
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(400, "URL inválida.")
    try:
        resp = await asyncio.to_thread(requests.get, url, timeout=30, allow_redirects=True)
        resp.raise_for_status()
        return Response(
            content=resp.content,
            media_type=resp.headers.get("Content-Type", "image/jpeg"),
            headers={"Cache-Control": "public,max-age=86400"},
        )
    except Exception as exc:
        raise HTTPException(502, f"Não foi possível carregar a imagem: {exc}")


dist_dir = Path(__file__).resolve().parent.parent / "web" / "dist"

if dist_dir.exists() and (dist_dir / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=dist_dir / "assets"), name="assets")

    @app.get("/")
    async def index():
        return FileResponse(dist_dir / "index.html")

    @app.get("/{full_path:path}")
    async def spa_files(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"error": "not found"}, status_code=404)
        file = (dist_dir / full_path.lstrip("/")).resolve()
        try:
            file.relative_to(dist_dir.resolve())
        except ValueError:
            return JSONResponse({"error": "not found"}, status_code=404)
        if not file.is_file():
            return FileResponse(dist_dir / "index.html")
        return FileResponse(file)
