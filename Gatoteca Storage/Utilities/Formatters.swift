import Foundation

enum GatotecaFormatters {
    static let bytes: ByteCountFormatter = {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useMB, .useGB]
        formatter.countStyle = .file
        formatter.includesUnit = true
        formatter.isAdaptive = true
        return formatter
    }()

    static let date: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter
    }()
}

extension Int64 {
    var gatotecaSize: String {
        GatotecaFormatters.bytes.string(fromByteCount: self)
    }
}

extension Date {
    var gatotecaDate: String {
        GatotecaFormatters.date.string(from: self)
    }
}
