fn main() {
    // Arka plan iş parçacığı (ör. analiz) bozuk veride dilim dışına taşar.
    let h = std::thread::Builder::new().name("lyraska-analiz".into()).spawn(|| {
        let v: Vec<f64> = Vec::new();
        let i = std::env::args().count() + 5;
        v[i]
    }).unwrap();
    let _ = h.join();
    println!("ana iş parçacığı yaşıyor (unwind olsaydı buraya gelinirdi)");
}
