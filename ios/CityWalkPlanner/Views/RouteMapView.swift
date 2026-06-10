import SwiftUI
import MapKit

struct RouteMapView: View {
    @ObservedObject var viewModel: CityWalkViewModel

    var body: some View {
        NativeMapView(viewModel: viewModel)
    }
}

struct NativeMapView: UIViewRepresentable {
    @ObservedObject var viewModel: CityWalkViewModel

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.showsUserLocation = true
        mapView.userTrackingMode = .none
        mapView.setRegion(viewModel.mapRegion, animated: false)
        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.selectedRouteId = viewModel.selectedRouteId
        context.coordinator.routesByOverlay.removeAll()
        context.coordinator.trackOverlay = nil
        mapView.removeOverlays(mapView.overlays)

        for route in viewModel.visibleRoutes where route.points.count > 1 {
            let coordinates = route.points
                .map(CoordinateConverter.bd09ToGcj02)
                .map(\.coordinate)
            let polyline = MKPolyline(coordinates: coordinates, count: coordinates.count)
            context.coordinator.routesByOverlay[ObjectIdentifier(polyline)] = route
            mapView.addOverlay(polyline)
        }

        if viewModel.trackPoints.count > 1 {
            let coordinates = viewModel.trackPoints.map(\.coordinate)
            let polyline = MKPolyline(coordinates: coordinates, count: coordinates.count)
            context.coordinator.trackOverlay = ObjectIdentifier(polyline)
            mapView.addOverlay(polyline)
        }

        mapView.setRegion(viewModel.mapRegion, animated: true)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var routesByOverlay: [ObjectIdentifier: RoutePlan] = [:]
        var trackOverlay: ObjectIdentifier?
        var selectedRouteId: String?

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let polyline = overlay as? MKPolyline else {
                return MKOverlayRenderer(overlay: overlay)
            }

            let renderer = MKPolylineRenderer(polyline: polyline)
            let identifier = ObjectIdentifier(polyline)

            if trackOverlay == identifier {
                renderer.strokeColor = UIColor.systemOrange
                renderer.lineWidth = 7
                return renderer
            }

            if let route = routesByOverlay[identifier] {
                let isSelected = route.id == selectedRouteId
                renderer.strokeColor = UIColor(route.swiftUIColor).withAlphaComponent(isSelected ? 0.98 : 0.64)
                renderer.lineWidth = isSelected ? 6 : 4
            } else {
                renderer.strokeColor = UIColor.systemBlue
                renderer.lineWidth = 4
            }

            return renderer
        }
    }
}
