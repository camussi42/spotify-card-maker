"""Fontes de dados para o gerador de cards (todas gratuitas, sem chave).

- iTunes Search API (Apple): busca músicas pelo nome e devolve capa em alta resolução.
- LRCLIB: letra (plain e sincronizada) pelo nome da faixa + artista.
- MusicBrainz + Cover Art Archive: várias capas do álbum para a pessoa escolher.
"""
from __future__ import annotations

import re

import requests

ITUNES_SEARCH = "https://itunes.apple.com/search"
LRCLIB = "https://lrclib.net/api/get"
MUSICBRAINZ = "https://musicbrainz.org/ws/2"
COVER_ART = "https://coverartarchive.org"

_UA = {"User-Agent": "spotify-card-maker/1.0 (uso pessoal)"}
_TIMEOUT = 15


def _get(url: str, **kwargs):
    """GET simples com timeout e User-Agent. Retorna Response ou None."""
    headers = kwargs.pop("headers", None) or dict(_UA)
    try:
        return requests.get(url, headers=headers, timeout=_TIMEOUT, **kwargs)
    except requests.RequestException:
        return None


def search_itunes(query: str, limit: int = 20) -> list[dict]:
    """Busca faixas no iTunes pelo nome. Retorna lista normalizada."""
    resp = _get(
        ITUNES_SEARCH,
        params={"term": query, "entity": "song", "limit": limit, "media": "music"},
    )
    if not resp or not resp.ok:
        return []
    try:
        results = resp.json().get("results", [])
    except ValueError:
        return []

    tracks: list[dict] = []
    for item in results:
        cover = item.get("artworkUrl100") or item.get("artworkUrl60")
        cover_hd = re.sub(r"\d+x\d+(bb)?\.(jpg|png|webp)$", r"1000x1000\1.\2", cover) if cover else None
        tracks.append(
            {
                "id": f"itunes-{item.get('trackId')}",
                "title": item.get("trackName") or "Sem título",
                "artists": [{"name": item.get("artistName") or "Artista desconhecido"}],
                "album": {
                    "name": item.get("collectionName") or "",
                    "release_date": item.get("releaseDate") or "",
                },
                "duration_ms": item.get("trackTimeMillis"),
                "cover_url": cover_hd or cover,
                "external_url": item.get("trackViewUrl") or item.get("collectionViewUrl"),
                "source": "itunes",
            }
        )
    return tracks


def _parse_synced(synced_lrc: str) -> list[dict]:
    """Converte LRC sincronizado em lista de {line, start, end}."""
    if not synced_lrc:
        return []
    pattern = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)")
    lines: list[dict] = []
    for raw in synced_lrc.splitlines():
        match = pattern.search(raw)
        if not match:
            continue
        minutes, seconds, text = match.groups()
        start = int(minutes) * 60 + float(seconds)
        text = text.strip()
        if not text:
            continue
        lines.append({"line": text, "start": start, "end": start})
    return lines


def get_lyrics(artist: str, title: str) -> dict:
    """Busca letra no LRCLIB. Retorna {plain, synced}. Vazio se não achar."""
    if not (artist and title):
        return {"plain": "", "synced": []}
    resp = _get(LRCLIB, params={"artist_name": artist, "track_name": title})
    if not resp or not resp.ok:
        return {"plain": "", "synced": []}
    try:
        data = resp.json()
    except ValueError:
        return {"plain": "", "synced": []}
    plain = data.get("plainLyrics") or ""
    synced = _parse_synced(data.get("syncedLyrics") or "")
    return {"plain": plain, "synced": synced}


def _mb_search_release(artist: str, album: str) -> str | None:
    """Acha o release mais provável no MusicBrainz."""
    query_bits = []
    if album:
        query_bits.append(f'release:"{album}"')
    if artist:
        query_bits.append(f'artist:"{artist}"')
    if not query_bits:
        return None
    query = " AND ".join(query_bits)
    resp = _get(f"{MUSICBRAINZ}/release", params={"query": query, "fmt": "json", "limit": 1})
    if not resp or not resp.ok:
        return None
    try:
        releases = resp.json().get("releases", [])
    except ValueError:
        return None
    return releases[0]["id"] if releases else None


def get_album_covers(artist: str, album: str, extra: list[dict] | None = None) -> list[dict]:
    """Devolve capas do álbum (Cover Art Archive) + extras já conhecidos."""
    covers: list[dict] = []

    release_id = _mb_search_release(artist, album)
    if release_id:
        resp = _get(f"{COVER_ART}/release/{release_id}")
        if resp and resp.ok:
            try:
                images = resp.json().get("images", [])
            except ValueError:
                images = []
            for img in images:
                covers.append(
                    {
                        "url": img.get("image"),
                        "thumb": (img.get("thumbnails") or {}).get("small") or img.get("image"),
                        "types": img.get("types") or [],
                        "front": "Front" in (img.get("types") or []),
                        "source": "coverartarchive",
                    }
                )

    for item in extra or []:
        covers.append(item)

    covers.sort(key=lambda c: 0 if c.get("front") else 1)
    seen: set[str] = set()
    unique: list[dict] = []
    for c in covers:
        url = c.get("url")
        if url and url not in seen:
            seen.add(url)
            unique.append(c)
    return unique


def enrich_track(track: dict) -> dict:
    """Adiciona letra e capas alternativas a uma faixa vinda do iTunes."""
    artist = (track.get("artists") or [{}])[0].get("name", "")
    album = (track.get("album") or {}).get("name", "")
    track = dict(track)
    track["lyrics"] = get_lyrics(artist, track.get("title", ""))

    extra = []
    if track.get("cover_url"):
        extra.append(
            {
                "url": track["cover_url"],
                "thumb": track["cover_url"],
                "types": ["Front"],
                "front": True,
                "source": "itunes",
            }
        )
    track["covers"] = get_album_covers(artist, album, extra=extra)
    return track
