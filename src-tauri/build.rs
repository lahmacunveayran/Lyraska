fn main() {
    // Programın hangi commit'ten derlendiği (Ayarlar > Program'da "Sürüm 0.0.52 · a1b2c3d"): aynı sürüm
    // numarasıyla birden çok test sürümü çıktığı için hata kayıtlarında derlemeyi ayırt eder (YAY-03).
    // Önce CI'nin açıkça verdiği `LYRASKA_COMMIT` (derlenen commit), yoksa git; ikisi de yoksa "yerel".
    // `GITHUB_SHA` kullanılmaz: `workflow_run`'da main'in o anki ucunu, PR'da GitHub'ın geçici
    // birleştirme commit'ini gösterir; derlenen commit olmayabilir (DENETIM-FAZ0.md G13).
    let commit = std::env::var("LYRASKA_COMMIT")
        .ok()
        .and_then(|s| short_sha(&s))
        .or_else(git_short_sha)
        .unwrap_or_else(|| "yerel".to_owned());
    // Çıktı ayrı adla: girdiyle (`LYRASKA_COMMIT`, tam kimlik) karışmasın.
    println!("cargo:rustc-env=LYRASKA_BUILD_COMMIT={commit}");
    println!("cargo:rerun-if-env-changed=LYRASKA_COMMIT");
    for path in ["../.git/HEAD", "../.git/refs/heads", "../.git/packed-refs"] {
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
    short_sha(&String::from_utf8(output.stdout).ok()?)
}

/// Commit kimliğinin ilk 7 onaltılık hanesi; kimlik gibi görünmüyorsa `None`.
fn short_sha(value: &str) -> Option<String> {
    let value = value.trim();
    (value.len() >= 7 && value.bytes().all(|b| b.is_ascii_hexdigit()))
        .then(|| value[..7].to_ascii_lowercase())
}
