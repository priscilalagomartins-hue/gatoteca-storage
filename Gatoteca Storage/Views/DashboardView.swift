import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var model: GatotecaViewModel
    @EnvironmentObject private var downloadManager: DownloadManager

    private let metricColumns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header

                    if downloadManager.state.isRunning {
                        NavigationLink(destination: DownloadQueueView()) {
                            Label("Downloads em andamento", systemImage: "arrow.down.circle.fill")
                        }
                        .buttonStyle(PawButtonStyle(background: CatTheme.honey, foreground: CatTheme.ink))
                    }

                    LazyVGrid(columns: metricColumns, spacing: 12) {
                        MetricCard(
                            title: "Espaço livre",
                            value: model.freeSpaceBytes.gatotecaSize,
                            systemImage: "internaldrive",
                            color: CatTheme.blue
                        )

                        MetricCard(
                            title: "Usado pela Gatoteca",
                            value: model.usedByAppBytes.gatotecaSize,
                            systemImage: "pawprint.fill",
                            color: CatTheme.blush
                        )

                        MetricCard(
                            title: "Vídeos salvos",
                            value: "\(model.downloadedVideoCount)",
                            systemImage: "play.rectangle.fill",
                            color: CatTheme.mint
                        )
                    }

                    VStack(spacing: 12) {
                        Button {
                            model.refreshStorage()
                        } label: {
                            Label("Atualizar espaço", systemImage: "arrow.clockwise")
                        }
                        .buttonStyle(PawButtonStyle(background: CatTheme.mint, foreground: CatTheme.ink))

                        NavigationLink(destination: OnlineLibraryView()) {
                            Label("Ver vídeos online", systemImage: "icloud.and.arrow.down")
                        }
                        .buttonStyle(PawButtonStyle(background: CatTheme.blue))

                        NavigationLink(destination: DownloadedVideosView()) {
                            Label("Meus vídeos baixados", systemImage: "folder.fill")
                        }
                        .buttonStyle(PawButtonStyle(background: CatTheme.blush))
                    }
                }
                .padding(18)
            }
            .background(CatTheme.background.ignoresSafeArea())
            .navigationTitle("Gatoteca Storage")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        model.refreshStorage()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Atualizar espaço")
                }
            }
            .task {
                model.refreshStorage()
            }
            .alert(item: $model.alert) { alert in
                Alert(
                    title: Text(alert.title),
                    message: Text(alert.message),
                    dismissButton: .default(Text("Tudo bem"))
                )
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "pawprint.fill")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundColor(CatTheme.blush)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Espaço para mais ronrons")
                        .font(.title2.bold())
                        .foregroundColor(CatTheme.ink)

                    Text("Baixar vídeos que cabem")
                        .font(.subheadline)
                        .foregroundColor(CatTheme.softInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(CatTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(CatTheme.blush.opacity(0.22), lineWidth: 1)
            )
        }
    }
}
