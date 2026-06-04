import SwiftUI

enum CatTheme {
    static let background = Color(red: 0.99, green: 0.96, blue: 0.91)
    static let surface = Color(red: 1.00, green: 0.99, blue: 0.97)
    static let blush = Color(red: 0.95, green: 0.63, blue: 0.63)
    static let mint = Color(red: 0.62, green: 0.78, blue: 0.70)
    static let blue = Color(red: 0.38, green: 0.58, blue: 0.76)
    static let honey = Color(red: 0.95, green: 0.74, blue: 0.42)
    static let ink = Color(red: 0.22, green: 0.20, blue: 0.22)
    static let softInk = Color(red: 0.43, green: 0.39, blue: 0.41)
}

struct PawButtonStyle: ButtonStyle {
    let background: Color
    let foreground: Color

    init(background: Color = CatTheme.blush, foreground: Color = .white) {
        self.background = background
        self.foreground = foreground
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(foreground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(background.opacity(configuration.isPressed ? 0.75 : 1.0))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let systemImage: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundColor(color)

            Text(title)
                .font(.caption)
                .foregroundColor(CatTheme.softInk)

            Text(value)
                .font(.title3.bold())
                .foregroundColor(CatTheme.ink)
                .minimumScaleFactor(0.75)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(CatTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(color.opacity(0.22), lineWidth: 1)
        )
    }
}
