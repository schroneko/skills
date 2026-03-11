#!/usr/bin/env swift

import Foundation
import Quartz
import Vision

func printUsage() {
    fputs("""
    Usage: ocr <pdf-file-path> [page-range]

    Page range examples:
      ocr file.pdf           All pages
      ocr file.pdf 1-10      Pages 1 to 10
      ocr file.pdf 5         Page 5 only
      ocr file.pdf 10-       Page 10 to end
      ocr file.pdf -5        Pages 1 to 5

    """, stderr)
}

func parsePageRange(_ rangeStr: String, maxPages: Int) -> [Int]? {
    if rangeStr.contains("-") {
        let parts = rangeStr.split(separator: "-", omittingEmptySubsequences: false)
        if parts.count == 2 {
            let start = parts[0].isEmpty ? 1 : Int(parts[0]) ?? 1
            let end = parts[1].isEmpty ? maxPages : Int(parts[1]) ?? maxPages
            if start > 0 && end >= start && end <= maxPages {
                return Array(start...end)
            }
        }
    } else if let page = Int(rangeStr), page > 0 && page <= maxPages {
        return [page]
    }
    return nil
}

func processPage(_ pdfDocument: CGPDFDocument, pageNumber: Int) -> String? {
    autoreleasepool {
        guard let page = pdfDocument.page(at: pageNumber) else { return nil }

        let pageRect = page.getBoxRect(.mediaBox)
        let scale: CGFloat = 2.0
        let width = Int(pageRect.width * scale)
        let height = Int(pageRect.height * scale)

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }

        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.scaleBy(x: scale, y: scale)
        context.drawPDFPage(page)

        guard let cgImage = context.makeImage() else { return nil }

        let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["ja", "en"]
        request.usesLanguageCorrection = true

        do {
            try requestHandler.perform([request])
            guard let observations = request.results else { return nil }
            return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        } catch {
            return nil
        }
    }
}

guard CommandLine.arguments.count > 1 else {
    printUsage()
    exit(1)
}

let pdfPath = CommandLine.arguments[1]
let pdfURL = URL(fileURLWithPath: pdfPath) as CFURL

guard let pdfDocument = CGPDFDocument(pdfURL) else {
    fputs("Error: Failed to open PDF: \(pdfPath)\n", stderr)
    exit(1)
}

let totalPages = pdfDocument.numberOfPages

var pagesToProcess: [Int]
if CommandLine.arguments.count > 2 {
    guard let pages = parsePageRange(CommandLine.arguments[2], maxPages: totalPages) else {
        fputs("Error: Invalid page range. Total pages: \(totalPages)\n", stderr)
        printUsage()
        exit(1)
    }
    pagesToProcess = pages
} else {
    pagesToProcess = Array(1...totalPages)
}

fputs("Processing \(pagesToProcess.count) pages (total: \(totalPages))...\n", stderr)

let ocrStartTime = CFAbsoluteTimeGetCurrent()

let results = UnsafeMutablePointer<String?>.allocate(capacity: pagesToProcess.count)
results.initialize(repeating: nil, count: pagesToProcess.count)
defer { results.deallocate() }

let progressLock = NSLock()
var processedCount = 0

DispatchQueue.concurrentPerform(iterations: pagesToProcess.count) { index in
    let pageNumber = pagesToProcess[index]
    results[index] = processPage(pdfDocument, pageNumber: pageNumber)

    progressLock.lock()
    processedCount += 1
    fputs("\rProgress: \(processedCount)/\(pagesToProcess.count)", stderr)
    progressLock.unlock()
}

let ocrEndTime = CFAbsoluteTimeGetCurrent()
let ocrElapsed = ocrEndTime - ocrStartTime
fputs(String(format: "\n[TIMING] OCR processing: %.3fs\n", ocrElapsed), stderr)

for i in 0..<pagesToProcess.count {
    if let text = results[i], !text.isEmpty {
        print(text)
        print("")
    }
}
