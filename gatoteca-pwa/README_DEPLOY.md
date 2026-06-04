# Deploy na Vercel

Esta versao da Gatoteca PWA publica a biblioteca automaticamente em `/library.json` e serve os videos locais a partir de `public/videos`.

## Requisitos

- Conta na Vercel
- Repositorio no GitHub, se voce quiser deploy por integracao
- Node.js e npm, se voce quiser gerar build manual

## Deploy com GitHub

1. Crie uma conta em [Vercel](https://vercel.com/).
2. Conecte sua conta do GitHub na Vercel.
3. Envie a pasta `gatoteca-pwa` para um repositorio GitHub.
4. No painel da Vercel, clique em `Add New` e depois em `Project`.
5. Escolha o repositorio que contem a pasta `gatoteca-pwa`.
6. Na importacao do projeto, aponte o `Root Directory` para `gatoteca-pwa`.
7. Confirme as configuracoes:
   - Build Command: `npm run build`
   - Output Directory: `dist`
8. Inicie o deploy.
9. Quando o deploy terminar, copie o link final HTTPS da Vercel.

## Deploy manual sem GitHub

1. Entre na pasta `gatoteca-pwa`.
2. Rode:

```bash
npm install
npm run build
```

3. No painel da Vercel, crie um projeto novo.
4. Escolha a opcao de fazer upload manual do conteudo pronto.
5. Envie a pasta `dist/`.
6. Aguarde o deploy e copie o link HTTPS final.

## HTTPS

A Gatoteca PWA precisa de HTTPS para:

- instalacao como aplicativo
- Service Worker
- cache offline

A Vercel publica em HTTPS por padrao.

## Biblioteca e videos

- A PWA carrega a biblioteca sempre de `/library.json`.
- Esse arquivo vem de `public/library.json`.
- Videos locais podem ficar em `public/videos`.
- Exemplo atual: `/videos/gatinho.mp4`

## Como atualizar a biblioteca

1. Edite `public/library.json`.
2. Adicione ou troque os itens do array.
3. Use caminhos relativos como `/videos/arquivo.mp4` quando o video estiver publicado junto com a PWA.
4. Se preferir videos externos, use URLs HTTPS diretas para os arquivos MP4.

## Testar no iPhone

1. Abra o link HTTPS final no Safari do iPhone.
2. Confira se a tela inicial carrega sem pedir configuracao de URL.
3. Entre em `Biblioteca Online` e confirme que o `library.json` carregou.
4. Teste `Baixar tudo que couber`.
5. Teste `Apagar todos os videos baixados`.

## Adicionar a tela inicial no iPhone

1. No Safari, toque em `Compartilhar`.
2. Toque em `Adicionar a Tela de Inicio`.
3. Abra o app pela tela inicial.

## Observacao admin

A Gatoteca nao envia videos por dentro da PWA. Ela apenas le a lista publicada em `/library.json` e baixa os arquivos apontados ali. Os videos podem ficar:

- dentro da propria pasta `public/videos`
- em um servidor proprio
- em Firebase Storage
- em Cloudflare R2
- em outro host com link direto para o MP4
