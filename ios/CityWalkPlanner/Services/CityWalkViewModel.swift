import Foundation
import CoreLocation
import MapKit

@MainActor
final class CityWalkViewModel: ObservableObject {
    @Published private(set) var routes: [RoutePlan] = []
    @Published var selectedRouteId: String?
    @Published var trackPoints: [TrackPoint] = []
    @Published var isRecording = false
    @Published var isSavingWalk = false
    @Published var isSaveSheetPresented = false
    @Published var message: String?
    @Published var mapRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 31.2304, longitude: 121.4737),
        span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
    )

    let locationManager = LocationManager()
    private var shouldFocusLocationOnNextUpdate = false

    var selectedRoute: RoutePlan? {
        guard let selectedRouteId else {
            return nil
        }
        return routes.first { $0.id == selectedRouteId }
    }

    var visibleRoutes: [RoutePlan] {
        routes.filter(\.isVisible)
    }

    init() {
        locationManager.onLocationUpdate = { [weak self] point in
            self?.appendTrackPoint(point)
        }
    }

    func loadRoutes() async {
        do {
            let payload = try await APIClient.shared.getTree()
            let visible = payload.routes.filter(\.isVisible)
            routes = visible
            selectedRouteId = selectedRouteId ?? visible.first?.id
            fitSelectedRoute()
        } catch {
            message = "路线加载失败"
        }
    }

    func selectRoute(_ route: RoutePlan) {
        selectedRouteId = route.id
        fitSelectedRoute()
    }

    func focusCurrentLocation() {
        shouldFocusLocationOnNextUpdate = true
        locationManager.focusCurrentLocation()

        if let coordinate = locationManager.currentCoordinate {
            shouldFocusLocationOnNextUpdate = false
            mapRegion = MKCoordinateRegion(
                center: coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
            )
        }
    }

    func startRecording() {
        trackPoints = []
        isRecording = true
        locationManager.startRecording()
        message = "记录中"
    }

    func stopRecording() {
        locationManager.stopRecording()
        isRecording = false

        guard trackPoints.count >= 2 else {
            message = "轨迹点太少"
            return
        }

        isSaveSheetPresented = true
    }

    func cancelWalkSave() {
        isSaveSheetPresented = false
        trackPoints = []
    }

    func saveWalk(name: String, description: String?) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            message = "请输入路线名称"
            return
        }

        let trimmedDescription = description?.trimmingCharacters(in: .whitespacesAndNewlines)
        let savedPoints = trackPoints
            .map(\.routePoint)
            .map(CoordinateConverter.gcj02ToBd09)

        guard savedPoints.count >= 2, !isSavingWalk else {
            return
        }

        isSavingWalk = true
        defer { isSavingWalk = false }

        do {
            let route = try await APIClient.shared.createRouteFromWalk(
                name: trimmedName,
                description: trimmedDescription?.isEmpty == false ? trimmedDescription : nil,
                points: savedPoints
            )

            message = "路线已保存"
            isSaveSheetPresented = false
            trackPoints = []
            selectedRouteId = route.id
            await loadRoutes()
        } catch {
            message = "保存失败"
        }
    }

    func fitSelectedRoute() {
        guard let route = selectedRoute, !route.points.isEmpty else {
            return
        }

        let coordinates = route.points
            .map(CoordinateConverter.bd09ToGcj02)
            .map(\.coordinate)
        mapRegion = Self.region(for: coordinates)
    }

    private func appendTrackPoint(_ point: TrackPoint) {
        if shouldFocusLocationOnNextUpdate {
            shouldFocusLocationOnNextUpdate = false
            mapRegion = MKCoordinateRegion(
                center: point.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
            )
        }

        guard isRecording else {
            return
        }

        if TrackFilter.shouldAppend(points: trackPoints, nextPoint: point) {
            trackPoints.append(point)
        }
    }

    private static func region(for coordinates: [CLLocationCoordinate2D]) -> MKCoordinateRegion {
        guard let first = coordinates.first else {
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 31.2304, longitude: 121.4737),
                span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
            )
        }

        var minLat = first.latitude
        var maxLat = first.latitude
        var minLng = first.longitude
        var maxLng = first.longitude

        for coordinate in coordinates {
            minLat = min(minLat, coordinate.latitude)
            maxLat = max(maxLat, coordinate.latitude)
            minLng = min(minLng, coordinate.longitude)
            maxLng = max(maxLng, coordinate.longitude)
        }

        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2
        )

        return MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(
                latitudeDelta: max((maxLat - minLat) * 1.5, 0.01),
                longitudeDelta: max((maxLng - minLng) * 1.5, 0.01)
            )
        )
    }
}
