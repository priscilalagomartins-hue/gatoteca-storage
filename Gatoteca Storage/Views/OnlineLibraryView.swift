import SwiftUI

private enum OnlineLibrarySheet: Identifiable {
    case confirmation(DownloadPlan)
    case queue

    var id: String {
        switch self {
        case .confirmation(let plan):
            return "confirmation-\(plan.id)"
        case .queue:
            return "queue"
        }
    }
}

struct OnlineLibraryView: View {
    @EnvironmentObject private var model: GatotecaViewModel
    @EnvironmentObject private var downloadManager: DownloadManager

    @State private var activeSheet: OnlineLibrarySheet?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Button {
                    Task {
                        let plan = await model.makeDownloadPlanLoadingLibraryIfNeeded()

                        await MainActor.run {
                            if let plan = plan {
                                activeSheet = .confirmation(plan)
                            }
                        }
                    }
                } label: {
                    Label("Baixar tudo que couber", systemImage: "tray.and.arrow.down.fill")
                }
                .buttonStyle(PawButtonStyle(background: CatTheme.honey, foreground: CatTheme.ink))
                .disabled(downloadManager.state.isRunning || model.isLoadingOnlineLibrary)

                if model.isLoadingOnlineLibrary {
                    ProgressView("Carregando vídeos online")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                }

                LazyVStack(spacing: 12) {
                    ForEach(model.onlineVideos) { video in
                        OnlineVideoRow(
                            video: video,
                            status: model.status(for: video),
                            isBusy: downloadManager.state.isRunning
                        ) {
                            startSingleDownload(video)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(CatTheme.background.ignoresSafeArea())
        .navigationTitle("Biblioteca Online")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        await model.loadOnlineLibrary(force: true)
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Atualizar biblioteca online")
            }
        }
        .task {
            await model.loadOnlineLibrary()
        }
        .refreshable {
            await model.loadOnlineLibrary(force: true)
        }
        .sheet(item: $activeSheet) { sheet in
            NavigationStack {
                switch sheet {
                case .confirmation(let plan):
                    DownloadConfirmationView(plan: plan) {
                        activeSheet = nil
                    } onConfirm: {
                        startBatchDownload(plan.videos)
                    }
                case .queue:
                    DownloadQueueView()
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("Fechar") {
                                    activeSheet = nil
                                }
                            }
                        }
                }
            }
        }
        .alert(item: $model.alert) { alert in
            Alert(
                title: Text(alert.title),
                message: Text(alert.message),
                dismissButton: .default(Text("Tudo bem"))
            )
        }
    }

    private func startSingleDownload(_ video: VideoItem) {
        guard model.canStartSingleDownload(for: video) else {
            return
        }

        activeSheet = .queue

        Task {
            _ = await downloadManager.startDownloads([video])
            model.refreshStorage()
        }
    }

    private func startBatchDownload(_ videos: [VideoItem]) {
        activeSheet = .queue

        Task {
            _ = await downloadManager.startDownloads(videos)
            model.refreshStorage()
        }
    }
}

private struct OnlineVideoRow: View {
    let video: VideoItem
    let status: VideoDownloadStatus
    let isBusy: Bool
    let onDownload: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            thumbnail

            VStack(alignment: .leading, spacing: 10) {
                Text(video.title)
                    .font(.headline)
                    .foregroundColor(CatTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Label(video.sizeBytes.gatotecaSize, systemImage: "externaldrive")
                        .font(.caption)
                        .foregroundColor(CatTheme.softInk)

                    StatusBadge(status: status)
                }

                Button(action: onDownload) {
                    Label("Baixar", systemImage: "arrow.down.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(CatTheme.mint)
                .disabled(status == .alreadyDownloaded || isBusy)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(CatTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(CatTheme.mint.opacity(0.18), lineWidth: 1)
        )
    }

    private var thumbnail: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(CatTheme.background)

            AsyncImage(url: video.thumbnail) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                default:
                    Image(systemName: "pawprint.fill")
                        .font(.title2)
                        .foregroundColor(CatTheme.blush)
                }
            }
        }
        .frame(width: 82, height: 60)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct StatusBadge: View {
    let status: VideoDownloadStatus

    var body: some View {
        Text(status.title)
            .font(.caption2.bold())
            .foregroundColor(foregroundColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(backgroundColor)
            .clipShape(Capsule())
    }

    private var backgroundColor: Color {
        switch status {
        case .alreadyDownloaded:
            return CatTheme.blue.opacity(0.18)
        case .available:
            return CatTheme.mint.opacity(0.22)
        case .notEnoughSpace:
            return CatTheme.blush.opacity(0.18)
        }
    }

    private var foregroundColor: Color {
        switch status {
        case .alreadyDownloaded:
            return CatTheme.blue
        case .available:
            return Color(red: 0.18, green: 0.45, blue: 0.28)
        case .notEnoughSpace:
            return CatTheme.blush
        }
    }
}

private struct DownloadConfirmationView: View {
    let plan: DownloadPlan
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Encontramos \(plan.videos.count) vídeos que cabem no seu iPhone.")
                    .font(.title3.bold())
                    .foregroundColor(CatTheme.ink)

                VStack(spacing: 10) {
                    ConfirmationRow(title: "Espaço livre atual", value: plan.freeSpaceBytes.gatotecaSize)
                    ConfirmationRow(title: "Margem de segurança", value: plan.securityMarginBytes.gatotecaSize)
                    ConfirmationRow(title: "Espaço para downloads", value: plan.availableForDownloadsBytes.gatotecaSize)
                    ConfirmationRow(title: "Espaço necessário", value: plan.requiredBytes.gatotecaSize)
                    ConfirmationRow(title: "Depois do download", value: plan.estimatedFreeSpaceAfterDownloadBytes.gatotecaSize)
                }

                Text("Deseja baixar todos agora?")
                    .font(.headline)
                    .foregroundColor(CatTheme.ink)

                VStack(spacing: 12) {
                    Button {
                        onConfirm()
                    } label: {
                        Label("Baixar \(plan.videos.count) vídeos", systemImage: "arrow.down.circle.fill")
                    }
                    .buttonStyle(PawButtonStyle(background: CatTheme.blue))

                    Button("Cancelar") {
                        onCancel()
                    }
                    .buttonStyle(PawButtonStyle(background: CatTheme.background, foreground: CatTheme.ink))
                }
            }
            .padding(18)
        }
        .background(CatTheme.background.ignoresSafeArea())
        .navigationTitle("Baixar vídeos que cabem")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ConfirmationRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
                .foregroundColor(CatTheme.softInk)

            Spacer(minLength: 12)

            Text(value)
                .fontWeight(.semibold)
                .foregroundColor(CatTheme.ink)
        }
        .font(.subheadline)
        .padding(12)
        .background(CatTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
