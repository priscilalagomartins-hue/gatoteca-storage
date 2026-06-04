# Gatoteca Storage

Esta é a versão iOS nativa em SwiftUI do Gatoteca Storage.

App pessoal para iPhone que consulta espaço livre, baixa vídeos de uma lista JSON online, salva esses vídeos apenas dentro do container do app e apaga somente o que a própria Gatoteca baixou.

Checkpoint atual: `v1-ios-swiftui`.

## Abrir no Xcode

1. Abra `Gatoteca Storage.xcodeproj` no macOS com Xcode.
2. Selecione o target `Gatoteca Storage`.
3. Em `Signing & Capabilities`, escolha seu time Apple Developer.
4. Troque o bundle identifier se precisar.
5. Edite `Gatoteca Storage/Config.swift` e substitua a URL:

```swift
static let videoLibraryURL = URL(string: "https://example.com/gatoteca/videos.json")!
```

## JSON remoto

O app espera um array JSON neste formato:

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

`priority` e `thumbnail` podem faltar. Quanto menor a prioridade, antes o vídeo entra na fila automática.

## Privacidade e sandbox

- O app não pede acesso a Fotos, Arquivos, Contatos, Localização, Câmera ou Microfone.
- Os vídeos ficam em `Application Support/GatotecaVideos`.
- O manifesto local fica em `Application Support/GatotecaVideos/downloads.json`.
- A exclusao so usa arquivos registrados em `downloads.json` e valida que o caminho esta dentro de `GatotecaVideos`.
- A margem de segurança de 1 GB é sempre subtraída antes de iniciar downloads.

## TestFlight

1. Rode no iPhone real pelo Xcode.
2. Confirme que a URL HTTPS do JSON abre fora do app e que os links MP4 sao diretos.
3. Em `Product > Archive`, crie um archive.
4. Envie pelo Organizer para App Store Connect.
5. Distribua via TestFlight para familiares.

O `Info.plist` não contém chaves de permissão sensíveis. O projeto inclui `PrivacyInfo.xcprivacy` para declarar o uso de APIs de espaço em disco e metadados de arquivos locais.

## GitHub

Projeto preparado para versionamento com `.gitignore` de iOS/Xcode.

Para publicar:

```bash
git init
git add .
git commit -m "v1-ios-swiftui"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/gatoteca-storage.git
git push -u origin main
```
