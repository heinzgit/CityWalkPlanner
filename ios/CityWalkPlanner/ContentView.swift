import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = CityWalkViewModel()

    var body: some View {
        ZStack(alignment: .bottom) {
            RouteMapView(viewModel: viewModel)
                .ignoresSafeArea()

            VStack(spacing: 12) {
                toolbar
                routeStrip
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 16)
        }
        .task {
            await viewModel.loadRoutes()
        }
        .sheet(isPresented: $viewModel.isSaveSheetPresented) {
            SaveWalkSheet(viewModel: viewModel)
        }
        .alert("CityWalk", isPresented: Binding(
            get: { viewModel.message != nil },
            set: { if !$0 { viewModel.message = nil } }
        )) {
            Button("确定", role: .cancel) {
                viewModel.message = nil
            }
        } message: {
            Text(viewModel.message ?? "")
        }
    }

    private var toolbar: some View {
        HStack(spacing: 8) {
            Button {
                viewModel.focusCurrentLocation()
            } label: {
                Label("定位", systemImage: "location.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(ToolButtonStyle())

            if viewModel.isRecording {
                Button {
                    viewModel.stopRecording()
                } label: {
                    Label("结束记录", systemImage: "stop.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ToolButtonStyle(tint: .orange))
            } else {
                Button {
                    viewModel.startRecording()
                } label: {
                    Label("开始记录", systemImage: "record.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ToolButtonStyle(tint: .blue, isProminent: true))
            }
        }
    }

    private var routeStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.visibleRoutes) { route in
                    Button {
                        viewModel.selectRoute(route)
                    } label: {
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(route.swiftUIColor)
                                .frame(width: 4, height: 22)
                            Text(route.name)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(route.id == viewModel.selectedRouteId ? Color.blue.opacity(0.12) : Color.white.opacity(0.96))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(route.id == viewModel.selectedRouteId ? Color.blue.opacity(0.45) : Color.gray.opacity(0.25))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 1)
        }
    }
}

struct ToolButtonStyle: ButtonStyle {
    var tint: Color = .blue
    var isProminent = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(isProminent ? .white : tint)
            .frame(height: 44)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isProminent ? tint : Color.white.opacity(0.96))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(tint.opacity(isProminent ? 0 : 0.4))
            )
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}
