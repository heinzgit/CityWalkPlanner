import Foundation

final class APIClient {
    static let shared = APIClient()

    // Use your Mac's LAN IP for real-device testing.
    private let baseURL = URL(string: "http://192.168.0.101:43101")!
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        decoder = JSONDecoder()
        encoder = JSONEncoder()
    }

    func getTree() async throws -> TreePayload {
        try await request(path: "/api/tree")
    }

    func createRouteFromWalk(name: String, description: String?, points: [RoutePoint]) async throws -> RoutePlan {
        let payload = CreateRouteFromWalkRequest(
            name: name,
            description: description,
            points: points
        )

        return try await request(
            path: "/api/routes/from-walk",
            method: "POST",
            body: encoder.encode(payload)
        )
    }

    private func request<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> T {
        let normalizedPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.path = "/\(normalizedPath)"

        guard let url = components?.url else {
            throw APIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "Request failed"
            throw APIError.requestFailed(statusCode: httpResponse.statusCode, detail: detail)
        }

        return try decoder.decode(T.self, from: data)
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case requestFailed(statusCode: Int, detail: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "服务器响应无效"
        case .requestFailed(let statusCode, let detail):
            return "请求失败 \(statusCode): \(detail)"
        }
    }
}
