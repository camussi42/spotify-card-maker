# Spotify Custom Cards

![Spotify Custom Cards](assets/logo.png)

Gera cards de qualquer música em alta definição (PNG 2×) a partir do nome dela.
Busca capa, letra e metadados automaticamente e monta o card num `<canvas>`.

## Como rodar

Dê duplo clique em `iniciar.bat`. Ele compila o frontend, inicia o servidor
local em <http://127.0.0.1:8000> e abre o navegador.

Requisitos: Python 3 + Node.js. Dependências do servidor em
`server/requirements.txt` (`pip install -r server/requirements.txt`).

## Spotify for Developers (opcional)

O app já funciona sem nenhuma chave (usa iTunes, LRCLIB e Cover Art Archive,
todas gratuitas e sem autenticação). Se um dia você quiser usar a Web API do
Spotify (ex.: buscar faixas, capas e metadados direto do Spotify), crie um app
lá:

1. Acesse <https://developer.spotify.com/dashboard> e faça login com sua conta
   Spotify.
2. Clique em **Create app**, preencha nome/descrição e aceite os termos.
3. Abra o app criado e copie o **Client ID** e o **Client Secret**.
4. Em **Settings → Redirect URIs**, adicione `http://127.0.0.1:8000/callback`
   (necessário para fluxos com login do usuário, ex.: Authorization Code).
5. Use o Client ID/Secret no backend para o fluxo
   [Client Credentials](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow)
   (só dados públicos, sem login) ou
   [Authorization Code](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
   (com login do usuário).
6. Documentação geral: <https://developer.spotify.com/documentation/web-api>.

## O que o card oferece

- **Capa + artista**: capa em destaque com moldura escura e, abaixo, o nome da
  música (destaque), da banda e do álbum.
- **Completo (capa + letra)**: card com miniatura, título, banda e até 8 linhas
  ou 200 caracteres da letra em destaque; o tamanho do card e das fontes se
  ajustam ao conteúdo.
- **Auto da capa / cor sólida** para o fundo, com opção de ligar/desligar o
  gradiente.
- Formato de saída: vertical Full HD (1080×1920).

## Estrutura

- `web/` — frontend (Vite). `src/render/card-renderer.js` desenha o card no canvas.
- `server/` — API em FastAPI que busca dados (iTunes, LRCLIB, Cover Art Archive)
  e serve o frontend compilado.
