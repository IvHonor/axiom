//! Load separate native icon sizes so Windows never enlarges the title-bar image for the taskbar.

use std::{ffi::c_void, io, ptr};

#[link(name = "user32")]
unsafe extern "system" {
    fn GetDpiForWindow(window: *mut c_void) -> u32;
    fn GetSystemMetricsForDpi(index: i32, dpi: u32) -> i32;
    fn LoadImageW(instance: *mut c_void, name: *const u16, kind: u32, width: i32, height: i32, flags: u32) -> *mut c_void;
    fn SendMessageW(window: *mut c_void, message: u32, wparam: usize, lparam: isize) -> isize;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetModuleHandleW(name: *const u16) -> *mut c_void;
}

pub fn apply(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let hwnd = window.hwnd()?.0;
    // SAFETY: the HWND belongs to this live Tauri window. LoadImageW reads the app's
    // embedded icon resource; LR_SHARED keeps its handles valid until process exit.
    unsafe {
        let module = GetModuleHandleW(ptr::null());
        let dpi = GetDpiForWindow(hwnd);
        if module.is_null() || dpi == 0 {
            return Err(io::Error::last_os_error().into());
        }
        let resource = tauri::utils::platform::WINDOWS_APP_ICON_RESOURCE_ID as usize as *const u16;
        // ICON_SMALL uses SM_CXSMICON / SM_CYSMICON; ICON_BIG uses SM_CXICON / SM_CYICON.
        for (kind, x_metric, y_metric) in [(0, 49, 50), (1, 11, 12)] {
            let width = GetSystemMetricsForDpi(x_metric, dpi);
            let height = GetSystemMetricsForDpi(y_metric, dpi);
            if width <= 0 || height <= 0 {
                return Err(io::Error::other("Windows returned an invalid icon size").into());
            }
            let icon = LoadImageW(module, resource, 1 /* IMAGE_ICON */, width, height, 0x8000 /* LR_SHARED */);
            if icon.is_null() {
                return Err(io::Error::last_os_error().into());
            }
            SendMessageW(hwnd, 0x80 /* WM_SETICON */, kind, icon as isize);
        }
    }
    Ok(())
}
