// Video side of `npm run extract-frames`. Run through scripts/extract-frames.mjs, which checks the
// arguments and passes one JSON settings object as the only argument. Uses only macOS frameworks.
//
// How it works: every decoded frame is read in order (AVAssetReader, no random seeking). A few times a
// second the current picture is shrunk to a small grayscale grid (90 cells wide). A sample is "settled"
// when every sample in the previous `hold` seconds is within a small difference of it. Each run of
// settled samples gives one PNG, taken from its last sample, so transitions, scrolling and animations
// are never written. A tighter "unchanged" test splits a run when a small control changes and then
// holds (a toggle before and after), while a spinner alone does not split it.
//
// Output: one JSON object per line on stdout ({"frame"...}, {"skipped"...}, {"progress"...}, {"video"...}).
import AVFoundation
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Settings: Decodable {
  struct Video: Decodable { let path: String; let prefix: String }
  let videos: [Video]
  let out: String
  let fps: Double
  let hold: Double
  let settle: Double      // fraction of cells allowed to change while "settled"
  let distinct: Double    // fraction of cells that makes two settled pictures different screens
  let cellDelta: Int      // gray levels a cell must change by to count as changed
  let matchDelta: Int     // the same, against --skip-matching images (resized, recompressed, other colour handling)
  let skipDir: String?
  let skipTop: Double     // top share of the picture ignored when comparing with --skip-matching images
}

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(2)
}

guard CommandLine.arguments.count == 2, let json = CommandLine.arguments[1].data(using: .utf8),
      let settings = try? JSONDecoder().decode(Settings.self, from: json)
else { fail("Run this through: npm run extract-frames -- <recording>") }

let context = CIContext(options: [.cacheIntermediates: false])
let gray = CGColorSpace(name: CGColorSpace.genericGrayGamma2_2)!
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let gridWidth = 90

// Small grayscale picture used for every comparison.
struct Signature { let width: Int; let height: Int; let cells: [UInt8] }

func signature(_ image: CIImage, width: Int, height: Int) -> Signature {
  let extent = image.extent
  // Blur by about half a cell first: shrinking alone samples single pixels, so a one-pixel shift of thin
  // text would look like a big change.
  let moved = image.transformed(by: CGAffineTransform(translationX: -extent.minX, y: -extent.minY)).clampedToExtent()
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: extent.width / Double(width) / 2])
    .cropped(to: CGRect(origin: .zero, size: extent.size))
  let scaleY = Double(height) / extent.height
  let filter = CIFilter(name: "CILanczosScaleTransform")!
  filter.setValue(moved, forKey: kCIInputImageKey)
  filter.setValue(scaleY, forKey: kCIInputScaleKey)
  filter.setValue((Double(width) / extent.width) / scaleY, forKey: kCIInputAspectRatioKey)
  let small = filter.outputImage!.clampedToExtent()
  var cells = [UInt8](repeating: 0, count: width * height)
  cells.withUnsafeMutableBytes { buffer in
    context.render(small, toBitmap: buffer.baseAddress!, rowBytes: width, bounds: CGRect(x: 0, y: 0, width: width, height: height), format: .L8, colorSpace: gray)
  }
  return Signature(width: width, height: height, cells: cells)
}

// Share of cells that changed by more than cellDelta. The grid's first row is the top of the picture.
func difference(_ a: Signature, _ b: Signature, ignoreTop: Double = 0, delta: Int = settings.cellDelta) -> Double {
  guard a.width == b.width, a.height == b.height else { return 1 }
  let first = Int((Double(a.height) * ignoreTop).rounded()) * a.width
  var changed = 0
  a.cells.withUnsafeBufferPointer { pa in
    b.cells.withUnsafeBufferPointer { pb in
      for index in first..<pa.count where abs(Int(pa[index]) - Int(pb[index])) > delta { changed += 1 }
    }
  }
  return Double(changed) / Double(max(a.cells.count - first, 1))
}

// The track's preferred transform as an orientation (screen recordings are normally .up).
func orientation(_ t: CGAffineTransform) -> CGImagePropertyOrientation {
  let r = { (v: CGFloat) in Int(v.rounded()) }
  switch (r(t.a), r(t.b), r(t.c), r(t.d)) {
  case (1, 0, 0, 1): return .up
  case (-1, 0, 0, -1): return .down
  case (0, 1, -1, 0): return .right
  case (0, -1, 1, 0): return .left
  case (-1, 0, 0, 1): return .upMirrored
  case (1, 0, 0, -1): return .downMirrored
  case (0, 1, 1, 0): return .leftMirrored
  case (0, -1, -1, 0): return .rightMirrored
  default: return .up
  }
}

// Reference images for --skip-matching, shrunk once per grid size.
var referenceFiles: [URL] = []
if let skipDir = settings.skipDir {
  let root = URL(fileURLWithPath: skipDir)
  if let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) {
    for case let url as URL in walker where ["png", "jpg", "jpeg"].contains(url.pathExtension.lowercased()) { referenceFiles.append(url) }
  }
  referenceFiles.sort { $0.path < $1.path }
}
var referenceCache: [String: [(name: String, sig: Signature)]] = [:]
func references(width: Int, height: Int) -> [(name: String, sig: Signature)] {
  let key = "\(width)x\(height)"
  if let cached = referenceCache[key] { return cached }
  var list: [(name: String, sig: Signature)] = []
  for url in referenceFiles {
    guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else { continue }
    let name = String(url.path.dropFirst(settings.skipDir!.count).drop(while: { $0 == "/" }))
    list.append((name, signature(image, width: width, height: height)))
  }
  referenceCache[key] = list
  return list
}

func writePNG(_ image: CIImage, to url: URL) {
  let extent = image.extent
  let moved = image.transformed(by: CGAffineTransform(translationX: -extent.minX, y: -extent.minY))
  guard let cg = context.createCGImage(moved, from: CGRect(origin: .zero, size: extent.size), format: .RGBA8, colorSpace: srgb),
        let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
  else { fail("Could not write \(url.path).") }
  CGImageDestinationAddImage(destination, cg, nil)
  if !CGImageDestinationFinalize(destination) { fail("Could not write \(url.path).") }
}

func stamp(_ seconds: Double) -> String {
  let ms = Int((seconds * 1000).rounded())
  return String(format: "%02dm%02ds%03d", ms / 60000, (ms / 1000) % 60, ms % 1000)
}

let outURL = URL(fileURLWithPath: settings.out)
var lastEmitted: Signature? = nil   // carried across recordings, processed in name order

for video in settings.videos {
  let asset = AVURLAsset(url: URL(fileURLWithPath: video.path))
  let semaphore = DispatchSemaphore(value: 0)
  var loaded: (track: AVAssetTrack, transform: CGAffineTransform, size: CGSize, duration: CMTime)? = nil
  var loadError: Error? = nil
  Task {
    do {
      if let track = try await asset.loadTracks(withMediaType: .video).first {
        let (transform, size) = try await track.load(.preferredTransform, .naturalSize)
        loaded = (track, transform, size, try await asset.load(.duration))
      }
    } catch { loadError = error }
    semaphore.signal()
  }
  semaphore.wait()
  guard let info = loaded else {
    fail("Could not read \(video.path) as a video\(loadError.map { " (\($0.localizedDescription))" } ?? ""). Use a .mov or .mp4 screen recording.")
  }
  let orient = orientation(info.transform)
  let rotated = [.left, .right, .leftMirrored, .rightMirrored].contains(orient)
  let displayWidth = Int(rotated ? info.size.height : info.size.width)
  let displayHeight = Int(rotated ? info.size.width : info.size.height)
  let gridHeight = max(1, Int((Double(gridWidth) * Double(displayHeight) / Double(displayWidth)).rounded()))
  let refs = references(width: gridWidth, height: gridHeight)
  let duration = info.duration.seconds

  guard let reader = try? AVAssetReader(asset: asset) else { fail("Could not open \(video.path) for reading.") }
  let output = AVAssetReaderTrackOutput(track: info.track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { fail("Could not decode \(video.path) (\(reader.error?.localizedDescription ?? "unknown error")).") }

  struct Sample { let time: Double; let sig: Signature; let buffer: CVPixelBuffer }
  var window: [Sample] = []          // recent samples, enough to cover `hold`
  var looseLast: Sample? = nil       // last sample of the current settled run
  var looseHadStrict = false
  var strictLast: Sample? = nil      // last sample of the current unchanged stretch inside it
  var emitted = 0, duplicates = 0, matching = 0, samples = 0
  var lastProgress = -1

  func image(_ buffer: CVPixelBuffer) -> CIImage { CIImage(cvPixelBuffer: buffer).oriented(orient) }

  func candidate(_ sample: Sample) {
    if let previous = lastEmitted, difference(previous, sample.sig) <= settings.distinct {
      duplicates += 1; emit(["skipped": "duplicate", "time": sample.time]); return
    }
    for ref in refs where difference(ref.sig, sample.sig, ignoreTop: settings.skipTop, delta: settings.matchDelta) <= settings.distinct * 2 {
      matching += 1; emit(["skipped": "matching", "time": sample.time, "match": ref.name]); return
    }
    let name = "\(video.prefix)-\(stamp(sample.time)).png"
    writePNG(image(sample.buffer), to: outURL.appendingPathComponent(name))
    lastEmitted = sample.sig
    emitted += 1
    emit(["frame": name, "time": sample.time, "video": video.path])
  }

  func closeStrict() {
    if let last = strictLast { candidate(last); looseHadStrict = true }
    strictLast = nil
  }
  func closeLoose() {
    closeStrict()
    if let last = looseLast, !looseHadStrict { candidate(last) }
    looseLast = nil; looseHadStrict = false
  }

  func add(_ sample: Sample) {
    samples += 1
    window.append(sample)
    // Keep the newest sample that is at least `hold` old, and everything after it.
    while window.count > 1, sample.time - window[1].time >= settings.hold - 1e-6 { window.removeFirst() }
    let covered = sample.time - window[0].time >= settings.hold - 1e-6
    let changes = window.dropLast().map { difference($0.sig, sample.sig) }
    let loose = covered && changes.allSatisfy { $0 <= settings.settle }
    let strict = loose && changes.allSatisfy { $0 <= settings.distinct }
    if loose {
      looseLast = sample
      if strict { strictLast = sample } else { closeStrict() }
    } else {
      closeLoose()
    }
  }

  // Sequential decode. Frames are sampled on a fixed clock; a frame that stays on screen with no new
  // frames (recordings drop to very few frames on a still screen) is sampled again at each tick.
  let step = 1 / settings.fps
  var tickIndex = 0, tickStart = 0.0
  var nextTick: Double { tickStart + Double(tickIndex) * step }
  var previous: (time: Double, buffer: CVPixelBuffer)? = nil
  var previousSig: Signature? = nil
  func tick(until limit: Double, inclusive: Bool) {
    guard let frame = previous else { return }
    while inclusive ? nextTick <= limit + 1e-9 : nextTick < limit - 1e-9 {
      if previousSig == nil { previousSig = signature(image(frame.buffer), width: gridWidth, height: gridHeight) }
      add(Sample(time: nextTick, sig: previousSig!, buffer: frame.buffer))
      tickIndex += 1
    }
  }
  while let buffer = output.copyNextSampleBuffer() {
    guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { continue }
    let time = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
    if previous == nil { tickStart = max(0, time) }
    tick(until: time, inclusive: false)
    previous = (time, pixels); previousSig = nil
    if duration > 0 {
      let percent = Int(time / duration * 10)
      if percent > lastProgress { lastProgress = percent; emit(["progress": min(time / duration, 1), "video": video.path]) }
    }
  }
  if reader.status == .failed { fail("Decoding stopped part-way through \(video.path) (\(reader.error?.localizedDescription ?? "unknown error")).") }
  tick(until: max(duration, previous?.time ?? 0), inclusive: true)
  closeLoose()
  emit(["video": video.path, "done": true, "duration": duration, "width": displayWidth, "height": displayHeight,
        "samples": samples, "emitted": emitted, "duplicates": duplicates, "matching": matching])
}
