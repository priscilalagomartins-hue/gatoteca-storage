import SwiftUI

struct DownloadQueueView: View {
    @EnvironmentObject private var downloadManager: DownloadManager

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if downloadManager.state.isRunning {
                    runningContent
                } else if let report = downloadManager.state.report {
                    reportContent(report)
                } else {
                    emptyContent
                }
            }
            .padding(18)
        }
        .background(CatTheme.background.ignoresSafeArea())
        .navigationTitle("Fila de downloads")
    }

    private var runningContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Baixando com calma")
                .font(.title3.bold())
                .foregroundColor(CatTheme.ink)

            VStack(alignment: .leading, spacing: 10) {
                Text("Progresso geral")
                    .font(.subheadline.bold())
                    .foregroundColor(CatTheme.softInk)

                ProgressView(value: downloadManager.state.overallProgress)
                    .tint(CatTheme.blue)

                Text("\(downloadManager.state.completedCount) baixados, \(downloadManager.state.remainingCount) faltam")
                    .font(.caption)
                    .foregroundColor(CatTheme.softInk)
            }
            .padding(14)
            .background(CatTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 10) {
                Text(downloadManager.state.currentVideoTitle)
                    .font(.headline)
                    .foregroundColor(CatTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)

                ProgressView(value: downloadManager.state.currentVideoProgress)
                    .tint(CatTheme.mint)

                Text("\(Int(downloadManager.state.currentVideoProgress * 100))% deste vídeo")
                    .font(.caption)
                    .foregroundColor(CatTheme.softInk)
            }
            .padding(14)
            .background(CatTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            Button(role: .destructive) {
                downloadManager.cancelDownloads()
            } label: {
                Label("Cancelar downloads", systemImage: "xmark.circle.fill")
            }
            .buttonStyle(PawButtonStyle(background: CatTheme.blush))
        }
    }

    private func reportContent(_ report: DownloadReport) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(report.cancelled ? "Downloads cancelados" : "Relatório final")
                .font(.title3.bold())
                .foregroundColor(CatTheme.ink)

            MetricCard(
                title: "Vídeos baixados com sucesso",
                value: "\(report.succeeded.count)",
                systemImage: "checkmark.circle.fill",
                color: CatTheme.mint
            )

            MetricCard(
                title: "Vídeos que falharam",
                value: "\(report.failed.count)",
                systemImage: "exclamationmark.triangle.fill",
                color: CatTheme.honey
            )

            MetricCard(
                title: "Espaco usado pelo app",
                value: report.usedByAppBytes.gatotecaSize,
                systemImage: "pawprint.fill",
                color: CatTheme.blush
            )

            MetricCard(
                title: "Espaco livre restante",
                value: report.freeSpaceBytes.gatotecaSize,
                systemImage: "internaldrive",
                color: CatTheme.blue
            )

            if !report.failed.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Falhas")
                        .font(.headline)
                        .foregroundColor(CatTheme.ink)

                    ForEach(report.failed) { failed in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(failed.video.title)
                                .font(.subheadline.bold())
                                .foregroundColor(CatTheme.ink)

                            Text(failed.message)
                                .font(.caption)
                                .foregroundColor(CatTheme.softInk)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(CatTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }
            }
        }
    }

    private var emptyContent: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.largeTitle)
                .foregroundColor(CatTheme.blush)

            Text("Nenhum download na fila")
                .font(.headline)
                .foregroundColor(CatTheme.ink)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}
