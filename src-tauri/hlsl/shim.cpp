// Lyraska: projectM hlslparser'ının WebAssembly köprüsü.
//
// Rust tarafı (`src/milkdrop/shader.rs`) bu modülü `wasmi` ile kum havuzunda çalıştırır: her
// çeviri yeni bir örnekte (temiz bellek) yapılır. Dışa verilenler:
//   lyraska_alloc(n)              → n baytlık giriş alanı (Rust HLSL metnini buraya yazar)
//   lyraska_convert(src, n)       → 0 başarılı; 1 önişlemci, 2 ayrıştırma, 3 GLSL üretimi hatası
//   lyraska_output()/_output_len  → başarıda GLSL ES 3.00 metni, hatada ilk hata iletisi
// Giriş noktası adı sabittir: `lyraska_main` (Rust, MilkDrop'un `shader_body`'sini bu ada sarar).

#include <cstdint>
#include <cstdlib>
#include <string>

#include "GLSLGenerator.h"
#include "HLSLParser.h"

namespace M4 {
// Engine.cpp'deki Lyraska yaması: ayrıştırıcının ilk hata iletisi.
extern std::string Log_FirstError;
}  // namespace M4

namespace {
std::string g_output;

int fail(int status, const char* fallback) {
    g_output = M4::Log_FirstError.empty() ? std::string(fallback) : M4::Log_FirstError;
    return status;
}
}  // namespace

extern "C" {

// Bellek yetmeyince ayrıştırıcı `std::bad_alloc` atar (Engine.h). WebAssembly'de istisna desteği
// yok: atma yerine tuzak (trap); Rust çeviriyi "bellek yetmedi" hatasıyla bırakır.
void* __cxa_allocate_exception(size_t) { __builtin_trap(); }
void __cxa_throw(void*, void*, void (*)(void*)) { __builtin_trap(); }

__attribute__((export_name("lyraska_alloc"))) void* lyraska_alloc(uint32_t size) {
    return malloc(size == 0 ? 1 : size);
}

__attribute__((export_name("lyraska_convert"))) int lyraska_convert(const char* source,
                                                                    uint32_t length) {
    M4::Log_FirstError.clear();
    g_output.clear();

    M4::Allocator allocator;
    M4::HLSLTree tree(&allocator);
    M4::HLSLParser parser(&allocator, &tree);

    std::string preprocessed;
    if (!parser.ApplyPreprocessor("", source, length, preprocessed)) {
        return fail(1, "preprocessing failed");
    }
    if (!parser.Parse("", preprocessed.c_str(), preprocessed.size())) {
        return fail(2, "parsing failed");
    }
    M4::GLSLGenerator generator;
    if (!generator.Generate(&tree, M4::GLSLGenerator::Target_FragmentShader,
                            M4::GLSLGenerator::Version_300_ES, "lyraska_main",
                            M4::GLSLGenerator::Options(
                                M4::GLSLGenerator::Flag_AlternateNanPropagation))) {
        return fail(3, "GLSL generation failed");
    }
    g_output = generator.GetResult();
    return 0;
}

__attribute__((export_name("lyraska_output"))) const char* lyraska_output() {
    return g_output.data();
}

__attribute__((export_name("lyraska_output_len"))) uint32_t lyraska_output_len() {
    return static_cast<uint32_t>(g_output.size());
}
}
