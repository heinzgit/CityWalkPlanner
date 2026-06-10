import Foundation
import CoreLocation

enum TrackFilter {
    private static let minDistanceMeters: CLLocationDistance = 5

    static func shouldAppend(points: [TrackPoint], nextPoint: TrackPoint) -> Bool {
        guard let previous = points.last else {
            return true
        }

        if let accuracy = nextPoint.accuracy, accuracy > 80 {
            return false
        }

        return distanceMeters(previous, nextPoint) >= minDistanceMeters
    }

    static func distanceMeters(_ a: TrackPoint, _ b: TrackPoint) -> CLLocationDistance {
        let start = CLLocation(latitude: a.lat, longitude: a.lng)
        let end = CLLocation(latitude: b.lat, longitude: b.lng)
        return start.distance(from: end)
    }
}
