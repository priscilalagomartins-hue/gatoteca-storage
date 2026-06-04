# Gatoteca Storage PWA

Esta e a versao PWA da Gatoteca Storage, criada com React, TypeScript, Vite, IndexedDB, Service Worker e Manifest.

A versao iOS nativa em SwiftUI foi preservada fora desta pasta e o backup solicitado fica em `../backup-ios-swiftui`.

## Funcionalidades

- Dashboard com espaco usado pela Gatoteca, espaco estimado disponivel para a PWA e espaco restante estimado.
- Biblioteca online carregada automaticamente de `/library.json`.
- Download individual dos videos listados.
- Botao `Baixar tudo que couber`, que baixa o primeiro video e cria copias locais ate preencher o espaco estimado disponivel.
- Fila de downloads com progresso geral, progresso individual, cancelamento e relatorio.
- Armazenamento local dos videos em IndexedDB.
- Tela `Meus Videos` com assistir, apagar um video e apagar tudo com confirmacao.
- Reproducao offline dos videos ja baixados.
- Manifest e Service Worker para instalacao como PWA.
- Secao de ajuda com instalacao e aviso admin sobre hospedagem externa ou local dos videos.

## Limitacao importante da PWA

Browsers nao permitem que uma PWA consulte com precisao o espaco livre real do iPhone, Android, Windows ou Mac. Por isso, a Gatoteca usa `navigator.storage.estimate()` para mostrar apenas a estimativa de armazenamento disponivel para a propria PWA/origem.

O navegador ainda pode aplicar quotas proprias de armazenamento. Em iPhone, grandes bibliotecas offline podem depender das regras do Safari/iOS.

## Requisitos

- Node.js 18 ou superior
- npm

## Instalar dependencias

```bash
npm install
```

## Executar localmente

```bash
npm run dev
```

Depois abra o endereco mostrado pelo Vite, normalmente:

```text
http://localhost:5173
```

## Gerar build de producao

```bash
npm run build
```

Os arquivos finais serao gerados em:

```text
dist/
```

## Visualizar o build de producao

```bash
npm run preview
```

## Biblioteca local publicada

O app carrega automaticamente:

```text
/library.json
```

Esse arquivo vem de:

```text
public/library.json
```

## Formato do JSON

```json
[
  {
    "id": "gatinho001",
    "title": "Video Gatinho",
    "url": "/videos/gatinho.mp4",
    "sizeBytes": 2100000,
    "priority": 1
  }
]
```

- `id`: identificador unico.
- `title`: nome do video.
- `url`: link direto para o MP4. Pode ser relativo, como `/videos/gatinho.mp4`.
- `thumbnail`: imagem de capa opcional.
- `sizeBytes`: tamanho estimado em bytes.
- `priority`: prioridade opcional.

## Publicar

A PWA precisa ser servida via HTTPS para instalacao e Service Worker em celulares. Voce pode publicar o conteudo de `dist/` em servicos como:

- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages
- Servidor proprio com HTTPS

## CORS

Para downloads externos funcionarem no navegador, o dominio dos videos e thumbnails deve permitir acesso pela origem onde a PWA esta publicada.

Exemplo de header recomendado:

```text
Access-Control-Allow-Origin: *
```

## Instalar no aparelho

### iPhone

1. Abra a PWA no Safari.
2. Toque em Compartilhar.
3. Escolha `Adicionar a Tela de Inicio`.

### Android

1. Abra a PWA no Chrome.
2. Toque no menu.
3. Escolha `Instalar Aplicativo`.

### Windows e Mac

No Chrome ou Edge, use o icone de instalacao na barra de endereco ou o menu do navegador.

## Seguranca

- A PWA nao pede acesso a Fotos, Arquivos, Contatos, Localizacao, Camera ou Microfone.
- Ela nao lista arquivos do aparelho.
- Ela apaga apenas registros e blobs salvos pela propria Gatoteca no IndexedDB.

## Deploy na Vercel

Veja o passo a passo em [README_DEPLOY.md](</C:/Users/Claudio/OneDrive/Documentos/Gatoteca Storage/gatoteca-pwa/README_DEPLOY.md>).
