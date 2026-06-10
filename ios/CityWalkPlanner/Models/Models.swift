import Foundation
import CoreLocation
import SwiftUI

struct RoutePoint: Codable, Hashable {
    var lng: Double
    var lat: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

struct TrackPoint: Codable, Hashable {
    var lng: Double
    var lat: Double
    var accuracy: Double?
    var speed: Double?
    var capturedAt: Date

    var routePoint: RoutePoint {
        RoutePoint(lng: lng, lat: lat)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

struct Folder: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var parentId: String?
    var isVisible: Bool
    var sortOrder: Int
    var createdAt: String
    var updatedAt: String
}

struct RoutePlan: Codable, Identifiable, Hashable {
    var id: String
    var folderId: String?
    var name: String
    var description: String?
    var color: String
    var isVisible: Bool
    var mapLng: Double?
    var mapLat: Double?
    var mapZoom: Double?
    var sortOrder: Int
    var createdAt: String
    var updatedAt: String
    var points: [RoutePoint]

    var swiftUIColor: Color {
        Color(hex: color) ?? .blue
    }
}

struct TreePayload: Codable {
    var folders: [Folder]
    var routes: [RoutePlan]
}

struct CreateRouteFromWalkRequest: Encodable {
    var name: String
    var description: String?
    var points: [RoutePoint]
}

extension Color {
    init?(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") {
            value.removeFirst()
        }

        guard value.count == 6, let intValue = Int(value, radix: 16) else {
            return nil
        }

        let red = Double((intValue >> 16) & 0xff) / 255.0
        let green = Double((intValue >> 8) & 0xff) / 255.0
        let blue = Double(intValue & 0xff) / 255.0
        self.init(red: red, green: green, blue: blue)
    }
}
