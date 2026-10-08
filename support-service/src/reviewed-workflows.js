// Original, reviewed Hamvara guide answers. No generated stock, prices or codes.
// Keep the complete beginner procedure stable; use the model for other questions.
const SKU_IMPORT = {
 en: `Reviewed SKU Bridge guide — import, check and export:
1. Keep a copy of the original file. Start with a few rows; preserve SKU and barcode as text so leading zeros are not lost.
2. Open SKU Bridge and select Choose Excel or CSV. Select your file, then check its name and loaded row count.
3. In Confirm column mapping, connect SKU / Product code to your SKU column. Map the other available fields; leave missing optional fields as Not in file. Check Currency: this beta uses USD when currency is empty.
4. Select Analyze data. Analyze & Map with AI is optional and is not needed for this manual process.
5. In Data quality report, read each row's STATUS: MISSING_SKU = missing code; MISSING_PRICE = missing unit price; DUPLICATE_SKU = repeated code; PRICE_CONFLICT = different prices for one code; INVALID_BARCODE = barcode not accepted. The quality score is not a guarantee of correctness.
6. Correct values using your actual records, never guesses. Select Recheck corrections. Leave duplicate or uncertain rows out until their business meaning is resolved; the tool does not automatically merge them.
7. Check USE only for reviewed rows. Editing clears a row's approval, so recheck and select it again. Verify the approved row count.
8. Select Download approved rows. Find Hamvara-approved-SKU.csv in browser downloads. Open it through a CSV import dialog with SKU and barcode columns set to Text; check quantities, prices, currency and the destination format.
9. Test a few rows in the destination's training environment. SKU Bridge does not automatically import the file into MRP. Do not import malformed or unexpected output; keep the original and contact support with a non-sensitive example.`,
 fa: `راهنمای بازبینی‌شدهٔ SKU Bridge — ورود، بررسی و خروجی:
۱. یک کپی از فایل اصلی نگه دارید و با چند ردیف شروع کنید. کد کالا و بارکد را متنی نگه دارید تا صفرهای ابتدایی حذف نشوند.
۲. در SKU Bridge روی Choose Excel or CSV بزنید، فایل را انتخاب و نام و تعداد ردیف‌های بارگذاری‌شده را کنترل کنید.
۳. در Confirm column mapping، فیلد SKU / Product code را به ستون کد کالا وصل کنید. سایر فیلدها را تطبیق دهید؛ ستون اختیاری ناموجود را Not in file بگذارید. Currency را کنترل کنید؛ این بتا ارز خالی را USD قرار می‌دهد.
۴. Analyze data را بزنید. گزینهٔ Analyze & Map with AI اختیاری است و برای این مسیر دستی لازم نیست.
۵. در Data quality report، وضعیت STATUS هر ردیف را بخوانید: MISSING_SKU کد خالی؛ MISSING_PRICE قیمت واحد خالی؛ DUPLICATE_SKU کد تکراری؛ PRICE_CONFLICT قیمت‌های متفاوت برای یک کد؛ INVALID_BARCODE بارکد پذیرفته‌نشده. امتیاز کیفیت تضمین صحت اطلاعات نیست.
۶. مقدارها را با سند واقعی اصلاح کنید، نه با حدس. Recheck corrections را بزنید. ردیف تکراری یا مبهم را تا تعیین معنای تجاری آن بیرون از خروجی نگه دارید؛ ابزار خودکار ردیف‌ها را ادغام نمی‌کند.
۷. USE را فقط برای ردیف‌های بررسی‌شده انتخاب کنید. ویرایش، تأیید قبلی را پاک می‌کند؛ پس از اصلاح دوباره بررسی و انتخاب کنید. تعداد ردیف‌های تأییدشده را کنترل کنید.
۸. Download approved rows را بزنید. فایل Hamvara-approved-SKU.csv را در دانلودها پیدا کنید. با پنجرهٔ ورود CSV باز کنید و نوع ستون کد و بارکد را Text بگذارید؛ مقدار، قیمت، ارز و قالب مقصد را کنترل کنید.
۹. ابتدا چند ردیف را در محیط آموزشی مقصد امتحان کنید. SKU Bridge فایل را خودکار وارد MRP نمی‌کند. خروجی نامعتبر یا غیرمنتظره را وارد سیستم نکنید؛ اصل فایل را نگه دارید و نمونهٔ غیرحساس را برای پشتیبانی بفرستید.`,
 tr: `Gözden geçirilmiş SKU Bridge rehberi — yükleme, kontrol ve dışa aktarma:
1. Orijinal dosyanın bir kopyasını saklayın. Birkaç satırla başlayın; baştaki sıfırları korumak için SKU ve barkodu metin olarak tutun.
2. SKU Bridge içinde Choose Excel or CSV seçeneğini kullanın. Dosyayı seçin; dosya adını ve yüklenen satır sayısını kontrol edin.
3. Confirm column mapping bölümünde SKU / Product code alanını SKU sütununa bağlayın. Diğer alanları eşleştirin; olmayan isteğe bağlı alanları Not in file bırakın. Currency alanını kontrol edin: bu beta boş para birimini USD kabul eder.
4. Analyze data düğmesine basın. Analyze & Map with AI isteğe bağlıdır; bu manuel işlem için gerekli değildir.
5. Data quality report içindeki her satırın STATUS bilgisini okuyun: MISSING_SKU eksik kod; MISSING_PRICE eksik birim fiyat; DUPLICATE_SKU tekrar eden kod; PRICE_CONFLICT aynı kod için farklı fiyatlar; INVALID_BARCODE kabul edilmeyen barkod. Kalite puanı doğruluk garantisi değildir.
6. Değerleri tahminle değil gerçek kayıtlarla düzeltin. Recheck corrections düğmesine basın. Tekrarlı veya belirsiz satırları anlamları açıklığa kavuşana kadar dışarıda bırakın; araç satırları otomatik birleştirmez.
7. Yalnızca kontrol edilen satırlar için USE kutusunu seçin. Düzenleme önceki onayı kaldırır; tekrar kontrol edip seçin. Onaylı satır sayısını doğrulayın.
8. Download approved rows düğmesine basın. İndirilen Hamvara-approved-SKU.csv dosyasını CSV içe aktarma penceresiyle açın; SKU ve barkod sütunlarını Text yapın. Miktar, fiyat, para birimi ve hedef biçimini kontrol edin.
9. Önce hedefin eğitim ortamında birkaç satırı deneyin. SKU Bridge dosyayı MRP sistemine otomatik kaydetmez. Bozuk veya beklenmeyen çıktıyı içe aktarmayın; orijinali saklayın ve hassas olmayan bir örnekle desteğe başvurun.`
};

export function reviewedWorkflow(question, chunks, lang) {
 const q=question.toLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک');
 // Require a named product and both import and review/export intent. A narrow
 // question, other product, or a comparison remains with the model and guides.
 if(!/\bsku[\s-]+bridge\b/.test(q)||/\bmrp\b/.test(q))return null;
 if(!/\b(import|upload|load)\b|وارد|بارگذاری|ورود|yükle|içe aktar/.test(q))return null;
 if(!/\b(error|errors|correct|review|check|download|export|approved)\b|خطا|اصلاح|بررسی|دانلود|خروجی|hata|kontrol|düzelt|indir|dışa aktar/.test(q))return null;
 const text=SKU_IMPORT[lang];if(!text)return null;
 const ids=['prepare','load','mapping','review','correct','export'].map(step=>`${lang}-sku-bridge-${step}`);
 const sources=ids.map(id=>chunks.find(k=>k.id===id));
 if(sources.some(k=>!k))return null;
 return {text,sources:sources.map(k=>({title:k.title,url:k.url}))};
}
