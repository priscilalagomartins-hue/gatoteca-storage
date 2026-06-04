import Foundation

struct StorageSnapshot {
    let freeSpaceBytes: Int64
    let usedByAppBytes: Int64
    let downloadedVideos: [DownloadedVideo]

    var availableForDownloadsBytes: Int64 {
        StorageManager.availableDownloadCapacity(from: freeSpaceBytes)
    }
}

enum StorageError: LocalizedError {
    case unableToReadFreeSpace
    case manifestCorrupted
    case unsafeFilePath
    case videoNotRegistered
    case localFileNotFound
    case deleteFailed

    var errorDescription: String? {
        switch self {
        case .unableToReadFreeSpace:
            return "Não foi possível consultar o espaço livre do iPhone."
        case .manifestCorrupted:
            return "A lista local de downloads da Gatoteca não pode ser lida."
        case .unsafeFilePath:
            return "A Gatoteca bloqueou uma ação fora da sua própria cestinha."
        case .videoNotRegistered:
            return "Esse vídeo não está registrado como download da Gatoteca."
        case .localFileNotFound:
            return "O arquivo local desse vídeo não foi encontrado."
        case .deleteFailed:
            return "Não foi possível apagar esse vídeo baixado pela Gatoteca."
        }
    }
}

final class StorageManager {
    static let securityMarginBytes: Int64 = 1_073_741_824

    private let fileManager: FileManager
    private let videosFolderName = "GatotecaVideos"
    private let manifestFileName = "downloads.json"

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    static func availableDownloadCapacity(from freeSpaceBytes: Int64) -> Int64 {
        max(0, freeSpaceBytes - securityMarginBytes)
    }

    func refreshSnapshot() throws -> StorageSnapshot {
        let downloaded = try loadDownloadedVideos()
        return StorageSnapshot(
            freeSpaceBytes: try freeSpaceBytes(),
            usedByAppBytes: try usedStorageBytes(for: downloaded),
            downloadedVideos: downloaded.sorted { $0.downloadedAt > $1.downloadedAt }
        )
    }

    func freeSpaceBytes() throws -> Int64 {
        let url = try videosDirectoryURL()
        let values = try url.resourceValues(forKeys: [
            .volumeAvailableCapacityForImportantUsageKey,
            .volumeAvailableCapacityKey
        ])

        if let importantUsage = values.volumeAvailableCapacityForImportantUsage {
            return importantUsage
        }

        if let availableCapacity = values.volumeAvailableCapacity {
            return Int64(availableCapacity)
        }

        throw StorageError.unableToReadFreeSpace
    }

    func loadDownloadedVideos() throws -> [DownloadedVideo] {
        let url = try manifestURL()

        guard fileManager.fileExists(atPath: url.path) else {
            return []
        }

        do {
            let data = try Data(contentsOf: url)
            guard !data.isEmpty else {
                return []
            }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([DownloadedVideo].self, from: data)
        } catch {
            throw StorageError.manifestCorrupted
        }
    }

    func usedStorageBytes() throws -> Int64 {
        try usedStorageBytes(for: loadDownloadedVideos())
    }

    func localFileURL(for downloaded: DownloadedVideo) throws -> URL {
        let directory = try videosDirectoryURL()
        let candidate = directory.appendingPathComponent(downloaded.localFileName, isDirectory: false)

        guard candidate.lastPathComponent != manifestFileName,
              isInsideVideosDirectory(candidate, directory: directory) else {
            throw StorageError.unsafeFilePath
        }

        return candidate
    }

    func saveTempDownload(from temporaryURL: URL, for video: VideoItem) throws -> DownloadedVideo {
        let directory = try videosDirectoryURL()
        let fileName = localFileName(for: video)
        let destination = directory.appendingPathComponent(fileName, isDirectory: false)

        guard isInsideVideosDirectory(destination, directory: directory) else {
            throw StorageError.unsafeFilePath
        }

        if fileManager.fileExists(atPath: destination.path) {
            try fileManager.removeItem(at: destination)
        }

        try fileManager.moveItem(at: temporaryURL, to: destination)

        let actualSize = fileSize(at: destination) ?? video.sizeBytes
        let downloaded = DownloadedVideo(
            id: video.id,
            title: video.title,
            localFileName: fileName,
            originalURL: video.url.absoluteString,
            sizeBytes: actualSize,
            downloadedAt: Date()
        )

        var records = try loadDownloadedVideos()
        records.removeAll { $0.id == downloaded.id }
        records.append(downloaded)
        try saveManifest(records)

        return downloaded
    }

    func delete(downloaded: DownloadedVideo) throws {
        var records = try loadDownloadedVideos()

        guard records.contains(where: { $0.id == downloaded.id }) else {
            throw StorageError.videoNotRegistered
        }

        let localURL = try localFileURL(for: downloaded)

        guard fileManager.fileExists(atPath: localURL.path) else {
            records.removeAll { $0.id == downloaded.id }
            try saveManifest(records)
            throw StorageError.localFileNotFound
        }

        do {
            try fileManager.removeItem(at: localURL)
            records.removeAll { $0.id == downloaded.id }
            try saveManifest(records)
        } catch {
            throw StorageError.deleteFailed
        }
    }

    func deleteAllDownloadedVideos() throws {
        let records = try loadDownloadedVideos()

        do {
            for record in records {
                let localURL = try localFileURL(for: record)
                if fileManager.fileExists(atPath: localURL.path) {
                    try fileManager.removeItem(at: localURL)
                }
            }

            try saveManifest([])
        } catch {
            throw StorageError.deleteFailed
        }
    }

    private func usedStorageBytes(for videos: [DownloadedVideo]) throws -> Int64 {
        var total: Int64 = 0

        for video in videos {
            let url = try localFileURL(for: video)
            total += fileSize(at: url) ?? 0
        }

        return total
    }

    private func videosDirectoryURL() throws -> URL {
        let supportURL = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let videosURL = supportURL.appendingPathComponent(videosFolderName, isDirectory: true)

        if !fileManager.fileExists(atPath: videosURL.path) {
            try fileManager.createDirectory(at: videosURL, withIntermediateDirectories: true)
        }

        return videosURL
    }

    private func manifestURL() throws -> URL {
        try videosDirectoryURL().appendingPathComponent(manifestFileName, isDirectory: false)
    }

    private func saveManifest(_ records: [DownloadedVideo]) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        let data = try encoder.encode(records)
        try data.write(to: try manifestURL(), options: [.atomic])
    }

    private func localFileName(for video: VideoItem) -> String {
        let allowedIDCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let safeID = video.id.unicodeScalars
            .map { allowedIDCharacters.contains($0) ? String($0) : "-" }
            .joined()

        let rawExtension = video.url.pathExtension.isEmpty ? "mp4" : video.url.pathExtension
        let allowedExtensionCharacters = CharacterSet.alphanumerics
        let safeExtension = rawExtension.lowercased().unicodeScalars
            .map { allowedExtensionCharacters.contains($0) ? String($0) : "" }
            .joined()

        return "\(safeID.isEmpty ? UUID().uuidString : safeID).\(safeExtension.isEmpty ? "mp4" : safeExtension)"
    }

    private func isInsideVideosDirectory(_ fileURL: URL, directory: URL) -> Bool {
        let directoryPath = directory.standardizedFileURL.path
        let filePath = fileURL.standardizedFileURL.path
        return filePath.hasPrefix(directoryPath + "/")
    }

    private func fileSize(at url: URL) -> Int64? {
        guard fileManager.fileExists(atPath: url.path),
              let size = try? fileManager.attributesOfItem(atPath: url.path)[.size] as? NSNumber else {
            return nil
        }

        return size.int64Value
    }
}
