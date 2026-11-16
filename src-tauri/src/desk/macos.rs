use objc2::MainThreadMarker;
use objc2_app_kit::{NSAutoresizingMaskOptions, NSView, NSWindow, NSWindowCollectionBehavior as Behavior, NSWindowOrderingMode, NSUserInterfaceItemIdentification};
use objc2_foundation::{ns_string, NSOperatingSystemVersion, NSPoint, NSProcessInfo, NSRect, NSSize};
use raw_window_handle::{AppKitWindowHandle, HandleError, HasWindowHandle, RawWindowHandle, WindowHandle};
use std::{ffi::c_void, ptr::NonNull};
use tauri::WebviewWindow;
use window_vibrancy::{apply_liquid_glass, apply_vibrancy, LiquidGlassOptions, NSVisualEffectMaterial, NSVisualEffectState};
use objc2_core_graphics::CGMutablePath;
use objc2_quartz_core::CAShapeLayer;

use crate::error::{Error, Result};

fn outline_path(path: &CGMutablePath, outline: &super::GlassOutline, height: f64) {
    // SAFETY: null means no transform; all curve points were validated.
    unsafe {
        CGMutablePath::move_to_point(Some(path), std::ptr::null(), outline.start[0], height - outline.start[1]);
        for c in &outline.curves {
            CGMutablePath::add_curve_to_point(Some(path), std::ptr::null(), c[0], height - c[1], c[2], height - c[3], c[4], height - c[5]);
        }
    }
    CGMutablePath::close_subpath(Some(path));
}

fn collection_behavior(mut behavior: Behavior, all_applications: bool) -> Behavior {
    behavior.remove(Behavior::MoveToActiveSpace | Behavior::FullScreenPrimary | Behavior::FullScreenNone
        | Behavior::Managed | Behavior::Transient | Behavior::ParticipatesInCycle);
    behavior.insert(Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary | Behavior::Stationary | Behavior::IgnoresCycle);
    if all_applications {
        behavior.remove(Behavior::Primary | Behavior::Auxiliary);
        behavior.insert(Behavior::CanJoinAllApplications);
    }
    behavior
}

fn top_left(point: NSPoint, bounds: NSRect, flipped: bool) -> (f64, f64) {
    let x = point.x - bounds.origin.x;
    let y = point.y - bounds.origin.y;
    (x, if flipped { y } else { bounds.size.height - y })
}

/// Join full-screen Spaces as a companion, and stay visible when another app
/// becomes active. Normal workspace visibility alone does not cover those Spaces.
pub(super) fn configure(window: &WebviewWindow) -> Result<()> {
    let native = window.clone();
    window.run_on_main_thread(move || {
        let Ok(pointer) = native.ns_window() else { return };
        // SAFETY: Tauri owns this NSWindow and this closure runs on AppKit's thread.
        let window = unsafe { &*pointer.cast::<NSWindow>() };
        let all_applications = NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion { majorVersion: 13, minorVersion: 0, patchVersion: 0 });
        let behavior = collection_behavior(window.collectionBehavior(), all_applications);
        window.setCollectionBehavior(behavior);
        window.setHidesOnDeactivate(false);
    }).map_err(|err| Error::Invalid(err.to_string()))
}

pub(super) fn pointer(window: &WebviewWindow) -> Result<(f64, f64)> {
    let _main = MainThreadMarker::new().ok_or_else(|| Error::Invalid("The desktop pointer must be read on the main thread.".into()))?;
    let native_window = window.ns_window().map_err(|err| Error::Invalid(err.to_string()))?;
    let native_view = window.ns_view().map_err(|err| Error::Invalid(err.to_string()))?;
    // SAFETY: both handles belong to this live Tauri window, on AppKit's thread.
    let (window, view) = unsafe { (&*native_window.cast::<NSWindow>(), &*native_view.cast::<NSView>()) };
    let point = view.convertPoint_fromView(window.mouseLocationOutsideOfEventStream(), None);
    Ok(top_left(point, view.bounds(), view.isFlipped()))
}

struct Region(NonNull<c_void>);
impl HasWindowHandle for Region {
    fn window_handle(&self) -> std::result::Result<WindowHandle<'_>, HandleError> {
        // SAFETY: the native region is retained by its parent throughout this call.
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::AppKit(AppKitWindowHandle::new(self.0))) })
    }
}

pub(super) fn glass(window: &WebviewWindow, panels: Vec<super::GlassPanel>) -> Result<()> {
    let main = MainThreadMarker::new().ok_or_else(|| Error::Invalid("Desktop glass must be updated on the main thread.".into()))?;
    let pointer = window.ns_view().map_err(|err| Error::Invalid(err.to_string()))?;
    // SAFETY: Tauri retains this window's content view; this runs on AppKit's thread.
    let parent = unsafe { &*pointer.cast::<NSView>() };
    for child in parent.subviews() {
        if child.identifier().is_some_and(|id| &*id == ns_string!("axiom.desktop.glass")) {
            child.removeFromSuperview();
        }
    }
    for panel in panels {
        let y = if parent.isFlipped() { panel.y } else { parent.bounds().size.height - panel.y - panel.height };
        let region = NSView::initWithFrame(main.alloc(), NSRect::new(NSPoint::new(panel.x, y), NSSize::new(panel.width, panel.height)));
        // CSS panels are top-anchored. The native window can resize after this
        // frame is installed, so its flexible margin must be below the panel.
        region.setAutoresizingMask(if parent.isFlipped() {
            NSAutoresizingMaskOptions::ViewMaxYMargin
        } else {
            NSAutoresizingMaskOptions::ViewMinYMargin
        });
        region.setIdentifier(Some(ns_string!("axiom.desktop.glass")));
        parent.addSubview_positioned_relativeTo(&region, NSWindowOrderingMode::Below, None);
        let handle = Region(NonNull::from(&*region).cast());
        match apply_liquid_glass(&handle, LiquidGlassOptions::default().radius(panel.radius)) {
            Ok(()) => {}
            Err(window_vibrancy::Error::UnsupportedPlatformVersion(_)) => {
                apply_vibrancy(&handle, NSVisualEffectMaterial::Popover, Some(NSVisualEffectState::Active), Some(panel.radius))
                    .map_err(|err| Error::Invalid(err.to_string()))?;
            }
            Err(err) => return Err(Error::Invalid(err.to_string())),
        }
        // Clip the host as well as the material: otherwise native glass and its
        // highlights can paint rectangular corners outside the web panel.
        region.setWantsLayer(true);
        if let Some(layer) = region.layer() {
            let scale = window.scale_factor().unwrap_or(1.0);
            layer.setContentsScale(scale);
            layer.setAllowsEdgeAntialiasing(true);
            layer.setMasksToBounds(true);
            layer.setCornerRadius(panel.radius);
            if let Some(outline) = panel.outline {
                let path = CGMutablePath::new();
                outline_path(&path, &outline, panel.height);
                let mask = CAShapeLayer::new();
                mask.setFrame(region.bounds());
                mask.setContentsScale(scale);
                mask.setAllowsEdgeAntialiasing(true);
                mask.setPath(Some(&path));
                // SAFETY: the new mask has no superlayer and is retained by its host.
                unsafe { layer.setMask(Some(&mask)); }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn companion_joins_spaces_without_conflicting_collection_flags() {
        let before = Behavior::MoveToActiveSpace | Behavior::FullScreenPrimary | Behavior::Managed
            | Behavior::ParticipatesInCycle | Behavior::Primary | Behavior::FullScreenDisallowsTiling;
        let after = collection_behavior(before, true);
        assert!(after.contains(Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary | Behavior::CanJoinAllApplications));
        assert!(after.contains(Behavior::Stationary | Behavior::IgnoresCycle | Behavior::FullScreenDisallowsTiling));
        assert!(!after.intersects(Behavior::MoveToActiveSpace | Behavior::FullScreenPrimary | Behavior::FullScreenNone
            | Behavior::Managed | Behavior::Transient | Behavior::ParticipatesInCycle | Behavior::Primary | Behavior::Auxiliary));
        assert!(!collection_behavior(Behavior::Default, false).contains(Behavior::CanJoinAllApplications));
    }

    #[test]
    fn appkit_pointer_becomes_top_left_logical_coordinates() {
        let bounds = NSRect::new(NSPoint::new(10.0, 20.0), NSSize::new(200.0, 300.0));
        assert_eq!(top_left(NSPoint::new(110.0, 320.0), bounds, false), (100.0, 0.0));
        assert_eq!(top_left(NSPoint::new(110.0, 20.0), bounds, false), (100.0, 300.0));
        assert_eq!(top_left(NSPoint::new(-40.0, 370.0), bounds, false), (-50.0, -50.0));
        assert_eq!(top_left(NSPoint::new(260.0, -30.0), bounds, false), (250.0, 350.0));
        assert_eq!(top_left(NSPoint::new(110.0, 50.0), bounds, true), (100.0, 30.0));
    }

    #[test]
    fn glass_mask_uses_the_web_outline_and_flips_its_vertical_axis() {
        use objc2_core_graphics::CGPath;
        let outline = super::super::GlassOutline {
            start: [0.0, 0.0],
            curves: vec![[20.0, 0.0, 20.0, 0.0, 20.0, 0.0], [0.0, 30.0, 0.0, 30.0, 0.0, 30.0]],
        };
        let path = CGMutablePath::new();
        outline_path(&path, &outline, 100.0);
        // SAFETY: null means no transform, and these points are ordinary values.
        unsafe {
            assert!(CGPath::contains_point(Some(&path), std::ptr::null(), NSPoint::new(2.0, 95.0), false));
            assert!(!CGPath::contains_point(Some(&path), std::ptr::null(), NSPoint::new(2.0, 5.0), false));
            assert!(!CGPath::contains_point(Some(&path), std::ptr::null(), NSPoint::new(19.0, 75.0), false));
        }
    }
}
