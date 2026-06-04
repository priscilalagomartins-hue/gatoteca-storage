import Foundation

enum VideoDownloadStatus: Equatable {
    case alreadyDownloaded
    case available
    case notEnoughSpace

    var title: String {
        switch self {
        case .alreadyDownloaded:
            return "Já baixado"
        case .available:
            return "Disponível"
        case .notEnoughSpace:
            return "Não cabe no momento"
        }
    }
}

struct DownloadPlan: Identifiable {
    let id = UUID()
    let videos: [VideoItem]
    let freeSpaceBytes: Int64
    let securityMarginBytes: Int64
    let availableForDownloadsBytes: Int64
    let requiredBytes: Int64

    var estimatedFreeSpaceAfterDownloadBytes: Int64 {
        max(0, freeSpaceBytes - requiredBytes)
    }

    var confirmationMessage: String {
        """
        Encontramos \(videos.count) vídeos que cabem no seu iPhone.

        Espaço livre atual: \(freeSpaceBytes.gatotecaSize)
        Margem de segurança: \(securityMarginBytes.gatotecaSize)
        Espaço disponível para downloads: \(availableForDownloadsBytes.gatotecaSize)
        Espaço necessário: \(requiredBytes.gatotecaSize)
        Espaço estimado após download: \(estimatedFreeSpaceAfterDownloadBytes.gatotecaSize)

        Deseja baixar todos agora?
        """
    }
}

@MainActor
final class GatotecaViewModel: ObservableObject {
    @Published private(set) var freeSpaceBytes: Int64 = 0
    @Published private(set) var usedByAppBytes: Int64 = 0
    @Published private(set) var downloadedVideos: [DownloadedVideo] = []
    @Published private(set) var onlineVideos: [VideoItem] = []
    @Published private(set) var isLoadingOnlineLibrary = false
    @Published var alert: GatotecaAlert?

    private let storage: StorageManager
    private let libraryService: VideoLibraryService

    init(storage: StorageManager, libraryService: VideoLibraryService) {
        self.storage = storage
        self.libraryService = libraryService
        refreshStorage()
    }

    var downloadedVideoCount: Int {
        downloadedVideos.count
    }

    var availableForDownloadsBytes: Int64 {
        StorageManager.availableDownloadCapacity(from: freeSpaceBytes)
    }

    func refreshStorage() {
        do {
            let snapshot = try storage.refreshSnapshot()
            freeSpaceBytes = snapshot.freeSpaceBytes
            usedByAppBytes = snapshot.usedByAppBytes
            downloadedVideos = snapshot.downloadedVideos
        } catch {
            showError(error)
        }
    }

    func loadOnlineLibrary(force: Bool = false) async {
        guard force || onlineVideos.isEmpty else {
            return
        }

        isLoadingOnlineLibrary = true
        defer { isLoadingOnlineLibrary = false }

        do {
            onlineVideos = try await libraryService.fetchVideos()
            refreshStorage()
        } catch {
            showError(error)
        }
    }

    func status(for video: VideoItem) -> VideoDownloadStatus {
        if downloadedVideos.contains(where: { $0.id == video.id }) {
            return .alreadyDownloaded
        }

        if video.sizeBytes > availableForDownloadsBytes {
            return .notEnoughSpace
        }

        return .available
    }

    func makeDownloadPlan() -> DownloadPlan? {
        refreshStorage()

        var remainingBytes = availableForDownloadsBytes
        var selectedVideos: [VideoItem] = []

        for video in orderedDownloadCandidates() {
            guard video.sizeBytes <= remainingBytes else {
                continue
            }

            selectedVideos.append(video)
            remainingBytes -= video.sizeBytes
        }

        guard !selectedVideos.isEmpty else {
            alert = GatotecaAlert(
                title: "Nada coube agora",
                message: "Não encontramos vídeos novos que caibam mantendo 1 GB de folga para o iPhone respirar."
            )
            return nil
        }

        return DownloadPlan(
            videos: selectedVideos,
            freeSpaceBytes: freeSpaceBytes,
            securityMarginBytes: StorageManager.securityMarginBytes,
            availableForDownloadsBytes: availableForDownloadsBytes,
            requiredBytes: selectedVideos.reduce(0) { $0 + $1.sizeBytes }
        )
    }

    func makeDownloadPlanLoadingLibraryIfNeeded() async -> DownloadPlan? {
        if onlineVideos.isEmpty {
            await loadOnlineLibrary(force: true)

            guard !onlineVideos.isEmpty else {
                return nil
            }
        }

        return makeDownloadPlan()
    }

    func canStartSingleDownload(for video: VideoItem) -> Bool {
        refreshStorage()

        if downloadedVideos.contains(where: { $0.id == video.id }) {
            alert = GatotecaAlert(
                title: "Esse ronron ja veio",
                message: "Esse vídeo já está salvo dentro da Gatoteca."
            )
            return false
        }

        if video.sizeBytes > availableForDownloadsBytes {
            alert = GatotecaAlert(
                title: "Não cabe agora",
                message: "Esse vídeo é grandinho demais para o espaço livre de agora."
            )
            return false
        }

        return true
    }

    func localFileURL(for video: DownloadedVideo) throws -> URL {
        try storage.localFileURL(for: video)
    }

    func delete(_ video: DownloadedVideo) {
        do {
            try storage.delete(downloaded: video)
            refreshStorage()
        } catch {
            showError(error)
            refreshStorage()
        }
    }

    func deleteAllDownloadedVideos() {
        do {
            try storage.deleteAllDownloadedVideos()
            refreshStorage()
        } catch {
            showError(error)
            refreshStorage()
        }
    }

    func showError(_ error: Error) {
        alert = GatotecaAlert(
            title: "Ops",
            message: GatotecaErrorMessage.text(for: error)
        )
    }

    private func orderedDownloadCandidates() -> [VideoItem] {
        let downloadedIDs = Set(downloadedVideos.map(\.id))

        return onlineVideos.enumerated()
            .filter { !downloadedIDs.contains($0.element.id) }
            .sorted { lhs, rhs in
                switch (lhs.element.priority, rhs.element.priority) {
                case let (left?, right?):
                    if left == right {
                        return lhs.offset < rhs.offset
                    }

                    return left < right
                case (.some, .none):
                    return true
                case (.none, .some):
                    return false
                case (.none, .none):
                    return lhs.offset < rhs.offset
                }
            }
            .map(\.element)
    }
}
