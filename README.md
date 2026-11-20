# Optisyen

Taranmış çoktan seçmeli sınavları tarayıcıda okuyup soru bazında puanlayan bir araç. Kendi formunuzdaki baloncukların yerini cevap anahtarı üzerinde tanımlarsınız.

**[Optisyen’i aç](https://tunabirgun.github.io/optisyen/)** · [Tuna Birgün](https://github.com/tunabirgun)

## Dosya yüklemeden deneyin

**Tek gruplu** seçiliyken **Örnekle dene** düğmesine tıklayın. Optisyen tarayıcınızda 25 soruluk bir cevap anahtarı ve iki kurgusal öğrenci formu oluşturur. **Anahtarı oku** ve ardından **Anahtarı onayla ve formları oku** düğmelerine basın.

Örnekte ikinci formun birinci sorusu boş, ikinci sorusu çift işaretlidir. Kontrol listesinden ikinci soruyu açıp **B** seçtiğinizde puanlar **100 ve 96**, sınav ortalaması **98** olur. **A/B gruplu** seçeneği iki ayrı anahtarla denenebilir.

## Kendi sınavınız

1. **Sınavı ayarlayın.** Soru ve şık sayısını seçin. Eşit ağırlıkta toplam puanı verin veya soru başına ayrı puan girin.
2. **PDF’leri seçin.** Tek grupta bir sayfalık cevap anahtarı kullanın. A/B düzeninde A ve B kitapçıklarının tek sayfalık cevap anahtarlarını kendi alanlarına ayrı PDF dosyaları olarak yükleyin. Öğrenci kâğıtlarını, her sayfada bir form olacak şekilde ayrı bir PDF’te birleştirin. Öğrenci sayfaları aynı form düzeninde, aynı yönde ve benzer ölçekte taranmış olmalı.
3. **Baloncukları tanımlayın.** İlk cevap bloğundaki soru sayısını girip **Soru bloğu ekle** seçeneğini kullanın. İlk sorunun ilk ve son şıkkını, sonra son sorunun ilk şıkkını tıklayın. Diğer blokları soru sırasıyla ekleyin. Önizlemede halkaların baloncukları ortaladığını kontrol edin.
4. **Varsa kimlik alanlarını ekleyin.** Numara için her sütunda 0–9 sırası kullanılır. Ad-soyad için sütun sayısını ve formda basılı harflerin yukarıdan aşağı sırasını girin. A/B baloncukları için önce A’ya, sonra B’ye tıklayın. Numara alanı tanımlamazsanız sonuçlar PDF sayfa sırasına göre **Form No** ile gösterilir. Ad-soyad okuması kodlanmış baloncuklar içindir; el yazısı OCR’ı içermez.
5. **Okumayı bitirin.** Anahtarı kontrol edip onaylayın. Belirsiz işaret, eksik kimlik, yinelenen numara veya eşleşmeyen kitapçık listeye düşer. Bir satıra tıklayarak ilgili taramadan düzeltin. Sorunsuz sayfalar ayrıca onay istemez. Boş cevap sıfır puandır.
6. **Excel’i indirin.** **Soru Puanları** sayfasında her sorudan alınan puan, toplam ve ortalamalar bulunur. **Cevaplar** sayfasında anahtarlar ve öğrenci işaretleri vardır. Excel’de soru puanları düzenlendiğinde toplam ve ortalama formülleri yeniden hesaplanır.

Düzenli aralıklı, dikdörtgen baloncuk ızgaraları kullanın. Her cevap bloğunda sorular yukarıdan aşağı, şıklar soldan sağa ilerler. Belirgin dönme, perspektif bozulması veya sayfanın kırpılması okumayı güçleştirir. Böyle bir sayfayı düz tarayın ve halkaların yerini kontrol edin.

## Veriler nerede tutulur?

PDF’ler, adlar, numaralar ve puanlar sekmenin belleğinde işlenir. Sunucuya gönderilmez. Sayfayı yenilemeden önce sonuç dosyanızı indirin. **Düzeni bu tarayıcıda sakla** seçeneği yalnızca alan koordinatlarını ve tanımlarını cihazda tutar. Aynı sınav düzeni, soru ve şık sayısıyla yeni bir form açtığınızda **Kaydedilmiş düzeni kullan** ile geri çağırabilirsiniz.

Paylaşılan örnek uygulama tarafından üretilir. Kaynak depoya öğrenci evrakı, cevap anahtarı, sonuç dosyası veya üçüncü taraf form şablonu eklemeyin.

## Yerelde çalıştırma

Node.js 24 ve npm ile:

```sh
npm ci
npm run dev
```

Terminaldeki yerel adresi açın. Yayın derlemesini kontrol etmek için:

```sh
npm run build
npm run preview
```

Arayüz Vite ile derlenir. PDF.js taramaları görüntüler, pdf-lib kurgusal deneme PDF’lerini üretir, ExcelJS çalışma kitabını oluşturur. Bu bileşenler sayfayla aynı kaynaktan sunulur. GitHub Pages iş akışı yalnızca derlenmiş siteyi yayımlar.
