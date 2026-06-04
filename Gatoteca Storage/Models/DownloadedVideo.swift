import Foundation

struct DownloadedVideo: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let localFileName: String
    let originalURL: String
    let sizeBytes: Int64
    let downloadedAt: Date
}
