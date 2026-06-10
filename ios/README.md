# CityWalk Planner iPhone Client

This folder contains the native iPhone client for CityWalk Planner.

## Toolchain

- macOS 13.3
- Xcode 14.3.1
- Swift 5
- iOS 15.0+

The project is intentionally created as a plain Xcode project so it can be opened directly with Xcode 14.3.1:

```bash
open ios/CityWalkPlanner.xcodeproj
```

## Current Features

The iPhone client matches the WeChat mini program's first-stage feature set:

- Load visible routes from `GET /api/tree`.
- Draw existing routes on the map.
- Select a route from the bottom strip.
- Focus on the current location.
- Record a real walking track.
- Save the recorded track to `POST /api/routes/from-walk`.
- Keep the same BD-09 and GCJ-02 conversion strategy as the mini program.
- Use Apple's native `MapKit`; in mainland China, Apple Maps data is commonly provided by AutoNavi.

## API Configuration

Edit `ios/CityWalkPlanner/Services/APIClient.swift` and change `baseURL` to your LAN API server:

```swift
private let baseURL = URL(string: "http://192.168.8.100:43101")!
```

For local simulator testing, you can use:

```swift
private let baseURL = URL(string: "http://127.0.0.1:43101")!
```

iPhone real-device testing must use the Mac's LAN IP, and the API server should listen on `0.0.0.0`.

## Map

The app uses native `MapKit`, so there is no third-party map SDK, CocoaPods setup, or map AK requirement.

The backend route points remain compatible with the existing Web and mini program data model. Existing route points are stored as BD-09, converted to GCJ-02 before display, and recorded walk points are converted back to BD-09 before saving.

## Permissions

`Info.plist` declares foreground and background location usage descriptions. If you do not need background recording yet, remove `location` from `UIBackgroundModes`.
