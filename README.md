# Spotify Cards HD

Gera cards de qualquer música em alta definição (PNG 2×) a partir do nome dela.
Busca capa, letra e metadados automaticamente e monta o card num `<canvas>`.

## Como rodar

Dê duplo clique em `iniciar.bat`. Ele compila o frontend, inicia o servidor
local em <http://127.0.0.1:8000> e abre o navegador.

Requisitos: Python 3 + Node.js. Dependências do servidor em
`server/requirements.txt` (`pip install -r server/requirements.txt`).

## O que o card oferece

- **Capa + artista**: capa em destaque com moldura escura e, abaixo, o nome da
  música (destaque), da banda e do álbum.
- **Completo (capa + letra)**: card com miniatura, título, banda e até 5 linhas
  da letra em destaque; o tamanho do card se ajusta ao conteúdo.
- **Auto da capa / cor sólida** para o fundo, com opção de ligar/desligar o
  gradiente.
- Formatos de saída: retrato 1080×1920, quadrado 1080×1080 e paisagem 1920×1080.

## Estrutura

- `web/` — frontend (Vite). `src/render/card-renderer.js` desenha o card no canvas.
- `server/` — API em FastAPI que busca dados (iTunes, LRCLIB, Cover Art Archive)
  e serve o frontend compilado.
