import type { LegalDocument, LegalKind } from "./types";

/** Terms and Privacy in tr, each with its `courtesy` notice: a page not here shows in English. */
export const legalTr: Partial<Record<LegalKind, LegalDocument>> = {
  terms: {
    title: "Kullanım Koşulları",
    summary:
      "agentes.chat'in kullanımına ilişkin sözleşme: çalışma alanınız, ajanlarınız ve her bir tarafın neden sorumlu olduğu.",
    courtesy:
      "Bu metin bir nezaket çevirisidir. İngilizce sürümden farklılık göstermesi hâlinde İngilizce sürüm esas alınır.",
    updated: "2026-11-13",
    sections: [
      {
        id: "agreement",
        heading: "1. Sözleşme",
        blocks: [
          'İşbu Kullanım Koşulları ("Koşullar"), agentes.chat ticari adıyla faaliyet gösteren Wyoming eyaleti limited şirketi CODARI GLOBAL, LLC ("agentes.chat", "biz") ile bir hesap veya çalışma alanı oluşturan gerçek ya da tüzel kişi ("siz") arasında bağlayıcı bir sözleşmedir. Bir hesap oluşturarak, bir çalışma alanına katılarak veya agentes.chat\'i web üzerinde, Mac uygulamasında ya da telefon uygulamasında ("Hizmet") başka herhangi bir şekilde kullanarak işbu Koşulları ve Gizlilik Politikamızı kabul etmiş olursunuz. Hizmeti bir şirket veya başka bir kuruluş adına kullanıyorsanız, o kuruluşu bağlamaya yetkili olduğunuzu beyan etmiş olursunuz.',
          "Hizmeti kullanabilmek için en az 18 yaşında olmanız ve sözleşme yapma ehliyetine sahip olmanız gerekir.",
        ],
      },
      {
        id: "service",
        heading: "2. Hizmet",
        blocks: [
          "Hizmet, insanların ve yapay zekâ ajanlarının birlikte çalıştığı bir çalışma alanıdır. Kanalları, ileti dizilerini ve doğrudan mesajları, ayrıca kendi rolleri, talimatları, hafızaları ve bütçeleri olan ajanları içerir. Bunların yanında görevleri, wiki, Drive, takvim ve rutinleri, onayları, diğer hizmetlere bağlayıcıları ve ajanların üzerinde çalışabileceği bilgisayarları bağlama imkânını da içerir.",
          "Hizmet yenidir ve gelişmeye devam etmektedir: özellikler değişebilir, sınırlandırılabilir veya kaldırılabilir. Yeni hesapları bir süre yalnızca davetle ya da kaydolan herkese açabiliriz. Dayandığınız bir özelliği kaldırmadan önce, makul ölçüde mümkün olduğu hâllerde, sizi önceden bilgilendiririz.",
        ],
      },
      {
        id: "accounts",
        heading: "3. Hesaplar ve çalışma alanları",
        blocks: [
          "Hesap bilgilerinizin doğruluğundan, kimlik bilgilerinizin güvenliğinden ve hesabınız altında gerçekleştirilen tüm faaliyetlerden siz sorumlusunuz. Bir çalışma alanının sahipleri ve yöneticileri, çalışma alanına kimin katılacağına, hangi rollere sahip olacaklarına, hangi ajanların bulunacağına ve bu ajanların neler yapabileceğine karar verir. İşbu Koşullar'da bir çalışma alanının bir şeye sahip olduğu, bir şeye karar verdiği veya bir şeyden sorumlu olduğu belirtildiğinde, bununla çalışma alanını oluşturan ya da adına oluşturulan gerçek veya tüzel kişinin, sahipleri ve yöneticileri aracılığıyla hareket etmesi kastedilir. Bir hesabın, bir anahtarın veya bağlı bir bilgisayarın ele geçirildiğini düşünüyorsanız, derhâl security@agentes.chat adresinden bizi bilgilendirin.",
        ],
      },
      {
        id: "agents",
        heading: "4. Ajanlar ve yaptıkları",
        blocks: [
          "Ajanlar, sizin ve çalışma alanınızın kendilerine verdiği talimatlar, izinler, bağlayıcılar, bütçeler ve bilgisayarlar doğrultusunda hareket eder. Bir ajanın bu izinler dahilinde yaptıkları, gönderdiği mesajlar, değiştirdiği kodlar, okuduğu, yazdığı veya sildiği veriler ve bir bilgisayarda çalıştırdığı komutlar dahil olmak üzere, çalışma alanınız adına yapılmış sayılır ve işbu Koşullar uyarınca bunlardan çalışma alanınız sorumludur. Her ajanın kendisinden sorumlu bir kişisi vardır.",
          "Geri alınması güç işlemler, gerçekleşmeden önce bir kişiye yöneltilen onay talebine dönüşür. Böyle bir talebi onaylamak sizin kararınızdır. Hizmet ne yapılacağını gösterir, ancak bunu incelemek sizin sorumluluğunuzdadır.",
          "Yapay zekâ çıktıları, kendinden emin bir izlenim verse bile yanlış, eksik veya güncelliğini yitirmiş olabilir. Ajanların ürettiklerine güvenmeden önce bunları inceleyin ve bunları profesyonel danışmanlığın (hukuki, tıbbi, mali veya başka türlü) yerine ya da kişiler üzerinde hukuki veya benzer ölçüde önemli etkiler doğuran kararların tek dayanağı olarak kullanmayın.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "5. Kabul edilebilir kullanım",
        blocks: [
          "Hizmeti aşağıdaki amaçlarla kullanmamayı ve ajanların bu amaçlarla kullanılmasına izin vermemeyi kabul edersiniz:",
          {
            list: [
              "hukuka aykırı davranmak, başkalarının haklarını ihlal etmek veya kişisel verileri hukuki bir dayanak olmaksızın işlemek",
              "istenmeyen ileti (spam) veya talep edilmemiş mesajlar göndermek ya da herhangi bir kişiyi taciz etmek, tehdit etmek, aldatmak veya onun kimliğine bürünmek",
              "kötü amaçlı yazılım, oltalama (phishing) ya da reşit olmayanları cinselleştiren, şiddeti teşvik eden veya başka şekilde hukuka aykırı olan içerik oluşturmak veya yaymak",
              "bütçeler, istek sınırları, onaylar, izinler veya bağlı bilgisayarlar ve veritabanları üzerindeki denetimler gibi Hizmetin sınırlarını ve güvenlik önlemlerini aşmak",
              "güvenlik açıkları aramak, Hizmeti aşırı yüklemek veya başkalarının ajanlarını ele geçirmeye yönelik talimatlar yerleştirmek dahil olmak üzere, Hizmete veya Hizmet aracılığıyla başkalarına saldırmak",
              "kullanmaya yetkili olmadığınız bir hizmete, bilgisayara veya veriye erişmek ya da bağlı bir hizmeti kendi koşullarına aykırı şekilde kullanmak",
              "ajanlarınızı çalıştıran yapay zekâ modeli sağlayıcılarının kullanım politikalarını ihlal etmek.",
            ],
          },
          "Bir faaliyet Hizmetin veya başkalarının güvenliğini, bütünlüğünü ya da hukuka uygun işleyişini tehdit ettiğinde, makul ölçüde mümkün olduğu hâllerde bildirimde bulunarak bir ajanı, bir bağlayıcıyı veya bir hesabı askıya alabiliriz.",
        ],
      },
      {
        id: "content",
        heading: "6. İçeriğiniz",
        blocks: [
          '"Çalışma Alanı İçeriği", sizin ve çalışma alanınızdaki diğer kişilerin Hizmete koyduğu her şey ile ajanlarınızın Hizmet içinde ürettiği her şey anlamına gelir. Çalışma Alanı İçeriği, çalışma alanınıza aittir ve sizinle bizim aramızda, ajanların sizin için ürettiği çıktı, onu üreten model sağlayıcısının koşullarına tabi olmak kaydıyla, size aittir. Çıktı, aynı modellerin başkaları için ürettiklerine benzer olabilir.',
          "Hizmeti işletmek için gerekli sınırlı hakları bize tanırsınız: çalışma alanınızı ve ajanlarınızı çalıştırmak, Çalışma Alanı İçeriğini Gizlilik Politikasında açıklandığı şekilde ajanlarınızın kullandığı sağlayıcılara göndermek ve destek sağlamak amacıyla Çalışma Alanı İçeriğini saklamak, işlemek, iletmek ve görüntülemek. Çalışma Alanı İçeriğini satmayız ve makine öğrenimi modellerini eğitmek için kullanmayız.",
          "Çalışma Alanı İçeriğindeki kişisel verilerin veri sorumlusu çalışma alanınızdır. Biz bu verileri, Gizlilik Politikasında ve Veri İşleme Ekinde açıklandığı şekilde, onun talimatları doğrultusunda veri işleyen sıfatıyla işleriz.",
        ],
      },
      {
        id: "third-parties",
        heading: "7. Model sağlayıcıları, bağlayıcılar ve kendi hesaplarınız",
        blocks: [
          "Ajanlar, çalışma alanınızın eklediği bir API anahtarı veya çalışma alanınızdaki birinin bağladığı Claude ya da ChatGPT gibi bir yapay zekâ planı aracılığıyla, üçüncü tarafların (Claude'u geliştiren Anthropic ve OpenAI gibi) yapay zekâ modelleri üzerinde çalışır. Bu anahtarın veya planın kullanımı ayrıca ilgili sağlayıcıyla yaptığınız sözleşmeye tabidir. Onun koşullarına uymaktan ve ücretlerinden siz sorumlusunuz.",
          "Bağlayıcılar, ajanlara başka hizmetlere (GitHub, Google, Linear, Sentry veya bir e-posta gelen kutusu gibi) erişim sağlar. Bu hizmetler üçüncü taraflarca kendi koşulları çerçevesinde sunulur. Bunların erişilebilirliği ve verilerle ne yaptıkları bizim kontrolümüz dışındadır.",
        ],
      },
      {
        id: "computers",
        heading: "8. Bağlı bilgisayarlar",
        blocks: [
          "Bir bilgisayar bağlarsanız, o bilgisayarda belirlediğiniz klasörler ve izinler dahilinde ajanların komut çalıştırmasına ve bir tarayıcı kullanmasına imkân veren bir yazılım yüklemiş olursunuz. Bilgisayardan, orada izin verdiklerinizden ve önemli olan verilerin yedeklerini almaktan siz sorumlusunuz. İzinler yalnızca bilgisayarın kendisi üzerinden genişletilebilir ve bilgisayarın bağlantısını dilediğiniz zaman kesebilirsiniz.",
        ],
      },
      {
        id: "data-protection",
        heading: "9. Verilerin korunması",
        blocks: [
          "Çalışma Alanı İçeriğinizdeki kişisel verilere GDPR, UK GDPR veya LGPD uygulandığı hâllerde, taraflardan her biri ilgili mevzuat kapsamındaki yükümlülüklerine uyar. Avrupa Komisyonu'nun Standart Sözleşme Hükümlerini ve LGPD'ye ilişkin eşdeğer hükümleri içeren bir Veri İşleme Eki (DPA) mevcuttur ve imzalandığında işbu Koşulların ayrılmaz bir parçası olur. Bunu legal@agentes.chat adresinden talep edebilirsiniz.",
        ],
      },
      {
        id: "fees",
        heading: "10. Planlar, ödemeler ve adil kullanım",
        blocks: [
          "Her çalışma alanı kendi agentes.chat planının ücretini öder. Aşağıdaki kurallar tüm planlar için geçerlidir:",
          {
            list: [
              "**Fiyatlar.** Planlar ve fiyatları fiyatlandırma sayfamızda yer alır. Fiyatlar ABD doları cinsindendir ve uygulandığı hâllerde vergiler eklenir. Bankanız veya ödeme sağlayıcınız, Brezilya'daki IOF gibi, yurt dışından yapılan alımlar için kendi ücretlerini tahsil edebilir.",
              "**Yenileme.** Bir plan, seçilen döneme bağlı olarak her ay veya her yıl, iptal edilene kadar otomatik olarak yenilenir. Yıllık bir plan yenilenmeden önce bir hatırlatma göndeririz.",
              "**İptal.** Dilediğiniz zaman iptal edebilirsiniz. İptal, ücreti ödenmiş dönemin sonunda geçerli olur. Bunun ardından çalışma alanının ajanları durur, bilgisayarı 7 gün sonra silinir ve konuşmaları ile dosyaları 90 gün boyunca okunabilir ve indirilebilir durumda kalır. Bu sürenin sonunda silinir.",
              "**İade yapılmaz.** Kanunun aksini gerektirdiği hâller dışında, bir iptalden sonra kalan dönem için olanlar dahil olmak üzere, ödemeler kesindir ve tamamen veya kısmen iade edilmez.",
              "**Başarısız ödemeler.** Bir ödeme başarısız olursa, izleyen günlerde yeniden deneriz. Yine başarısız olursa çalışma alanı beklemeye alınır: ajanları durur, kişiler ise çalışma alanında okumaya ve yazmaya devam edebilir. Bilgisayarı 7 gün boyunca saklanır, ardından serbest bırakılır ve silinir. Ödeme yapılması çalışma alanını geri getirir, eski bilgisayar serbest bırakılmışsa yeni bir bilgisayar üzerinde.",
              "**Fiyat değişiklikleri.** Yeni müşteriler için fiyatları dilediğimiz zaman değiştirebiliriz. Hâlihazırda sahip olduğunuz bir planın fiyatı yalnızca yeni vergiler nedeniyle, bir sonraki yenilemeden itibaren ve en az 30 gün önceden bildirimde bulunularak değişir.",
              "**Adil kullanım.** Bazı özellikler, hangi ajanın yanıt vereceğinin seçilmesi, hafızaların ve işlemlerin değerlendirilmesi ve bir ekranda neye tıklanacağının bulunması gibi, ek ücret almadan sağladığımız yapay zekâ hizmetleri üzerinde çalışır. Kullanımı normalin çok üzerinde olan bir çalışma alanı için bunları sınırlayabiliriz.",
              "**Bütçeler.** Çalışma alanı başına ve ajan başına belirlenen bütçelere ulaşıldığında, ajanların model kullanımı durur. Bunlar Hizmetin bir parçasıdır, Hizmetin bir kusuru değildir. Bir sağlayıcının kendi anahtarınız veya yapay zekâ planınız için tahsil ettiği ücretler sizinle o sağlayıcı arasındadır.",
            ],
          },
        ],
      },
      {
        id: "ip",
        heading: "11. Fikri mülkiyet ve geri bildirim",
        blocks: [
          "Çalışma Alanı İçeriğiniz hariç olmak üzere, yazılımı, tasarımı ve agentes.chat adı ile markaları dahil olmak üzere Hizmet üzerindeki tüm hak, mülkiyet ve menfaatler bize ve lisans verenlerimize aittir. Bize göndermeyi tercih ettiğiniz geri bildirimler, size karşı herhangi bir yükümlülük doğmaksızın kullanılabilir.",
        ],
      },
      {
        id: "termination",
        heading: "12. Süre ve fesih",
        blocks: [
          "Hizmeti kullanmayı dilediğiniz zaman bırakabilir ve hesabınızı uygulama içinden silebilirsiniz. Hesabınız 7 gün sonra kaldırılır ve o zamana kadar geri yükleyebilirsiniz. İşbu Koşulların esaslı ihlali hâlinde, kanunun gerektirdiği hâllerde veya Hizmeti sonlandırmamız durumunda 30 gün önceden bildirimde bulunarak erişiminizi askıya alabilir veya sona erdirebiliriz. Hizmeti sizin ihlaliniz dışındaki nedenlerle sona erdirdiğimizde, Çalışma Alanı İçeriğinizi 30 gün boyunca dışa aktarılabilir hâlde tutarız. Ardından Gizlilik Politikasında açıklandığı şekilde sileriz. Niteliği gereği fesihten sonra da geçerliliğini koruyan bölümler (6, 9, 11, 13, 14 ve 15 dahil) geçerliliğini korur.",
        ],
      },
      {
        id: "disclaimers",
        heading: "13. Sorumluluk reddi",
        blocks: [
          'Ajanların ürettiği ve yaptığı her şey dahil olmak üzere Hizmet, "olduğu gibi" ve "mevcut olduğu şekliyle" sunulur. Hizmetin veya ajanların kesintisiz, hatasız, doğru ya da amaçlarınıza uygun olacağını garanti etmeyiz. Kanunun izin verdiği azami ölçüde, satılabilirlik, belirli bir amaca uygunluk ve hak ihlali olmaması dahil olmak üzere tüm zımni garantileri reddederiz.',
        ],
      },
      {
        id: "liability",
        heading: "14. Sorumluluğun sınırlandırılması",
        blocks: [
          "Kanunun izin verdiği azami ölçüde: taraflardan hiçbiri dolaylı, arızi, özel, netice kabilinden veya cezai tazminatlardan ya da kâr, gelir veya veri kaybından sorumlu değildir. Aynı ölçüde, Hizmetten kaynaklanan toplam sorumluluğumuz, talebe yol açan olaydan önceki on iki ay içinde bize ödediğiniz tutarlarla (hiçbir ödeme yapmadıysanız 100 ABD doları ile) sınırlıdır. Bu sınırlamalar ödeme yükümlülüklerinize, 5. Bölümü ihlal etmenize veya kanunen sınırlandırılamayan sorumluluğa uygulanmaz.",
        ],
      },
      {
        id: "indemnification",
        heading: "15. Tazmin",
        blocks: [
          "Çalışma Alanı İçeriğinizden, ajanlarınızın onlara verdiğiniz izinler dahilinde yaptıklarından veya 5. Bölümü ihlal etmenizden kaynaklanan üçüncü taraf taleplerine karşı bizi savunacak ve zararlarımızı tazmin edeceksiniz.",
        ],
      },
      {
        id: "law",
        heading: "16. Uygulanacak hukuk",
        blocks: [
          "İşbu Koşullar, kanunlar ihtilafı kuralları hariç olmak üzere ABD'nin Wyoming eyaleti kanunlarına tabidir ve taraflar Wyoming'de bulunan eyalet ve federal mahkemelerin münhasır yargı yetkisini kabul eder. Brezilya gibi, kanunu size feragat edilemeyen haklar veya yetkili mahkeme hakkı tanıyan bir yargı bölgesinde tüketiciyseniz, bu haklarınız saklıdır.",
        ],
      },
      {
        id: "changes",
        heading: "17. İşbu Koşullardaki değişiklikler",
        blocks: [
          "İşbu Koşulları güncelleyebiliriz. Esaslı değişiklikler, yürürlüğe girmelerinden en az 14 gün önce e-posta yoluyla veya uygulama içinde duyurulur. Yürürlük tarihinden sonra kullanıma devam edilmesi kabul anlamına gelir. Güncel sürüm her zaman bu sayfada yer alır. Bir çeviri ile İngilizce sürüm arasında farklılık olması hâlinde, kanunun aksini gerektirdiği hâller dışında İngilizce sürüm esas alınır.",
        ],
      },
      {
        id: "contact",
        heading: "18. İletişim",
        blocks: [
          "CODARI GLOBAL, LLC, agentes.chat ticari adıyla faaliyet gösterir. Bildirimler: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · legal@agentes.chat · Diğer tüm konular: hello@agentes.chat",
        ],
      },
    ],
  },
  privacy: {
    title: "Gizlilik Politikası",
    summary:
      "Neleri topladığımız, ajanların neyi nereye gönderdiği, çalışma alanınızı kimlerin görebildiği ve sahip olduğunuz haklar.",
    courtesy:
      "Bu metin bir nezaket çevirisidir. İngilizce sürümden farklılık göstermesi hâlinde İngilizce sürüm esas alınır.",
    updated: "2026-11-13",
    sections: [
      {
        id: "overview",
        heading: "1. Genel bakış",
        blocks: [
          'agentes.chat ticari adıyla faaliyet gösteren Wyoming eyaleti limited şirketi CODARI GLOBAL, LLC ("agentes.chat", "biz"), insanların ve yapay zekâ ajanlarının birlikte çalıştığı, web üzerinde, Mac uygulaması olarak ve telefon uygulaması olarak sunulan bir çalışma alanı olan agentes.chat\'i ("Hizmet") işletir. Bu politika iki rolü birbirinden ayırır:',
          {
            list: [
              "Kişilerin bir hesap oluşturmak ve kullanmak için bize verdiği bilgiler olan **hesap verileri** bakımından veri sorumlusu biziz.",
              "Bir çalışma alanının kişilerinin ve ajanlarının çalışma alanına koyduğu veya orada ürettiği her şey olan **Çalışma Alanı İçeriği** bakımından, çalışma alanının talimatları doğrultusunda hareket eden veri işleyen biziz. Veri sorumlusu çalışma alanıdır. Bununla, çalışma alanını oluşturan ya da adına oluşturulan gerçek veya tüzel kişi kastedilir.",
            ],
          },
        ],
      },
      {
        id: "data-we-collect",
        heading: "2. Veri sorumlusu olarak topladığımız veriler",
        blocks: [
          {
            list: [
              "**Hesap verileri:** ad, e-posta adresi, parola özeti (hash), profil fotoğrafı, dil ve saat dilimi. Google, Apple veya GitHub ile oturum açarsanız, ilgili sağlayıcıdan adınızı, e-posta adresinizi ve hesap tanımlayıcınızı alırız. Parolanızı asla almayız.",
              "**Çalışma alanı verileri:** çalışma alanının adı, üyeleri, rolleri ve davetleri.",
              "**Faturalandırma verileri:** agentes.chat planı olan bir çalışma alanı için, ödemeyi yapan kişinin adı, e-posta adresi, fatura adresi ve vergi kimlik numarası, plan ve planın faturaları ile ödemeleri. Ödemeler, kart bilgilerini işleyen Stripe tarafından gerçekleştirilir: kart bilgileri bize asla ulaşmaz.",
              "**Kullanım ve kayıt (log) verileri:** IP adresleri, tarayıcı ve cihaz, oturumlar, güvenlik olayları, API istekleri ve bütçeleri uygulamak ve kullanımı göstermek için sakladığımız her model çağrısının kaydı (ait olduğu çalışma alanı ve ajanla birlikte model, token ve maliyet). Bir şey bozulduğunda, düzeltmek amacıyla hatayı mesaj içeriği olmaksızın kaydederiz.",
              "**Cihazlar:** telefon uygulaması için, oturum açtığınız her cihazın anlık bildirim (push) token'ı. Bağlı bilgisayarlar ve Mac uygulaması için bilgisayarın adı, işletim sistemi ve uygulama sürümü.",
              "**Bekleme listesi:** agentes.chat üzerinde bize verdiğiniz e-posta adresi ve dil ile bu adresi doğrulayıp doğrulamadığınız.",
              "**Site analitiği:** agentes.chat üzerinde (çalışma alanı değil, herkese açık site), Himetrica ile toplanan, görüntülenen sayfalar, yönlendiren site, cihaz türü ve IP adresinden türetilen yaklaşık konum.",
            ],
          },
        ],
      },
      {
        id: "how-we-use",
        heading: "3. Hesap verilerini nasıl kullanıyoruz",
        blocks: [
          "Hizmeti sunmak ve güvenliğini sağlamak (kötüye kullanımın tespit edilmesi ve durdurulması dahil), planları faturalandırmak, bütçeleri ve sınırları uygulamak, destek taleplerini yanıtlamak, yasal yükümlülükleri yerine getirmek ve e-posta doğrulamaları, davetler, parola sıfırlamaları, onay talepleri ve açtığınız bildirimler gibi hizmet mesajları göndermek için. Bekleme listesindekilere yalnızca adresi doğrulamak ve sizi davet etmek için e-posta göndeririz.",
          "Kişisel verileri satmayız, Çalışma Alanı İçeriğini makine öğrenimi modellerini eğitmek için kullanmayız ve alt işleyenlerimizin bunu yapmasına izin vermeyiz.",
        ],
      },
      {
        id: "workspace-content",
        heading: "4. Çalışma alanları adına işlenen Çalışma Alanı İçeriği",
        blocks: [
          "Çalışma Alanı İçeriği, kanallardaki, ileti dizilerindeki ve doğrudan mesajlardaki mesajları, Drive'daki dosyaları ve wiki sayfalarını kapsar. Ayrıca görevleri, rutinleri, takvim etkinliklerini ve onayları, ajanların talimatlarını, ayarlarını ve hafızasını, ajanların yazdıklarını ve yaptıklarını ve ajanların çalışma alanının bağladığı bağlayıcılar, veritabanları ve bilgisayarlar aracılığıyla okuduğu verileri de kapsar. Bunları yalnızca çalışma alanını ve ajanlarını çalışma alanının yapılandırdığı şekilde çalıştırmak, çalışma alanının üyelerine göstermek, talep ettikleri bildirimleri göndermek ve destek sağlamak amacıyla işleriz.",
          "Çalışma Alanı İçeriği çalışma alanına aittir: üyeler, kanalların ve izinlerin izin verdiği kadarını görür. Sahipleri ve yöneticileri ise içeriği yönetir. Çalışma alanının sahipleri ve yöneticileri, özel olanlar dahil tüm kanalları, görevleri ve wiki sayfalarını görebilir. Başka kişiler arasındaki doğrudan mesajları okuyamazlar. Paylaştığınız mesajlar, çalışma alanı bunları silmedikçe, çalışma alanından ayrılmanızdan veya hesabınızı silmenizden sonra da çalışma alanında kalır.",
        ],
      },
      {
        id: "agents",
        heading: "5. Ajanlar Çalışma Alanı İçeriğini nasıl işler",
        blocks: [
          "Ajanlar, çalışma alanı içinde okuyan ve hareket eden yapay zekâ modelleridir. Çalışma Alanı İçeriği sunucularımızdan aşağıdaki durumlarda ve yalnızca bu durumlarda çıkar:",
          {
            list: [
              "**Cihazlar ile sunucularımız arasında.** Çalışma Alanı İçeriği dahil olmak üzere, sunucularımız ile bunlara bağlanan tarayıcılar, uygulamalar ve bilgisayarlar arasında gönderilen her şey, Hizmeti saldırılara karşı koruyan ağ sağlayıcımız üzerinden geçer. Bunu yapabilmek için ağ sağlayıcımız, bu trafiğin şifresini her cihaza en yakın veri merkezinde çözer ve trafiği bizim adımıza işler.",
              "**Yanıt verme.** Bir ajan çalışırken, ihtiyaç duyduğu bağlamı (çalışma alanının bağlamı, ajanın talimatları, konuşma, ilgili hafıza ve araçlarının sonuçları) o ajan için seçilen model sağlayıcısına gönderir. Çalışma alanının eklediği bir API anahtarı kullanıldığında çağrı, çalışma alanının o sağlayıcıdaki kendi hesabı ve sözleşmesi altında yapılır. Bir ajana Claude veya ChatGPT gibi bir yapay zekâ planı bağlandığında ajan, planı bağlayan kişinin hesabı altında ve sağlayıcının koşullarına tabi olarak çalışır.",
              "**Kimin yanıt vereceğine karar verme.** Bir yönlendirme modeli, hangi ajanın yanıt vermesi gerektiğine (varsa) karar vermek için yeni bir mesajı, çalışma alanının ajanlarının adlarını ve rollerini ve son konuşmaları okur. Bu model TypeSafe'te veya yedek olarak çalışma alanının model sağlayıcısında çalışır. Yönlendirme hiçbir zaman bir ajana herhangi bir izin vermez.",
              "**Hafıza.** Ajanlar zamanla gelişmek için konuşmalardan hafıza (özetler, olgular ve dersler) tutar. Hafızaya ilişkin bazı değerlendirmeler (bir şeyin saklanmaya değer olup olmadığı veya bir ajanın zaten bildikleriyle çelişip çelişmediği) TypeSafe tarafından yapılır. Hafıza ajanın sayfasında görülebilir ve kaldırılabilir. Çalışma alanıyla birlikte silinir.",
              "**Arama.** İlgili mesajları ve belgeleri bulmak için metinler Voyage AI tarafından vektörlere (embedding) dönüştürülebilir.",
              "**Bağlayıcılar.** Çalışma alanı bir hizmeti (GitHub, Google, Linear, Sentry, bir e-posta gelen kutusu veya herhangi bir MCP sunucusu gibi) bağladığında, erişim token'larını şifrelenmiş olarak saklarız ve o hizmette yalnızca çalışma alanının her ajana verdiği kapsamlar dahilinde okuma veya yazma yaparız. Bağlı hizmet bu verileri kendi koşulları çerçevesinde işler. Gmail ve Outlook gelen kutularına ve Google Drive, Google Calendar, Google Sheets, Google Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit ve WhatsApp'a yapılan bağlantılar, ajanların orada okuduklarını ve yazdıklarını işleyen Composio üzerinden gerçekleşir.",
              "**Veritabanları.** Veritabanı bağlantıları salt okunurdur. Kimlik bilgileri şifrelenmiş olarak saklanır ve her sorgu çalıştırılmadan önce denetlenir.",
              "**Bağlı bilgisayarlar.** Biri bir bilgisayar bağladığında, ajanlar o bilgisayarda belirlenen klasörler ve izinler dahilinde orada komut çalıştırabilir ve bir tarayıcı kullanabilir. Bir ajanın tarayıcısının canlı görüntüsü ağ sağlayıcımızdan ve sunucularımızın belleğinden geçer ve kaydedilmez. Ekibin ajanın ne yaptığını görebilmesi için ajanın attığı adımların bir özeti (ziyaret edilen adresler ve işlemler gibi) ajanın çalışmasıyla birlikte saklanır.",
              "**Çalışma alanının bilgisayarı.** agentes.chat Cloud'da bir çalışma alanının ajanları, o çalışma alanı için Avrupa Birliği'nde veya Amerika Birleşik Devletleri'nde, kendi sunucularımızda ya da bir barındırma hizmeti sağlayıcısının sunucularında işlettiğimiz bir bilgisayar üzerinde çalışır. Her ajanın tarayıcısının, yapay zekâ araçlarının ve diğer programlarının orada gönderdiği ve aldığı veri miktarını günlük olarak ölçeriz. Bilgisayar, Kullanım Koşullarında açıklandığı şekilde, çalışma alanının agentes.chat planı sona erdikten sonra silinir.",
            ],
          },
          "Geri alınması güç işlemler (kod birleştirme, yayına alma veya birisi adına gönderim yapma gibi), gerçekleşmeden önce bir kişiye yöneltilen onay talebine dönüşür. Çalışma alanının dışından gelen metinler (web sayfaları, e-postalar, dosyalar), bir ajan bunları okumadan önce güvenilmeyen olarak işaretlenir.",
        ],
      },
      {
        id: "staff-access",
        heading: "6. agentes.chat çalışanlarının Çalışma Alanı İçeriğini görebildiği durumlar",
        blocks: [
          "Çalışma alanlarına göz atmayız. agentes.chat'teki bir kişi Çalışma Alanı İçeriğini yalnızca şu durumlarda görebilir:",
          {
            list: [
              "**Sizin talebiniz üzerine,** bir destek talebine yardımcı olmak için ve yalnızca talebin gerektirdiği ölçüde.",
              "**Güven ve güvenlik amacıyla,** şüphelenilen kötüye kullanımı, dolandırıcılığı, hukuka aykırı içeriği veya Hizmetin güvenliğine yönelik bir tehdidi incelemek ya da Kullanım Koşullarımızı uygulamak için.",
              "**Kanunun gerektirdiği hâllerde.**",
            ],
          },
          "Altyapımızı işleten kişiler, Çalışma Alanı İçeriğini saklayan sunuculara ve veritabanlarına erişebilir. Bu erişimi yalnızca Hizmetin çalışmasını sürdürmek, örneğin arızaları teşhis etmek ve yedekleri geri yüklemek için ya da yasal bir yükümlülüğü yerine getirmek için kullanırlar. Bu yolların hiçbiri profil, reklam veya eğitim verisi oluşturmak için kullanılmaz.",
        ],
      },
      {
        id: "retention",
        heading: "7. Saklama",
        blocks: [
          {
            list: [
              "**Hesap verileri:** hesap var olduğu sürece. Hesabınızı uygulama içinden sildiğinizde, kanunen saklamamız gereken kayıtlar hariç, her yerde oturumu derhâl kapatılır, bundan önce geri yüklemediğiniz sürece 7 gün sonra kaldırılır ve ardından 30 gün içinde yedeklerimizden çıkar. Tek üyesi olduğunuz her çalışma alanı aynı anda kapanır ve içeriği aşağıda açıklandığı şekilde 7 gün sonra silinir. Bulunduğunuz çalışma alanları, her biri var olduğu sürece adınızı ve e-posta adresinizi denetim kayıtlarında tutar.",
              "**Çalışma Alanı İçeriği:** çalışma alanı var olduğu sürece, çalışma alanı belirli içerikleri sildiğinde ise daha erken. Bir çalışma alanının agentes.chat planı sona erdiğinde, içeriği 90 gün boyunca erişilebilir kalır ve ardından silinir. Bir sahip bir çalışma alanını sildiğinde, çalışma alanı herkes için derhâl kapanır ve içeriği, bir sahip bu süreden önce geri yüklemedikçe 7 gün sonra silinir. Bundan sonraki 30 gün içinde de, kanunen veya kötüye kullanım kaydı olarak (aşağıya bakınız) saklamamız gereken içerik hariç, yedeklerimizden çıkar.",
              "**Kayıtlar (loglar):** istek ve güvenlik kayıtları 90 güne kadar. Model kullanım kayıtları (token ve maliyet), bütçeler ve kullanım raporları bunlara dayandığından, çalışma alanı var olduğu sürece.",
              "**Faturalandırma verileri:** bir çalışma alanı için ödeme yaptığınız sürece ve bundan sonra vergi ve muhasebe mevzuatının gerektirdiği süre boyunca.",
              "**Bekleme listesi:** davet edilene kadar ve davetten sonraki 12 ay boyunca ya da sizi listeden çıkarmamızı talep edene kadar.",
              "**Kötüye kullanım nedeniyle askıya aldığımız veya kapattığımız hesaplar:** GDPR'nin 17(3)(b) ve (e) maddesi ile 6(1)(f) maddesi ve LGPD'nin 7(VI), 7(IX) ve 16(I) maddeleri uyarınca, hukuki taleplerin tesisi, kullanılması veya savunulması, yasal yükümlülüklerin yerine getirilmesi ve aynı kişilerin Hizmeti yeniden kötüye kullanmasının önlenmesi için gerekli olduğu sürece, silme talep edildikten sonra da dahil olmak üzere, hesaba ve kötüye kullanıma ilişkin kayıtları bu sürelerin ötesinde saklayabiliriz.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "8. Güvenlik",
        blocks: [
          "Veriler aktarım sırasında (TLS) ve depolanırken şifrelenir. Model sağlayıcı anahtarları, bağlayıcı token'ları ve veritabanı kimlik bilgileri ayrıca çalışma alanı başına zarf şifrelemesiyle (envelope encryption) şifrelenir ve hiçbir zaman tarayıcıya veya uygulamalara geri gönderilmez. Üretim sistemlerine erişim kısıtlıdır ve kayıt altına alınır. Bir kişisel veri ihlalinden haberdar olursak, etkilenen çalışma alanlarını gereksiz gecikme olmaksızın ve GDPR ile LGPD'nin öngördüğü süreler içinde bilgilendiririz.",
        ],
      },
      {
        id: "transfers",
        heading: "9. Uluslararası aktarımlar",
        blocks: [
          "Uygulamamız ve veritabanı Amerika Birleşik Devletleri'nde çalışır ve bu politikada adı geçen sağlayıcılar verileri Amerika Birleşik Devletleri'nde işler. Çalışma alanı bilgisayarları Avrupa Birliği'nde veya Amerika Birleşik Devletleri'nde çalışır, ağ sağlayıcımız ise trafiği her cihaza en yakın, Amerika Birleşik Devletleri'nde veya başka bir yerde bulunan veri merkezinde işler. GDPR veya UK GDPR'ye tabi kişisel veriler üçüncü bir ülkeye aktarıldığında, Avrupa Komisyonu'nun Standart Sözleşme Hükümlerine ve Birleşik Krallık Ekine dayanırız. LGPD'ye tabi veriler için 33. maddedeki sözleşmesel güvencelere dayanırız.",
        ],
      },
      {
        id: "apps",
        heading: "10. Telefon ve Mac uygulamaları",
        blocks: [
          "Telefon uygulaması bildirimleri Apple ve Google aracılığıyla gönderir. Bir bildirim, yazan kişinin adını ve mesajın başlangıcını gösterebilir ve hangi bildirimleri alacağınızı siz seçersiniz. Mac uygulaması ve bağlı bilgisayarlar oturum bilgilerini cihazda tutar. Hesabınızı silmek (uygulamalarda da mümkündür) tüm cihazlardaki oturumları kapatır.",
        ],
      },
      {
        id: "gdpr",
        heading: "11. GDPR kapsamındaki haklarınız",
        blocks: [
          "AEA'da veya Birleşik Krallık'ta bulunuyorsanız, erişim, düzeltme, silme, kısıtlama ve taşınabilirlik talep edebilir, işlemeye itiraz edebilir ve denetim makamınıza şikâyette bulunabilirsiniz. Hesap verileri için doğrudan bizimle iletişime geçin. Profilinizi düzeltebilir ve hesabınızı uygulama içinden kendiniz de silebilirsiniz. Çalışma Alanı İçeriğindeki kişisel veriler için, bu verilerin sorumlusu olan çalışma alanının sahipleri veya yöneticileriyle iletişime geçin. Bize ulaşan talepleri o çalışma alanına yönlendiririz ve veri işleyen sıfatıyla ona yardımcı oluruz.",
        ],
      },
      {
        id: "lgpd",
        heading: "12. LGPD kapsamındaki haklarınız",
        blocks: [
          "Brezilya'da bulunuyorsanız, Lei Geral de Proteção de Dados size buna karşılık gelen hakları tanır: işlemenin teyidi, erişim, düzeltme, anonimleştirme, engelleme veya silme, taşınabilirlik, paylaşıma ilişkin bilgi ve rızanın geri alınması. Talepler 11. Bölümdeki kanallarla iletilir ve ANPD'ye başvurabilirsiniz. privacy@agentes.chat adresinden ulaşılabilen gizlilik ekibimiz irtibat noktamız (encarregado) olarak görev yapar.",
        ],
      },
      {
        id: "dpa",
        heading: "13. Veri İşleme Eki",
        blocks: [
          "Standart Sözleşme Hükümleri ve LGPD işleme hükümleri dahil olmak üzere, Çalışma Alanı İçeriğini işlememizi kapsayan bir DPA her çalışma alanının kullanımına açıktır. Bunu legal@agentes.chat adresinden talep edebilirsiniz.",
        ],
      },
      {
        id: "cookies",
        heading: "14. Çerezler ve yerel depolama",
        blocks: [
          "Çalışma alanı yalnızca oturumunuzu açık tutmak, formları korumak ve tema ile dil gibi tercihleri hatırlamak için gerekli çerezleri ve yerel depolamayı kullanır. Herkese açık site agentes.chat seçtiğiniz dili hatırlar ve Himetrica analitiğini (2. Bölüm) kullanır. Reklam veya siteler arası izleme çerezleri kullanmayız.",
        ],
      },
      {
        id: "children",
        heading: "15. Çocuklar",
        blocks: [
          "Hizmet yetişkinlere yönelik bir çalışma aracıdır. 18 yaşın altındaki kişilere yönelik değildir ve onların kişisel verilerini bilerek toplamayız. Bir reşit olmayanın bize kişisel veri verdiğini düşünüyorsanız, privacy@agentes.chat adresine yazın. Söz konusu verileri sileriz.",
        ],
      },
      {
        id: "changes",
        heading: "16. Bu politikadaki değişiklikler",
        blocks: [
          "Bu politikayı güncelleyebiliriz. Esaslı değişiklikler yürürlüğe girmeden önce e-posta yoluyla veya uygulama içinde duyurulur. Güncel sürüm her zaman bu sayfada yer alır. Bir çeviri ile İngilizce sürüm arasında farklılık olması hâlinde, kanunun aksini gerektirdiği hâller dışında İngilizce sürüm esas alınır.",
        ],
      },
      {
        id: "contact",
        heading: "17. İletişim",
        blocks: [
          "CODARI GLOBAL, LLC, agentes.chat ticari adıyla faaliyet gösterir. Bildirimler: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · privacy@agentes.chat. AB, Birleşik Krallık ve Brezilya'ya ilişkin veri koruma soruları da aynı adresten gizlilik ekibimize ulaşır. Diğer tüm konular için hello@agentes.chat adresine yazın.",
        ],
      },
    ],
  },
};
