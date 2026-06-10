import SwiftUI

struct SaveWalkSheet: View {
    @ObservedObject var viewModel: CityWalkViewModel
    @State private var walkName = "CityWalk \(Self.defaultDateText)"
    @State private var walkDescription = ""

    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextField("路线名称", text: $walkName)
                        .textInputAutocapitalization(.never)
                    TextEditor(text: $walkDescription)
                        .frame(minHeight: 120)
                }

                Section {
                    HStack {
                        Text("轨迹点")
                        Spacer()
                        Text("\(viewModel.trackPoints.count)")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("保存路线")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        viewModel.cancelWalkSave()
                    }
                    .disabled(viewModel.isSavingWalk)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(viewModel.isSavingWalk ? "保存中" : "确认") {
                        Task {
                            await viewModel.saveWalk(
                                name: walkName,
                                description: walkDescription
                            )
                        }
                    }
                    .disabled(viewModel.isSavingWalk)
                }
            }
        }
    }

    private static var defaultDateText: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: Date())
    }
}
