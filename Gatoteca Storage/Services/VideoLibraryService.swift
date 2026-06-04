import Foundation

enum VideoLibraryError: LocalizedError {
    case unavailable
    case invalidJSON
    case emptyLibrary

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "A lista online de vídeos não está disponível agora."
        case .invalidJSON:
            return "A lista online veio em um formato que a Gatoteca não reconhece."
        case .emptyLibrary:
            return "A lista online está vazia por enquanto."
        }
    }
}

struct VideoLibraryService {
    let libraryURL: URL

    func fetchVideos() async throws -> [VideoItem] {
        let (data, response) = try await URLSession.shared.data(from: libraryURL)

        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw VideoLibraryError.unavailable
        }

        do {
            let videos = try JSONDecoder().decode([VideoItem].self, from: data)

            guard !videos.isEmpty else {
                throw VideoLibraryError.emptyLibrary
            }

            return videos
        } catch let error as VideoLibraryError {
            throw error
        } catch {
            throw VideoLibraryError.invalidJSON
        }
    }
}
