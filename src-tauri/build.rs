fn main() {
    // Programın hangi commit'ten derlendiği (Ayarlar > Program'da "Sürüm 0.0.52 · a1b2c3d"): aynı sürüm
    // numarasıyla birden çok test sürümü çıktığı için hata kayıtlarında derlemeyi ayırt eder (YAY-03).
    // Önce CI'nin verdiği SHA, yoksa git; ikisi de yoksa "yerel".
    let commit = std::env::var("GITHUB_SHA")
        .ok()
        .filter(|s| s.len() >= 7)
        .map(|s| s[..7].to_owned())
        .or_else(git_short_sha)
        .unwrap_or_else(|| "yerel".to_owned());
    println!("cargo:rustc-env=LYRASKA_COMMIT={commit}");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    for path in ["../.git/HEAD", "../.git/refs/heads"] {
        println!("cargo:rerun-if-changed={path}");
    }
    tauri_build::build()
}

fn git_short_sha() -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--short=7", "HEAD"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let sha = String::from_utf8(output.stdout).ok()?.trim().to_owned();
    (!sha.is_empty()).then_some(sha)
}
