// Run on macOS: swift tests/desk-glass-resize.swift
import AppKit

final class FlippedView: NSView {
    override var isFlipped: Bool { true }
}

// Exercise AppKit's actual autoresizing, including a window resize that arrives
// after the glass frame. Pure geometry/browser mocks cannot catch this drift.
for flipped in [false, true] {
    let parent = flipped ? FlippedView() : NSView()
    parent.setFrameSize(NSSize(width: 180, height: 220))
    let top: CGFloat = 12
    let height: CGFloat = 100
    let region = NSView(frame: NSRect(x: 0, y: flipped ? top : 220 - top - height, width: 64, height: height))
    parent.addSubview(region)
    let topInset = { flipped ? region.frame.minY : parent.bounds.height - region.frame.maxY }
    // Confirm the old default reproduces the reported offset.
    parent.setFrameSize(NSSize(width: 180, height: 248))
    if !flipped { precondition(abs(topInset() - top) == 28) }
    parent.setFrameSize(NSSize(width: 180, height: 220))
    region.autoresizingMask = flipped ? .maxYMargin : .minYMargin
    for resizedHeight: CGFloat in [248, 120, 350, 220] {
        parent.setFrameSize(NSSize(width: 180, height: resizedHeight))
        precondition(abs(topInset() - top) < 0.01, "Glass drifted from the web panel")
        precondition(region.frame.size == NSSize(width: 64, height: height))
    }
}
print("PASS: native glass remains top-aligned through growth and shrinkage in both coordinate systems")
