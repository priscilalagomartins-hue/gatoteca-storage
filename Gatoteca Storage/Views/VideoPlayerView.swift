import AVKit
import SwiftUI

struct VideoPlayerView: View {
    let videoURL: URL
    let title: String

    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .background(Color.black.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fechar") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                let avPlayer = AVPlayer(url: videoURL)
                player = avPlayer
                avPlayer.play()
            }
            .onDisappear {
                player?.pause()
                player = nil
            }
    }
}
