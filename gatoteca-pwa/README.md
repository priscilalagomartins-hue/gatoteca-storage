# Gatoteca Storage PWA

Esta é a versão PWA da Gatoteca Storage, criada com React, TypeScript, Vite, IndexedDB, Service Worker e Manifest.

A versão iOS nativa em SwiftUI foi preservada fora desta pasta e o backup solicitado fica em `../backup-ios-swiftui`.

## Funcionalidades

- Dashboard com quantidade de vídeos baixados, espaço usado e limite configurado.
- Configuração de limite da Gatoteca: 2 GB, 5 GB, 10 GB, 20 GB ou personalizado.
- Biblioteca online carregada de um JSON remoto.
- Download individual com verificação de espaço dentro do limite escolhido.
- Botão `Baixar tudo que couber`, com seleção automática por prioridade e confirmação.
- Fila de downloads sequencial com progresso geral, progresso individual, cancelamento e relatório.
- Armazenamento local dos vídeos em IndexedDB.
- Tela `Meus Vídeos` com assistir, apagar um vídeo e apagar todos.
- Reprodução offline dos vídeos já baixados.
- Manifest e Service Worker para instalação como PWA.
- Página de ajuda para instalação em iPhone, Android, Windows e Mac.

## Limitação importante da PWA

Browsers não permitem que uma PWA consulte com precisão o espaço livre real do iPhone, Android, Windows ou Mac. Por isso, a Gatoteca PWA usa um limite escolhido pela usuária e controla apenas os vídeos que ela mesma salvou no IndexedDB.

O navegador ainda pode aplicar quotas próprias de armazenamento. Em iPhone, grandes bibliotecas offline podem depender das regras do Safari/iOS.

## Requisitos

- Node.js 18 ou superior
- npm

## Instalar dependências

```bash
npm install
```

## Executar localmente

```bash
npm run dev
```

Depois abra o endereço mostrado pelo Vite, normalmente:

```text
http://localhost:5173
```

## Gerar build de produção

```bash
npm run build
```

Os arquivos finais serão gerados em:

```text
dist/
```

## Visualizar o build de produção

```bash
npm run preview
```

## Publicar

A PWA precisa ser servida via HTTPS para instalação e Service Worker em celulares. Você pode publicar o conteúdo de `dist/` em serviços como:

- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages
- Servidor próprio com HTTPS

Fluxo geral:

```bash
npm install
npm run build
```

Depois envie a pasta `dist/` para o serviço escolhido.

## Alterar a URL do JSON remoto

No app, abra `Ajustes` e altere o campo `URL da biblioteca online`.

A URL padrão fica em:

```text
src/lib/settings.ts
```

Constante:

```ts
export const DEFAULT_LIBRARY_URL = 'https://example.com/gatoteca/videos.json';
```

## Formato do JSON remoto

```json
[
  {
    "id": "video001",
    "title": "Video da Familia 1",
    "url": "https://seudominio.com/videos/video001.mp4",
    "thumbnail": "https://seudominio.com/thumbs/video001.jpg",
    "sizeBytes": 524288000,
    "priority": 1
  }
]
```

Campos:

- `id`: identificador único.
- `title`: nome do vídeo.
- `url`: link direto para o MP4.
- `thumbnail`: imagem de capa opcional.
- `sizeBytes`: tamanho estimado em bytes.
- `priority`: prioridade opcional. Números menores entram antes na fila automática.

## CORS

Para downloads funcionarem no navegador, o domínio dos vídeos e thumbnails deve permitir acesso pela origem onde a PWA está publicada.

Exemplo de header recomendado no servidor dos vídeos:

```text
Access-Control-Allow-Origin: *
```

Ou restrinja para o domínio da sua PWA.

## Instalar no aparelho

### iPhone

1. Abra a PWA no Safari.
2. Toque em Compartilhar.
3. Escolha `Adicionar à Tela de Início`.

### Android

1. Abra a PWA no Chrome.
2. Toque no menu.
3. Escolha `Instalar Aplicativo`.

### Windows e Mac

No Chrome ou Edge, use o ícone de instalação na barra de endereço ou o menu do navegador.

## Segurança

- A PWA não pede acesso a Fotos, Arquivos, Contatos, Localização, Câmera ou Microfone.
- Ela não lista arquivos do aparelho.
- Ela apaga apenas registros e blobs salvos pela própria Gatoteca no IndexedDB.
