import Foundation

enum CoordinateConverter {
    private static let xPi = Double.pi * 3000.0 / 180.0

    static func bd09ToGcj02(_ point: RoutePoint) -> RoutePoint {
        let x = point.lng - 0.0065
        let y = point.lat - 0.006
        let z = sqrt(x * x + y * y) - 0.00002 * sin(y * xPi)
        let theta = atan2(y, x) - 0.000003 * cos(x * xPi)

        return RoutePoint(
            lng: z * cos(theta),
            lat: z * sin(theta)
        )
    }

    static func gcj02ToBd09(_ point: RoutePoint) -> RoutePoint {
        let z = sqrt(point.lng * point.lng + point.lat * point.lat) + 0.00002 * sin(point.lat * xPi)
        let theta = atan2(point.lat, point.lng) + 0.000003 * cos(point.lng * xPi)

        return RoutePoint(
            lng: z * cos(theta) + 0.0065,
            lat: z * sin(theta) + 0.006
        )
    }
}
