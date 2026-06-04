import Foundation

struct GatotecaAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

enum GatotecaErrorMessage {
    static func text(for error: Error) -> String {
        if let localized = error as? LocalizedError,
           let description = localized.errorDescription {
            return description
        }

        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain else {
            return "Algo saiu do cesto dos gatinhos. Tente novamente daqui a pouco."
        }

        switch nsError.code {
        case NSURLErrorNotConnectedToInternet:
            return "Sem internet por agora. Quando o sinal voltar, a Gatoteca tenta de novo."
        case NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut:
            return "O download foi interrompido. O vídeo não foi salvo pela metade."
        case NSURLErrorCancelled:
            return "Os downloads foram cancelados."
        case NSURLErrorUnsupportedURL, NSURLErrorBadURL:
            return "O link desse vídeo parece inválido."
        default:
            return "Não conseguimos conversar com a internet agora."
        }
    }
}
