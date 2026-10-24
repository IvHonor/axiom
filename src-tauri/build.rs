fn main() {
    // Windows embeds this icon in the executable; Cargo must rerun the resource build when it changes.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    // Build settings (AXIOM_SERVER_URL, the calendar client ids) can live in
    // src-tauri/.env, which git ignores. A variable set in the shell wins.
    println!("cargo:rerun-if-changed=.env");
    if let Ok(text) = std::fs::read_to_string(".env") {
        for line in text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
            let Some((key, value)) = line.split_once('=') else { continue };
            let (key, value) = (key.trim(), value.trim().trim_matches('"'));
            println!("cargo:rerun-if-env-changed={key}");
            if key.starts_with("AXIOM_") && std::env::var_os(key).is_none() {
                println!("cargo:rustc-env={key}={value}");
            }
        }
    }
    tauri_build::build()
}
