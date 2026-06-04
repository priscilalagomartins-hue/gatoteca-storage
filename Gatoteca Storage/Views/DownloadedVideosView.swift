import SwiftUI

private struct PlayerItem: Identifiable {
    let id = UUID()
    let title: String
    let url: URL
}

struct DownloadedVideosView: View {
    @EnvironmentObject private var model: GatotecaViewModel

    @State private var playerItem: PlayerItem?
    @State private var videoPendingDelete: DownloadedVideo?
    @State private var isConfirmingDeleteAll = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if model.downloadedVideos.isEmpty {
                    emptyContent
                } else {
                    Button(role: .destructive) {
                        isConfirmingDeleteAll = true
                    } label: {
                        Label("Limpar cestinha dos gatinhos", systemImage: "trash.fill")
                    }
                    .buttonStyle(PawButtonStyle(background: CatTheme.blush))

                    ForEach(model.downloadedVideos) { video in
                        DownloadedVideoRow(video: video) {
                            play(video)
                        } onDelete: {
                            videoPendingDelete = video
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(CatTheme.background.ignoresSafeArea())
        .navigationTitle("Meus vídeos salvos")
        .task {
            model.refreshStorage()
        }
        .sheet(item: $playerItem) { item in
            NavigationStack {
                VideoPlayerView(videoURL: item.url, title: item.title)
            }
        }
        .confirmationDialog(
            "Tem certeza que deseja apagar este vídeo baixado pela Gatoteca?",
            isPresented: Binding(
                get: { videoPendingDelete != nil },
                set: { if !$0 { videoPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Apagar vídeo", role: .destructive) {
                if let video = videoPendingDelete {
                    model.delete(video)
                }
                videoPendingDelete = nil
            }

            Button("Cancelar", role: .cancel) {
                videoPendingDelete = nil
            }
        }
        .confirmationDialog(
            "Tem certeza que deseja apagar todos os vídeos baixados pela Gatoteca?",
            isPresented: $isConfirmingDeleteAll,
            titleVisibility: .visible
        ) {
            Button("Apagar todos", role: .destructive) {
                model.deleteAllDownloadedVideos()
            }

            Button("Cancelar", role: .cancel) {}
        }
        .alert(item: $model.alert) { alert in
            Alert(
                title: Text(alert.title),
                message: Text(alert.message),
                dismissButton: .default(Text("Tudo bem"))
            )
        }
    }

    private var emptyContent: some View {
        VStack(spacing: 12) {
            Image(systemName: "pawprint.fill")
                .font(.largeTitle)
                .foregroundColor(CatTheme.blush)

            Text("Nenhum vídeo baixado ainda")
                .font(.headline)
                .foregroundColor(CatTheme.ink)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }

    private func play(_ video: DownloadedVideo) {
        do {
            playerItem = PlayerItem(
                title: video.title,
                url: try model.localFileURL(for: video)
            )
        } catch {
            model.showError(error)
        }
    }
}

private struct DownloadedVideoRow: View {
    let video: DownloadedVideo
    let onPlay: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(video.title)
                .font(.headline)
                .foregroundColor(CatTheme.ink)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 12) {
                Label(video.sizeBytes.gatotecaSize, systemImage: "externaldrive")
                Label(video.downloadedAt.gatotecaDate, systemImage: "calendar")
            }
            .font(.caption)
            .foregroundColor(CatTheme.softInk)

            HStack(spacing: 10) {
                Button(action: onPlay) {
                    Label("Assistir", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(CatTheme.blue)

                Button(role: .destructive, action: onDelete) {
                    Label("Apagar", systemImage: "trash.fill")
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(CatTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(CatTheme.blue.opacity(0.16), lineWidth: 1)
        )
    }
}
