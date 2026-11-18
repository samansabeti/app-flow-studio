// Image side of `npm run blur-regions`. Run through scripts/blur-regions.mjs, which checks the arguments
// and passes one JSON settings object as the only argument. Uses only macOS frameworks (CoreImage, ImageIO).
//
// Each rectangle is padded, pixelated into large blocks (destroys the detail, so it cannot be read back
// or "unblurred"), then Gaussian-blurred so it reads as a soft blur rather than a mosaic. The source is
// clamped to its edges before both filters, so there is no dark halo at the rectangle's border.
// Rectangles are in image pixels, origin top-left: [x, y, width, height].
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Job: Decodable { let input: String; let output: String; let rects: [[Double]] }
struct Settings: Decodable { let jobs: [Job]; let block: Double; let sigma: Double; let pad: Double }

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

guard CommandLine.arguments.count == 2, let data = CommandLine.arguments[1].data(using: .utf8),
      let settings = try? JSONDecoder().decode(Settings.self, from: data) else { fail("Expected one JSON settings argument.") }

let context = CIContext(options: [.useSoftwareRenderer: false])
for job in settings.jobs {
  let url = URL(fileURLWithPath: job.input)
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let cg = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("Could not read \(job.input)") }
  let original = CIImage(cgImage: cg)
  let bounds = original.extent
  var result = original
  for raw in job.rects {
    guard raw.count == 4, raw[2] > 0, raw[3] > 0 else { fail("Bad rectangle \(raw) for \(job.input)") }
    // Pixels from the top-left -> CoreImage's bottom-left origin, padded and kept inside the image.
    let rect = CGRect(x: raw[0] - settings.pad, y: bounds.height - raw[1] - raw[3] - settings.pad,
                      width: raw[2] + settings.pad * 2, height: raw[3] + settings.pad * 2).intersection(bounds).integral
    if rect.isEmpty { continue }
    // Work on the region alone, clamped to its own edges, so neither filter pulls in surrounding pixels or black.
    let region = original.cropped(to: rect).clampedToExtent()
    let pixelated = region.applyingFilter("CIPixellate", parameters: [
      kCIInputScaleKey: settings.block,
      kCIInputCenterKey: CIVector(x: rect.minX, y: rect.minY),
    ]).clampedToExtent()
    let blurred = pixelated.applyingGaussianBlur(sigma: settings.sigma).cropped(to: rect)
    result = blurred.composited(over: result)
  }
  guard let out = context.createCGImage(result, from: bounds, format: .RGBA8, colorSpace: cg.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)!) else { fail("Could not render \(job.input)") }
  let outURL = URL(fileURLWithPath: job.output)
  guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("Could not write \(job.output)") }
  CGImageDestinationAddImage(dest, out, nil)
  guard CGImageDestinationFinalize(dest) else { fail("Could not write \(job.output)") }
  let line = try! JSONSerialization.data(withJSONObject: ["written": job.output, "regions": job.rects.count])
  print(String(data: line, encoding: .utf8)!)
}
