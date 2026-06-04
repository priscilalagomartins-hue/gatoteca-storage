import SwiftUI

@main
struct GatotecaStorageApp: App {
    @StateObject private var appModel: GatotecaViewModel
    @StateObject private var downloadManager: DownloadManager

    init() {
        let storage = StorageManager()
        let libraryService = VideoLibraryService(libraryURL: AppConfig.videoLibraryURL)

        _appModel = StateObject(wrappedValue: GatotecaViewModel(
            storage: storage,
            libraryService: libraryService
        ))
        _downloadManager = StateObject(wrappedValue: DownloadManager(storage: storage))
    }

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environmentObject(appModel)
                .environmentObject(downloadManager)
        }
    }
}
