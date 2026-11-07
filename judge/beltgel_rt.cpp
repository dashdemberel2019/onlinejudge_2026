// beltgel_rt: шалгагч бүх программд libc++-ийн дараа холбодог жижиг runtime.
//
// Шалтгаан: энэ sysroot-ийн libc++ 8 нь оновчлолгүй (-O0) хөрвүүлэгдсэн тул cin/cout нь
// scanf/printf-ээс 10-20 дахин удаан. Энд:
//   1) cin/cout-ийг stdio-тай шууд холбосон streambuf-аар солино (scanf/printf-тэй холиход
//      дараалал хадгалагдана, endl нь хост руу тухай бүр flush хийхгүй);
//   2) бүхэл тоо унших/бичих num_get/num_put facet-ийг -O2 хурдан хувилбараар солино
//      (аравтын тоолол, нэмэлт флаггүй үед; бусад үед стандарт хэрэгжүүлэлт рүү шилжинэ).
#include <cstdio>
#include <climits>
#include <istream>
#include <ostream>
#include <iostream>
#include <streambuf>
#include <locale>

namespace __beltgel {

struct InBuf : std::streambuf {
  int_type underflow() override {
    int c = getc_unlocked(stdin);
    if (c == EOF) return traits_type::eof();
    ungetc(c, stdin);
    return traits_type::to_int_type((char)c);
  }
  int_type uflow() override {
    int c = getc_unlocked(stdin);
    return c == EOF ? traits_type::eof() : traits_type::to_int_type((char)c);
  }
  int_type pbackfail(int_type c) override {
    if (traits_type::eq_int_type(c, traits_type::eof())) return traits_type::eof();
    return ungetc(traits_type::to_char_type(c), stdin) == EOF ? traits_type::eof() : c;
  }
  std::streamsize xsgetn(char* s, std::streamsize n) override {
    return (std::streamsize)fread(s, 1, (size_t)n, stdin);
  }
};

struct OutBuf : std::streambuf {
  FILE* f;
  explicit OutBuf(FILE* f_) : f(f_) {}
  int_type overflow(int_type c) override {
    if (traits_type::eq_int_type(c, traits_type::eof())) return traits_type::not_eof(c);
    return putc_unlocked(traits_type::to_char_type(c), f) == EOF ? traits_type::eof() : c;
  }
  std::streamsize xsputn(const char* s, std::streamsize n) override {
    return (std::streamsize)fwrite(s, 1, (size_t)n, f);
  }
  int sync() override { return 0; }
};

// ---- хурдан бүхэл тоо унших ----
struct FastNumGet : std::num_get<char> {
  using iter = std::istreambuf_iterator<char>;
  using Base = std::num_get<char>;
  explicit FastNumGet(size_t refs = 0) : Base(refs) {}

  // Стандарт (libc++-ийн) facet: тусгай флагтай үед түүн рүү шилжинэ.
  static const std::num_get<char>& stdget() {
    static const std::num_get<char>& f = std::use_facet<std::num_get<char>>(std::locale::classic());
    return f;
  }
  static bool plain(std::ios_base& io) {
    return (io.flags() & std::ios_base::basefield) == std::ios_base::dec;
  }

  // Тэмдэгтэй/тэмдэггүй бүхэл тоо. Хэтэрвэл failbit + max/min (стандартын дагуу).
  template <class T, bool Signed>
  iter parse(iter in, iter end, std::ios_base::iostate& err, T& v) const {
    bool neg = false;
    if (in == end) { err = std::ios_base::failbit | std::ios_base::eofbit; v = 0; return in; }
    char c = *in;
    if (c == '-' || c == '+') { neg = (c == '-'); ++in; }
    unsigned long long acc = 0;
    bool any = false, over = false;
    const unsigned long long lim = Signed
        ? (neg ? (unsigned long long)std::numeric_limits<T>::max() + 1ULL
               : (unsigned long long)std::numeric_limits<T>::max())
        : (unsigned long long)std::numeric_limits<T>::max();
    while (in != end) {
      c = *in;
      if (c < '0' || c > '9') break;
      unsigned d = (unsigned)(c - '0');
      if (!over) {
        if (acc > (lim - d) / 10) over = true;
        else acc = acc * 10 + d;
      }
      any = true;
      ++in;
    }
    err = std::ios_base::goodbit;
    if (in == end) err |= std::ios_base::eofbit;
    if (!any) { err |= std::ios_base::failbit; v = 0; return in; }
    if (over) {
      err |= std::ios_base::failbit;
      if (Signed) v = neg ? std::numeric_limits<T>::min() : std::numeric_limits<T>::max();
      else v = std::numeric_limits<T>::max();
      return in;
    }
    if (Signed) v = neg ? (T)(0ULL - acc) : (T)acc;
    else v = neg ? (T)(0ULL - acc) : (T)acc;   // стандарт: "-1" -> max-ийн хувирал
    return in;
  }

 protected:
  iter do_get(iter in, iter end, std::ios_base& io, std::ios_base::iostate& err, long& v) const override {
    return plain(io) ? parse<long, true>(in, end, err, v) : stdget().get(in, end, io, err, v);
  }
  iter do_get(iter in, iter end, std::ios_base& io, std::ios_base::iostate& err, long long& v) const override {
    return plain(io) ? parse<long long, true>(in, end, err, v) : stdget().get(in, end, io, err, v);
  }
  iter do_get(iter in, iter end, std::ios_base& io, std::ios_base::iostate& err, unsigned short& v) const override {
    return plain(io) ? parse<unsigned short, false>(in, end, err, v) : stdget().get(in, end, io, err, v);
  }
  iter do_get(iter in, iter end, std::ios_base& io, std::ios_base::iostate& err, unsigned int& v) const override {
    return plain(io) ? parse<unsigned int, false>(in, end, err, v) : stdget().get(in, end, io, err, v);
  }
  iter do_get(iter in, iter end, std::ios_base& io, std::ios_base::iostate& err, unsigned long& v) const override {
    return plain(io) ? parse<unsigned long, false>(in, end, err, v) : stdget().get(in, end, io, err, v);
  }
  iter do_get(iter in, iter end, std::ios_base& io, std::ios_base::iostate& err, unsigned long long& v) const override {
    return plain(io) ? parse<unsigned long long, false>(in, end, err, v) : stdget().get(in, end, io, err, v);
  }
};

// ---- хурдан бүхэл тоо бичих ----
struct FastNumPut : std::num_put<char> {
  using iter = std::ostreambuf_iterator<char>;
  using Base = std::num_put<char>;
  explicit FastNumPut(size_t refs = 0) : Base(refs) {}

  static const std::num_put<char>& stdput() {
    static const std::num_put<char>& f = std::use_facet<std::num_put<char>>(std::locale::classic());
    return f;
  }
  static bool plain(std::ios_base& io) {
    const auto f = io.flags();
    return io.width() == 0 && (f & std::ios_base::basefield) == std::ios_base::dec &&
           !(f & std::ios_base::showpos);
  }
  static iter emit(iter out, unsigned long long u, bool neg) {
    char buf[24];
    char* p = buf + sizeof buf;
    do { *--p = (char)('0' + u % 10); u /= 10; } while (u);
    if (neg) *--p = '-';
    for (; p != buf + sizeof buf; ++p) *out++ = *p;
    return out;
  }

 protected:
  iter do_put(iter out, std::ios_base& io, char fill, long v) const override {
    if (!plain(io)) return stdput().put(out, io, fill, v);
    return emit(out, v < 0 ? 0ULL - (unsigned long long)v : (unsigned long long)v, v < 0);
  }
  iter do_put(iter out, std::ios_base& io, char fill, long long v) const override {
    if (!plain(io)) return stdput().put(out, io, fill, v);
    return emit(out, v < 0 ? 0ULL - (unsigned long long)v : (unsigned long long)v, v < 0);
  }
  iter do_put(iter out, std::ios_base& io, char fill, unsigned long v) const override {
    if (!plain(io)) return stdput().put(out, io, fill, v);
    return emit(out, v, false);
  }
  iter do_put(iter out, std::ios_base& io, char fill, unsigned long long v) const override {
    if (!plain(io)) return stdput().put(out, io, fill, v);
    return emit(out, v, false);
  }
};

struct Installer {
  std::ios_base::Init init;   // cin/cout бэлэн болсныг баталгаажуулна
  InBuf in;
  OutBuf out{stdout};
  Installer() {
    std::cin.rdbuf(&in);
    std::cout.rdbuf(&out);
    std::locale loc(std::locale(std::locale(), new FastNumGet), new FastNumPut);
    std::cin.imbue(loc);
    std::cout.imbue(loc);
  }
};
// Хэзээ ч устгахгүй: программ дуусах үед cout flush хийгдэхэд buf амьд байх ёстой.
Installer& __installer = *new Installer;

}  // namespace __beltgel
