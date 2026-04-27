// ════════════════════════════════════════════════════════════════
// PERENNE NOTE iOS — TeamBrandManager extension patch
//
// This file documents the Swift changes needed to consume the new
// rich cover config format from `api.perenne.app/team/{code}`.
//
// Old format (still supported):
//   { company, logoURL, quote, colors, seats, expires }
//
// New format (V1):
//   {
//     company, logoURL (compat), logoSymbolURL, logoExtendedURL,
//     quote, colors,
//     cover: {
//       backgroundColor,
//       assets: [{ url, x, y, scale, rotation, opacity }],
//       quote: { text, position, color }
//     },
//     seats, expires
//   }
//
// Apply these changes to Perenne Note iOS project.
// ════════════════════════════════════════════════════════════════

// MARK: - Updated TeamBrandConfig decodable

/*
 In `TeamBrandManager.swift`, replace the TeamBrandConfig struct with:

 struct TeamBrandConfig: Codable {
     let company: String
     let logoURL: String?
     let logoSymbolURL: String?
     let logoExtendedURL: String?
     let quote: String?
     let colors: TeamColors?
     let cover: TeamCoverConfig?     // NEW
     let seats: Int?
     let expires: String?
 }

 struct TeamColors: Codable {
     let primary: String?
     let secondary: String?
 }

 struct TeamCoverConfig: Codable {
     let backgroundColor: String
     let assets: [TeamCoverAsset]
     let quote: TeamCoverQuote?
 }

 struct TeamCoverAsset: Codable {
     let url: String
     let x: Double       // normalized 0-1
     let y: Double       // normalized 0-1
     let scale: Double   // relative to intrinsic size
     let rotation: Double  // degrees
     let opacity: Double   // 0-1
 }

 struct TeamCoverQuote: Codable {
     let text: String
     let position: String  // "top" | "center" | "bottom"
     let color: String
 }
*/

// MARK: - Activate function update

/*
 In `TeamBrandManager.activate(code:)`, after fetching config:

 // Send deviceId for per-device claim tracking
 let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
 var request = URLRequest(url: url)
 request.setValue(deviceId, forHTTPHeaderField: "X-Device-Id")

 // Handle new 410 Gone for already-claimed-on-other-device case
 if let httpResp = response as? HTTPURLResponse, httpResp.statusCode == 410 {
     print("⚠️ TeamBrand: code already activated on a different device")
     return false
 }

 // After decoding config, download ALL assets, not just logoURL:
 for asset in config.cover?.assets ?? [] {
     guard let assetURL = URL(string: asset.url) else { continue }
     if let (data, _) = try? await URLSession.shared.data(from: assetURL) {
         let key = "team_asset_\(asset.url.hashValue)"
         UserDefaults.standard.set(data, forKey: key)
     }
 }
*/

// MARK: - CoverRenderer new file

/*
 Create a new file `CoverRenderer.swift` that renders the notebook cover
 using the TeamCoverConfig. The renderer should:

 1. Fill the cover with `backgroundColor`
 2. For each asset, apply:
    - Position: (x * coverWidth, y * coverHeight)
    - Scale: scale factor on intrinsic image size
    - Rotation: rotate by `rotation` degrees around center
    - Opacity: set alpha
 3. Render optional quote text at specified position

 Minimal SwiftUI implementation:

 struct CompanyCoverView: View {
     let config: TeamCoverConfig
     let assetImages: [String: UIImage]    // url → cached image
     let size: CGSize                       // cover dimensions

     var body: some View {
         ZStack {
             Color(hex: config.backgroundColor)
                 .ignoresSafeArea()

             ForEach(config.assets, id: \.url) { asset in
                 if let image = assetImages[asset.url] {
                     Image(uiImage: image)
                         .resizable()
                         .aspectRatio(contentMode: .fit)
                         .frame(
                             width: image.size.width * asset.scale,
                             height: image.size.height * asset.scale
                         )
                         .rotationEffect(.degrees(asset.rotation))
                         .opacity(asset.opacity)
                         .position(
                             x: asset.x * size.width,
                             y: asset.y * size.height
                         )
                 }
             }

             if let quote = config.quote {
                 Text(quote.text)
                     .font(.custom("Fraunces-Italic", size: 14))
                     .foregroundColor(Color(hex: quote.color))
                     .padding()
                     .frame(maxWidth: .infinity, maxHeight: .infinity,
                            alignment: quoteAlignment(quote.position))
             }
         }
         .frame(width: size.width, height: size.height)
     }

     private func quoteAlignment(_ pos: String) -> Alignment {
         switch pos {
         case "top":    return .top
         case "center": return .center
         default:       return .bottom
         }
     }
 }
*/

// MARK: - Integration point in NotebookCoverView (or equivalent)

/*
 Where Perenne Note currently renders the notebook cover, check:

 if let config = TeamBrandManager.shared.coverConfig {
     CompanyCoverView(
         config: config,
         assetImages: TeamBrandManager.shared.cachedAssetImages,
         size: coverSize
     )
 } else {
     // Fall back to standard Perenne cover
     DefaultCoverView(...)
 }
*/

// MARK: - Error handling

/*
 Add user-facing error messages in Settings → Team:

 - 404: "Invalid code. Check and try again."
 - 410: "This code has already been used on another device.
         Contact your administrator for a new one."
 - 429: "Too many attempts. Wait a minute and retry."
 - 500: "Server error. Please try again shortly."
*/

// End of patch notes.
