use std::io::Write;
#[inline(never)]
fn deep(n: u32) -> u32 { if n == 0 { let v: Vec<u32> = Vec::new(); v[n as usize + std::env::args().count()] } else { deep(n - 1) + 1 } }
fn main() {
    std::panic::set_hook(Box::new(|info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let mut f = std::fs::OpenOptions::new().create(true).append(true).open("crash.log").unwrap();
        let _ = write!(f, "ÇÖKME {info}\n--- Display {{}} ---\n{bt}\n--- Alternate {{:#}} ---\n{bt:#}\n");
    }));
    println!("{}", deep(3));
}
