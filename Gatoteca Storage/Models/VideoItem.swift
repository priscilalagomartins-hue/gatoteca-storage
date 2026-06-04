import Foundation

struct VideoItem: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let url: URL
    let thumbnail: URL?
    let sizeBytes: Int64
    let priority: Int?
}
