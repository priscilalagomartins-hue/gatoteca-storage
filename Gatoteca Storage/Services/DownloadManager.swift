import Foundation

enum DownloadError: LocalizedError {
    case notEnoughSpace
    case invalidResponse
    case invalidVideoLink
    case interrupted

    var errorDescription: String? {
        switch self {
        case .notEnoughSpace:
            return "Esse vídeo é grandinho demais para o espaço livre de agora."
        case .invalidResponse, .invalidVideoLink:
            return "O link desse vídeo parece inválido."
        case .interrupted:
            return "O download foi interrompido. O vídeo não foi salvo pela metade."
        }
    }
}

struct FailedVideoDownload: Identifiable, Hashable {
    var id: String { video.id }

    let video: VideoItem
    let message: String
}

struct DownloadReport {
    let succeeded: [DownloadedVideo]
    let failed: [FailedVideoDownload]
    let cancelled: Bool
    let usedByAppBytes: Int64
    let freeSpaceBytes: Int64
}

struct DownloadQueueState {
    var isRunning = false
    var currentVideoTitle = ""
    var currentVideoProgress = 0.0
    var completedCount = 0
    var totalCount = 0
    var succeeded: [DownloadedVideo] = []
    var failed: [FailedVideoDownload] = []
    var report: DownloadReport?

    var remainingCount: Int {
        max(totalCount - completedCount, 0)
    }

    var overallProgress: Double {
        guard totalCount > 0 else {
            return 0
        }

        let progress = Double(completedCount) + currentVideoProgress
        return min(max(progress / Double(totalCount), 0), 1)
    }
}

final class DownloadManager: NSObject, ObservableObject {
    @Published private(set) var state = DownloadQueueState()

    private let storage: StorageManager
    private lazy var session = URLSession(
        configuration: .default,
        delegate: self,
        delegateQueue: .main
    )

    private var currentTask: URLSessionDownloadTask?
    private var currentVideo: VideoItem?
    private var currentResult: Result<DownloadedVideo, Error>?
    private var continuation: CheckedContinuation<DownloadedVideo, Error>?
    private var cancelRequested = false

    init(storage: StorageManager) {
        self.storage = storage
    }

    @MainActor
    func startDownloads(_ videos: [VideoItem]) async -> DownloadReport {
        guard !state.isRunning else {
            return state.report ?? DownloadReport(
                succeeded: state.succeeded,
                failed: state.failed,
                cancelled: false,
                usedByAppBytes: (try? storage.usedStorageBytes()) ?? 0,
                freeSpaceBytes: (try? storage.freeSpaceBytes()) ?? 0
            )
        }

        cancelRequested = false
        state = DownloadQueueState(
            isRunning: true,
            currentVideoTitle: "",
            currentVideoProgress: 0,
            completedCount: 0,
            totalCount: videos.count,
            succeeded: [],
            failed: [],
            report: nil
        )

        for video in videos {
            guard !cancelRequested else {
                break
            }

            state.currentVideoTitle = video.title
            state.currentVideoProgress = 0

            do {
                let freeSpace = try storage.freeSpaceBytes()
                guard video.sizeBytes <= StorageManager.availableDownloadCapacity(from: freeSpace) else {
                    throw DownloadError.notEnoughSpace
                }

                let downloaded = try await downloadOne(video)
                state.succeeded.append(downloaded)
            } catch {
                if cancelRequested {
                    break
                }

                state.failed.append(FailedVideoDownload(
                    video: video,
                    message: GatotecaErrorMessage.text(for: error)
                ))
            }

            state.completedCount = state.succeeded.count + state.failed.count
        }

        let report = DownloadReport(
            succeeded: state.succeeded,
            failed: state.failed,
            cancelled: cancelRequested,
            usedByAppBytes: (try? storage.usedStorageBytes()) ?? 0,
            freeSpaceBytes: (try? storage.freeSpaceBytes()) ?? 0
        )

        state.isRunning = false
        state.currentVideoTitle = ""
        state.currentVideoProgress = 0
        state.report = report
        currentTask = nil
        currentVideo = nil
        currentResult = nil

        return report
    }

    @MainActor
    func cancelDownloads() {
        cancelRequested = true
        currentTask?.cancel()
    }

    @MainActor
    private func downloadOne(_ video: VideoItem) async throws -> DownloadedVideo {
        currentVideo = video
        currentResult = nil

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let task = session.downloadTask(with: video.url)
            currentTask = task
            task.resume()
        }
    }

    private func finishCurrentDownload(with result: Result<DownloadedVideo, Error>) {
        guard let continuation else {
            return
        }

        self.continuation = nil
        currentTask = nil
        currentVideo = nil
        currentResult = nil

        switch result {
        case .success(let downloaded):
            continuation.resume(returning: downloaded)
        case .failure(let error):
            continuation.resume(throwing: error)
        }
    }
}

extension DownloadManager: URLSessionDownloadDelegate {
    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        let expectedBytes = totalBytesExpectedToWrite > 0
            ? totalBytesExpectedToWrite
            : currentVideo?.sizeBytes ?? 0

        guard expectedBytes > 0 else {
            return
        }

        state.currentVideoProgress = min(
            max(Double(totalBytesWritten) / Double(expectedBytes), 0),
            1
        )
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard let video = currentVideo else {
            currentResult = .failure(DownloadError.interrupted)
            return
        }

        guard let response = downloadTask.response as? HTTPURLResponse else {
            currentResult = .failure(DownloadError.invalidResponse)
            return
        }

        guard (200..<300).contains(response.statusCode) else {
            currentResult = .failure(DownloadError.invalidVideoLink)
            return
        }

        do {
            let downloaded = try storage.saveTempDownload(from: location, for: video)
            currentResult = .success(downloaded)
        } catch {
            currentResult = .failure(error)
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if let error {
            finishCurrentDownload(with: .failure(error))
            return
        }

        finishCurrentDownload(with: currentResult ?? .failure(DownloadError.interrupted))
    }
}
