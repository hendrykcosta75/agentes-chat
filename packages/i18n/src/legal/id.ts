import type { LegalDocument, LegalKind } from "./types";

/** Terms and Privacy in id, each with its `courtesy` notice: a page not here shows in English. */
export const legalId: Partial<Record<LegalKind, LegalDocument>> = {
  terms: {
    title: "Ketentuan Penggunaan",
    summary:
      "Perjanjian untuk menggunakan agentes.chat: ruang kerja Anda, agen Anda, dan apa yang menjadi tanggung jawab masing-masing pihak.",
    courtesy:
      "Dokumen ini adalah terjemahan yang disediakan semata-mata untuk kemudahan. Apabila terdapat perbedaan dengan versi bahasa Inggris, versi bahasa Inggris yang berlaku.",
    updated: "2026-11-13",
    sections: [
      {
        id: "agreement",
        heading: "1. Perjanjian",
        blocks: [
          'Ketentuan Penggunaan ini ("Ketentuan") merupakan perjanjian yang mengikat antara CODARI GLOBAL, LLC, sebuah perusahaan dengan tanggung jawab terbatas (limited liability company) Wyoming yang menjalankan usaha dengan nama agentes.chat ("agentes.chat", "kami"), dan orang atau entitas yang membuat akun atau ruang kerja ("Anda"). Dengan membuat akun, bergabung dengan ruang kerja, atau dengan cara lain menggunakan agentes.chat di web, aplikasi Mac, atau aplikasi ponsel ("Layanan"), Anda menerima Ketentuan ini dan Kebijakan Privasi kami. Apabila Anda menggunakan Layanan atas nama perusahaan atau entitas lain, Anda menyatakan bahwa Anda berwenang untuk mengikat entitas tersebut.',
          "Anda harus berusia sekurang-kurangnya 18 tahun dan cakap untuk membuat kontrak agar dapat menggunakan Layanan.",
        ],
      },
      {
        id: "service",
        heading: "2. Layanan",
        blocks: [
          "Layanan adalah ruang kerja tempat manusia dan agen AI bekerja bersama. Layanan mencakup kanal, utas, dan pesan langsung, serta agen dengan peran, instruksi, memori, dan anggarannya masing-masing. Layanan juga mencakup tugas, wiki, Drive, kalender, dan rutinitas, persetujuan, konektor ke layanan lain, serta pilihan untuk menghubungkan komputer tempat agen dapat bekerja.",
          "Layanan ini masih baru dan terus berkembang: fitur dapat berubah, dibatasi, atau dihapus. Untuk sementara waktu, kami dapat membuka akun baru hanya melalui undangan, atau bagi siapa pun yang mendaftar. Kami akan memberi tahu Anda terlebih dahulu sebelum menghapus sesuatu yang Anda andalkan, sepanjang hal itu dapat dilaksanakan.",
        ],
      },
      {
        id: "accounts",
        heading: "3. Akun dan ruang kerja",
        blocks: [
          "Anda bertanggung jawab atas keakuratan informasi akun Anda, atas keamanan kredensial Anda, dan atas seluruh aktivitas di bawah akun Anda. Pemilik dan admin suatu ruang kerja menentukan siapa yang bergabung, peran apa yang mereka miliki, agen mana yang ada, dan apa yang boleh dilakukan agen tersebut. Apabila Ketentuan ini menyatakan bahwa suatu ruang kerja memiliki, memutuskan, atau bertanggung jawab atas sesuatu, yang dimaksud adalah orang atau entitas yang membuatnya, atau yang atas namanya ruang kerja itu dibuat, yang bertindak melalui pemilik dan adminnya. Segera beri tahu kami di security@agentes.chat apabila Anda yakin bahwa suatu akun, kunci, atau komputer yang terhubung telah disusupi.",
        ],
      },
      {
        id: "agents",
        heading: "4. Agen dan apa yang mereka lakukan",
        blocks: [
          "Agen bertindak berdasarkan instruksi, izin, konektor, anggaran, dan komputer yang diberikan oleh Anda dan ruang kerja Anda. Apa yang dilakukan agen dalam batas izin tersebut, termasuk pesan yang dikirimnya, kode yang diubahnya, data yang dibaca, ditulis, atau dihapusnya, serta perintah yang dijalankannya di komputer, dilakukan atas nama ruang kerja Anda, dan ruang kerja Anda bertanggung jawab atasnya berdasarkan Ketentuan ini. Setiap agen memiliki seorang penanggung jawab.",
          "Tindakan yang sulit dibatalkan menjadi permintaan persetujuan kepada seseorang sebelum tindakan itu terjadi. Menyetujuinya merupakan keputusan Anda. Layanan menunjukkan apa yang akan dilakukan, tetapi Anda bertanggung jawab untuk meninjaunya.",
          "Keluaran AI dapat keliru, tidak lengkap, atau usang, bahkan ketika terdengar meyakinkan. Tinjau apa yang dihasilkan agen sebelum mengandalkannya, dan jangan menggunakannya sebagai pengganti nasihat profesional (hukum, medis, keuangan, atau lainnya) atau sebagai satu-satunya dasar bagi keputusan yang memiliki akibat hukum atau akibat signifikan serupa terhadap orang.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "5. Penggunaan yang dapat diterima",
        blocks: [
          "Anda setuju untuk tidak menggunakan Layanan, atau membiarkan agen digunakan, untuk:",
          {
            list: [
              "melanggar hukum, melanggar hak orang lain, atau memproses data pribadi tanpa dasar hukum yang sah",
              "mengirim spam atau pesan yang tidak diminta, atau melecehkan, mengancam, menipu, atau menyamar sebagai siapa pun",
              "membuat atau mendistribusikan malware, phishing, atau konten yang menyeksualisasi anak di bawah umur, mempromosikan kekerasan, atau dengan cara lain melanggar hukum",
              "mengakali batasan dan pengamanan Layanan, seperti anggaran, batas laju (rate limit), persetujuan, izin, atau pemeriksaan pada komputer dan basis data yang terhubung",
              "menyerang Layanan atau pihak lain melalui Layanan, termasuk mencari celah kerentanan, membebaninya secara berlebihan, atau menanamkan instruksi yang dimaksudkan untuk mengambil alih agen milik orang lain",
              "mengakses layanan, komputer, atau data yang tidak berhak Anda gunakan, atau menggunakan layanan yang terhubung secara bertentangan dengan ketentuannya sendiri",
              "melanggar kebijakan penggunaan penyedia model AI yang menjalankan agen Anda.",
            ],
          },
          "Kami dapat menangguhkan suatu agen, konektor, atau akun, dengan pemberitahuan sepanjang dapat dilaksanakan, apabila aktivitasnya mengancam keamanan, integritas, atau operasi yang sah dari Layanan atau pihak lain.",
        ],
      },
      {
        id: "content",
        heading: "6. Konten Anda",
        blocks: [
          '"Konten Ruang Kerja" berarti apa yang Anda dan orang lain di ruang kerja Anda masukkan ke dalam Layanan serta apa yang dihasilkan agen Anda di dalamnya. Ruang kerja Anda memiliki Konten Ruang Kerjanya, dan sebagaimana antara Anda dan kami, keluaran yang dihasilkan agen untuk Anda adalah milik Anda, dengan tunduk pada ketentuan penyedia model yang menghasilkannya. Keluaran tersebut dapat serupa dengan apa yang dihasilkan model yang sama untuk pihak lain.',
          "Anda memberikan kepada kami hak terbatas yang diperlukan untuk mengoperasikan Layanan: untuk menyimpan, memproses, mengirimkan, dan menampilkan Konten Ruang Kerja guna menjalankan ruang kerja dan agen Anda, mengirimkannya kepada penyedia yang digunakan agen Anda sebagaimana diuraikan dalam Kebijakan Privasi, dan memberikan dukungan. Kami tidak menjual Konten Ruang Kerja dan tidak menggunakannya untuk melatih model pembelajaran mesin.",
          "Ruang kerja Anda adalah pengendali data pribadi dalam Konten Ruang Kerjanya, dan kami memproses data tersebut berdasarkan instruksinya sebagai prosesor, sebagaimana diuraikan dalam Kebijakan Privasi dan Adendum Pemrosesan Data.",
        ],
      },
      {
        id: "third-parties",
        heading: "7. Penyedia model, konektor, dan akun Anda sendiri",
        blocks: [
          "Agen berjalan di atas model AI dari pihak ketiga (seperti Anthropic, yang membuat Claude, dan OpenAI), melalui kunci API yang ditambahkan oleh ruang kerja Anda atau paket AI, seperti Claude atau ChatGPT, yang dihubungkan oleh seseorang di ruang kerja Anda. Penggunaan kunci atau paket tersebut juga diatur oleh perjanjian Anda dengan penyedianya, dan Anda bertanggung jawab untuk mematuhi ketentuannya dan atas biayanya.",
          "Konektor memberi agen akses ke layanan lain (seperti GitHub, Google, Linear, Sentry, atau kotak masuk email). Layanan tersebut disediakan oleh pihak ketiga berdasarkan ketentuan mereka sendiri. Ketersediaannya dan apa yang mereka lakukan terhadap data berada di luar kendali kami.",
        ],
      },
      {
        id: "computers",
        heading: "8. Komputer yang terhubung",
        blocks: [
          "Apabila Anda menghubungkan komputer, Anda memasang perangkat lunak yang memungkinkan agen menjalankan perintah dan menggunakan peramban di komputer tersebut, dalam batas folder dan izin yang Anda tetapkan di komputer itu. Anda bertanggung jawab atas komputer tersebut, atas apa yang Anda izinkan di sana, dan atas pencadangan apa yang penting. Izin hanya dapat diperluas di komputer itu sendiri, dan Anda dapat memutuskan sambungannya kapan saja.",
        ],
      },
      {
        id: "data-protection",
        heading: "9. Pelindungan data",
        blocks: [
          "Apabila GDPR, UK GDPR, atau LGPD berlaku terhadap data pribadi dalam Konten Ruang Kerja Anda, masing-masing pihak akan mematuhi kewajibannya berdasarkan hukum tersebut. Adendum Pemrosesan Data (Data Processing Addendum, DPA) yang memuat Klausul Kontrak Standar Komisi Eropa dan ketentuan LGPD yang setara tersedia dan, apabila telah ditandatangani, menjadi bagian dari Ketentuan ini. Mintalah melalui legal@agentes.chat.",
        ],
      },
      {
        id: "fees",
        heading: "10. Paket, pembayaran, dan penggunaan wajar",
        blocks: [
          "Setiap ruang kerja membayar paket agentes.chat-nya sendiri. Ketentuan berikut berlaku untuk setiap paket:",
          {
            list: [
              "**Harga.** Paket dan harganya tercantum di halaman harga kami. Harga dinyatakan dalam dolar AS, dan pajak ditambahkan apabila berlaku. Bank atau penyedia pembayaran Anda dapat mengenakan biayanya sendiri atas pembelian dari luar negeri, seperti IOF di Brasil.",
              "**Perpanjangan.** Paket diperpanjang secara otomatis setiap bulan atau setiap tahun, bergantung pada periode yang dipilih, hingga dibatalkan. Kami mengirimkan pengingat sebelum paket tahunan diperpanjang.",
              "**Pembatalan.** Anda dapat membatalkan kapan saja, dan pembatalan berlaku pada akhir periode yang telah dibayar. Setelah itu, agen ruang kerja berhenti, komputernya dihapus 7 hari kemudian, dan percakapan serta berkasnya tetap dapat dibaca dan diunduh selama 90 hari, setelah itu semuanya dihapus.",
              "**Tidak ada pengembalian dana.** Pembayaran bersifat final dan tidak dapat dikembalikan, baik seluruhnya maupun sebagian, termasuk untuk sisa periode setelah pembatalan, kecuali apabila hukum menentukan lain.",
              "**Pembayaran gagal.** Apabila suatu pembayaran gagal, kami mencobanya kembali selama beberapa hari berikutnya. Apabila tetap gagal, ruang kerja ditahan sementara (on hold): agennya berhenti, dan orang tetap dapat membaca dan menulis di dalamnya. Komputernya disimpan selama 7 hari, kemudian dilepaskan dan dihapus. Melakukan pembayaran akan memulihkan ruang kerja, pada komputer baru apabila komputer lama telah dilepaskan.",
              "**Perubahan harga.** Kami dapat mengubah harga bagi pelanggan baru kapan saja. Harga paket yang sudah Anda miliki hanya berubah karena pajak baru, mulai perpanjangan berikutnya, dengan pemberitahuan sekurang-kurangnya 30 hari sebelumnya.",
              "**Penggunaan wajar.** Beberapa fitur berjalan di atas layanan AI yang kami sediakan tanpa biaya tambahan, seperti memilih agen mana yang menjawab, menilai memori dan tindakan, serta menemukan apa yang perlu diklik di layar. Kami dapat membatasinya bagi ruang kerja yang penggunaannya jauh di atas normal.",
              "**Anggaran.** Anggaran yang ditetapkan per ruang kerja dan per agen menghentikan penggunaan model oleh agen ketika batasnya tercapai. Anggaran merupakan bagian dari Layanan, bukan cacat Layanan. Biaya yang dikenakan penyedia atas kunci atau paket AI Anda sendiri merupakan urusan antara Anda dan penyedia tersebut.",
            ],
          },
        ],
      },
      {
        id: "ip",
        heading: "11. Kekayaan intelektual dan masukan",
        blocks: [
          "Kecuali Konten Ruang Kerja Anda, kami dan pemberi lisensi kami mempertahankan seluruh hak, kepemilikan, dan kepentingan atas Layanan, termasuk perangkat lunak, desain, serta nama dan merek agentes.chat. Masukan yang Anda pilih untuk dikirimkan kepada kami dapat digunakan tanpa kewajiban apa pun kepada Anda.",
        ],
      },
      {
        id: "termination",
        heading: "12. Jangka waktu dan pengakhiran",
        blocks: [
          "Anda dapat berhenti menggunakan Layanan dan menghapus akun Anda kapan saja di aplikasi. Akun dihapus 7 hari kemudian, dan Anda dapat memulihkannya sampai saat itu. Kami dapat menangguhkan atau mengakhiri akses Anda karena pelanggaran material terhadap Ketentuan ini, apabila diwajibkan oleh hukum, atau dengan pemberitahuan 30 hari apabila kami menghentikan Layanan. Apabila kami mengakhiri Layanan karena alasan selain pelanggaran Anda, kami akan menyediakan Konten Ruang Kerja Anda untuk diekspor selama 30 hari, kemudian menghapusnya sebagaimana diuraikan dalam Kebijakan Privasi. Bagian-bagian yang menurut sifatnya tetap berlaku setelah pengakhiran (termasuk Bagian 6, 9, 11, 13, 14, dan 15) tetap berlaku.",
        ],
      },
      {
        id: "disclaimers",
        heading: "13. Penafian",
        blocks: [
          'Layanan, termasuk segala sesuatu yang dihasilkan dan dilakukan agen, disediakan "sebagaimana adanya" dan "sebagaimana tersedia". Kami tidak menjamin bahwa Layanan atau agen akan berjalan tanpa gangguan, bebas dari kesalahan, akurat, atau sesuai dengan tujuan Anda. Sejauh diizinkan secara maksimal oleh hukum, kami menyangkal semua jaminan tersirat, termasuk jaminan kelayakan untuk diperdagangkan, kesesuaian untuk tujuan tertentu, dan tidak adanya pelanggaran hak.',
        ],
      },
      {
        id: "liability",
        heading: "14. Batasan tanggung jawab",
        blocks: [
          "Sejauh diizinkan secara maksimal oleh hukum: tidak ada pihak yang bertanggung jawab atas kerugian tidak langsung, insidental, khusus, konsekuensial, atau yang bersifat hukuman (punitive), atau atas hilangnya keuntungan, pendapatan, atau data. Sejauh yang sama, tanggung jawab agregat kami yang timbul dari Layanan terbatas pada jumlah yang Anda bayarkan kepada kami dalam dua belas bulan sebelum peristiwa yang menimbulkan klaim (atau USD 100 apabila Anda tidak membayar apa pun). Batasan ini tidak berlaku terhadap kewajiban pembayaran Anda, pelanggaran Anda terhadap Bagian 5, atau tanggung jawab yang tidak dapat dibatasi menurut hukum.",
        ],
      },
      {
        id: "indemnification",
        heading: "15. Ganti rugi",
        blocks: [
          "Anda akan membela dan memberikan ganti rugi kepada kami terhadap klaim pihak ketiga yang timbul dari Konten Ruang Kerja Anda, dari apa yang dilakukan agen Anda dalam batas izin yang Anda berikan, atau dari pelanggaran Anda terhadap Bagian 5.",
        ],
      },
      {
        id: "law",
        heading: "16. Hukum yang berlaku",
        blocks: [
          "Ketentuan ini diatur oleh hukum Negara Bagian Wyoming, Amerika Serikat, tidak termasuk kaidah hukum perdata internasionalnya (conflict-of-law rules), dan para pihak tunduk pada yurisdiksi eksklusif pengadilan negara bagian dan federal yang berkedudukan di Wyoming. Apabila Anda adalah konsumen di yurisdiksi yang hukumnya memberikan hak atau forum yang tidak dapat dikesampingkan, seperti Brasil, hak tersebut tidak terpengaruh.",
        ],
      },
      {
        id: "changes",
        heading: "17. Perubahan atas Ketentuan ini",
        blocks: [
          "Kami dapat memperbarui Ketentuan ini. Perubahan material akan diumumkan melalui email atau di aplikasi sekurang-kurangnya 14 hari sebelum berlaku. Penggunaan yang berlanjut setelah tanggal berlakunya merupakan penerimaan. Versi terkini selalu tersedia di halaman ini. Apabila suatu terjemahan berbeda dengan versi bahasa Inggris, versi bahasa Inggris yang berlaku, kecuali apabila hukum menentukan lain.",
        ],
      },
      {
        id: "contact",
        heading: "18. Kontak",
        blocks: [
          "CODARI GLOBAL, LLC, yang menjalankan usaha dengan nama agentes.chat. Pemberitahuan: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · legal@agentes.chat · Hal lainnya: hello@agentes.chat",
        ],
      },
    ],
  },
  privacy: {
    title: "Kebijakan Privasi",
    summary:
      "Apa yang kami kumpulkan, apa yang dikirim agen dan ke mana, siapa yang dapat melihat ruang kerja Anda, dan hak-hak yang Anda miliki.",
    courtesy:
      "Dokumen ini adalah terjemahan yang disediakan semata-mata untuk kemudahan. Apabila terdapat perbedaan dengan versi bahasa Inggris, versi bahasa Inggris yang berlaku.",
    updated: "2026-11-13",
    sections: [
      {
        id: "overview",
        heading: "1. Ikhtisar",
        blocks: [
          'CODARI GLOBAL, LLC, sebuah perusahaan dengan tanggung jawab terbatas (limited liability company) Wyoming yang menjalankan usaha dengan nama agentes.chat ("agentes.chat", "kami"), mengoperasikan agentes.chat: ruang kerja tempat manusia dan agen AI bekerja bersama, yang tersedia di web, sebagai aplikasi Mac, dan sebagai aplikasi ponsel ("Layanan"). Kebijakan ini membedakan dua peran:',
          {
            list: [
              "Untuk **data akun**, yaitu informasi yang diberikan orang kepada kami untuk membuat dan menggunakan akun, kami adalah pengendali data.",
              "Untuk **Konten Ruang Kerja**, yaitu segala sesuatu yang dimasukkan atau dihasilkan oleh orang dan agen suatu ruang kerja di dalamnya, kami adalah prosesor data yang bertindak berdasarkan instruksi ruang kerja. Ruang kerja adalah pengendali, yaitu orang atau entitas yang membuatnya atau yang atas namanya ruang kerja itu dibuat.",
            ],
          },
        ],
      },
      {
        id: "data-we-collect",
        heading: "2. Data yang kami kumpulkan sebagai pengendali",
        blocks: [
          {
            list: [
              "**Data akun:** nama, alamat email, hash kata sandi, foto profil, bahasa, dan zona waktu. Apabila Anda masuk dengan Google, Apple, atau GitHub, kami menerima nama, alamat email, dan pengenal akun Anda dari penyedia tersebut, tidak pernah kata sandinya.",
              "**Data ruang kerja:** nama ruang kerja, anggota, peran, dan undangannya.",
              "**Data penagihan:** untuk ruang kerja dengan paket agentes.chat, nama, alamat email, alamat penagihan, dan nomor identitas pajak orang yang membayar, paketnya, serta faktur dan pembayarannya. Pembayaran diproses oleh Stripe, yang menangani detail kartu: detail tersebut tidak pernah sampai kepada kami.",
              "**Data penggunaan dan log:** alamat IP, peramban dan perangkat, sesi masuk, peristiwa keamanan, permintaan API, dan catatan setiap pemanggilan model (model, token, dan biaya, beserta ruang kerja dan agen terkait), yang kami simpan untuk menegakkan anggaran dan menampilkan penggunaan. Ketika terjadi kerusakan, kami mencatat galatnya, tanpa isi pesan, untuk memperbaikinya.",
              "**Perangkat:** untuk aplikasi ponsel, token notifikasi push dari setiap perangkat tempat Anda masuk. Untuk komputer yang terhubung dan aplikasi Mac, nama komputer, sistem operasi, dan versi aplikasinya.",
              "**Daftar tunggu:** alamat email dan bahasa yang Anda berikan kepada kami di agentes.chat, dan apakah Anda telah mengonfirmasinya.",
              "**Analitik situs:** di agentes.chat (situs publik, bukan ruang kerja), halaman yang dilihat, situs perujuk, jenis perangkat, dan perkiraan lokasi yang diturunkan dari alamat IP, yang dikumpulkan dengan Himetrica.",
            ],
          },
        ],
      },
      {
        id: "how-we-use",
        heading: "3. Cara kami menggunakan data akun",
        blocks: [
          "Untuk menyediakan dan mengamankan Layanan (termasuk mendeteksi dan menghentikan penyalahgunaan), menagih paket, menerapkan anggaran dan batasan, menanggapi permintaan dukungan, memenuhi kewajiban hukum, dan mengirim pesan layanan seperti konfirmasi email, undangan, pengaturan ulang kata sandi, permintaan persetujuan, dan notifikasi yang Anda aktifkan. Kami mengirim email kepada daftar tunggu hanya untuk mengonfirmasi alamat dan untuk mengundang Anda.",
          "Kami tidak menjual data pribadi, tidak menggunakan Konten Ruang Kerja untuk melatih model pembelajaran mesin, dan tidak mengizinkan subprosesor kami untuk melakukannya.",
        ],
      },
      {
        id: "workspace-content",
        heading: "4. Konten Ruang Kerja, diproses atas nama ruang kerja",
        blocks: [
          "Konten Ruang Kerja mencakup pesan di kanal, utas, dan pesan langsung, berkas di Drive, dan halaman wiki. Konten ini juga mencakup tugas, rutinitas, acara kalender, dan persetujuan, instruksi, pengaturan, dan memori agen, apa yang ditulis dan dilakukan agen, serta data yang dibaca agen melalui konektor, basis data, dan komputer yang dihubungkan oleh ruang kerja. Kami memprosesnya hanya untuk menjalankan ruang kerja dan agennya sebagaimana dikonfigurasi oleh ruang kerja, untuk menampilkannya kepada anggota ruang kerja, untuk mengirim notifikasi yang mereka minta, dan untuk memberikan dukungan.",
          "Konten Ruang Kerja adalah milik ruang kerja: anggota melihat apa yang diizinkan oleh kanal dan izinnya, dan pemilik serta adminnya mengelolanya. Pemilik dan admin ruang kerja dapat melihat setiap kanal, tugas, dan halaman wiki, termasuk yang privat. Mereka tidak dapat membaca pesan langsung antara orang lain. Pesan yang Anda kirim tetap berada di ruang kerja setelah Anda meninggalkannya atau menghapus akun Anda, kecuali ruang kerja menghapusnya.",
        ],
      },
      {
        id: "agents",
        heading: "5. Cara agen memproses Konten Ruang Kerja",
        blocks: [
          "Agen adalah model AI yang membaca dan bertindak di dalam ruang kerja. Konten Ruang Kerja keluar dari server kami dalam keadaan-keadaan berikut, dan hanya dalam keadaan tersebut:",
          {
            list: [
              "**Antara perangkat dan server kami.** Segala sesuatu yang dikirim antara server kami dan peramban, aplikasi, serta komputer yang terhubung dengannya, termasuk Konten Ruang Kerja, melewati penyedia jaringan kami, yang melindungi Layanan dari serangan. Untuk itu, penyedia jaringan tersebut mendekripsi lalu lintas ini di pusat datanya yang terdekat dengan setiap perangkat, dan menanganinya atas nama kami.",
              "**Menjawab.** Ketika agen bekerja, agen mengirimkan konteks yang dibutuhkannya (konteks ruang kerja, instruksi agen, percakapan, memori yang relevan, dan hasil alat-alatnya) kepada penyedia model yang dipilih untuk agen tersebut. Dengan kunci API yang ditambahkan oleh ruang kerja, pemanggilan dilakukan di bawah akun dan perjanjian ruang kerja itu sendiri dengan penyedia tersebut. Dengan paket AI, seperti Claude atau ChatGPT, yang dihubungkan ke suatu agen, agen bekerja di bawah akun orang yang menghubungkan paket tersebut dan berdasarkan ketentuan penyedia.",
              "**Menentukan siapa yang membalas.** Model perutean membaca pesan baru, nama dan peran agen ruang kerja, serta percakapan terbaru untuk menentukan agen mana, jika ada, yang harus membalas. Model ini berjalan di TypeSafe atau, sebagai cadangan, di penyedia model ruang kerja. Perutean tidak pernah memberikan izin apa pun kepada agen.",
              "**Memori.** Agen menyimpan memori dari percakapan (ringkasan, fakta, dan pelajaran) agar semakin baik dari waktu ke waktu. Sebagian penilaian tentang memori (apakah sesuatu layak disimpan, atau bertentangan dengan apa yang sudah diketahui agen) dilakukan oleh TypeSafe. Memori dapat dilihat dan dihapus di halaman agen, dan dihapus bersama ruang kerja.",
              "**Pencarian.** Untuk menemukan pesan dan dokumen terkait, teks dapat diubah menjadi vektor (embedding) oleh Voyage AI.",
              "**Konektor.** Ketika ruang kerja menghubungkan suatu layanan (seperti GitHub, Google, Linear, Sentry, kotak masuk email, atau server MCP apa pun), kami menyimpan token aksesnya dalam keadaan terenkripsi dan membaca atau menulis ke layanan tersebut hanya dalam cakupan yang diberikan ruang kerja kepada setiap agen. Layanan yang terhubung memproses data tersebut berdasarkan ketentuannya sendiri. Sambungan ke kotak masuk Gmail dan Outlook, serta ke Google Drive, Google Calendar, Google Sheets, Google Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit, dan WhatsApp, melewati Composio, yang memproses apa yang dibaca dan ditulis agen di sana.",
              "**Basis data.** Sambungan basis data bersifat hanya-baca. Kredensial disimpan dalam keadaan terenkripsi dan setiap kueri diperiksa sebelum dijalankan.",
              "**Komputer yang terhubung.** Ketika seseorang menghubungkan komputer, agen dapat menjalankan perintah dan menggunakan peramban di sana, dalam batas folder dan izin yang ditetapkan di komputer tersebut. Tampilan langsung peramban agen melewati penyedia jaringan kami dan memori server kami, dan tidak direkam. Ringkasan langkah-langkah yang diambil agen (seperti alamat yang dikunjungi dan tindakan) disimpan bersama pekerjaannya agar tim dapat melihat apa yang dilakukannya.",
              "**Komputer ruang kerja.** Di agentes.chat Cloud, agen suatu ruang kerja bekerja pada komputer yang kami jalankan untuk ruang kerja tersebut, di server kami atau di server penyedia hosting, di Uni Eropa atau di Amerika Serikat. Kami menghitung berapa banyak data yang dikirim dan diterima per hari oleh peramban, alat AI, dan program lain setiap agen di sana. Komputer tersebut dihapus setelah paket agentes.chat ruang kerja berakhir, sebagaimana diuraikan dalam Ketentuan Penggunaan.",
            ],
          },
          "Tindakan yang sulit dibatalkan (seperti menggabungkan kode, melakukan deploy, atau mengirim atas nama seseorang) menjadi permintaan persetujuan kepada seseorang sebelum tindakan itu terjadi. Teks yang berasal dari luar ruang kerja (halaman web, email, berkas) ditandai sebagai tidak tepercaya sebelum agen membacanya.",
        ],
      },
      {
        id: "staff-access",
        heading: "6. Kapan staf agentes.chat dapat melihat Konten Ruang Kerja",
        blocks: [
          "Kami tidak menelusuri ruang kerja. Seseorang di agentes.chat dapat melihat Konten Ruang Kerja hanya:",
          {
            list: [
              "**Atas permintaan Anda,** untuk membantu permintaan dukungan, dan hanya sejauh yang dibutuhkan oleh permintaan tersebut.",
              "**Untuk kepercayaan dan keamanan,** untuk menyelidiki dugaan penyalahgunaan, penipuan, konten yang melanggar hukum, atau ancaman terhadap keamanan Layanan, atau untuk menegakkan Ketentuan Penggunaan kami.",
              "**Apabila diwajibkan oleh hukum.**",
            ],
          },
          "Orang-orang yang mengoperasikan infrastruktur kami dapat menjangkau server dan basis data yang menyimpan Konten Ruang Kerja. Mereka menggunakan akses tersebut hanya untuk menjaga Layanan tetap berjalan, seperti mendiagnosis gangguan dan memulihkan cadangan, atau untuk memenuhi kewajiban hukum. Tidak satu pun dari jalur ini digunakan untuk membuat profil, iklan, atau data pelatihan.",
        ],
      },
      {
        id: "retention",
        heading: "7. Retensi",
        blocks: [
          {
            list: [
              "**Data akun:** selama akun ada. Ketika Anda menghapus akun di aplikasi, akun tersebut segera keluar dari semua perangkat dan dihapus 7 hari kemudian, kecuali Anda memulihkannya sebelum itu, lalu keluar dari cadangan kami dalam waktu 30 hari setelahnya, kecuali catatan yang wajib kami simpan menurut hukum. Setiap ruang kerja tempat Anda menjadi satu-satunya anggota ditutup pada saat yang sama, dan kontennya dihapus 7 hari kemudian sebagaimana diuraikan berikut ini. Ruang kerja tempat Anda pernah berada tetap menyimpan nama dan alamat email Anda dalam log auditnya selama masing-masing ruang kerja itu ada.",
              "**Konten Ruang Kerja:** selama ruang kerja ada, dan lebih awal apabila ruang kerja menghapus konten tertentu. Ketika paket agentes.chat suatu ruang kerja berakhir, kontennya tetap tersedia selama 90 hari dan kemudian dihapus. Ketika seorang pemilik menghapus ruang kerja, ruang kerja itu segera ditutup bagi semua orang dan kontennya dihapus 7 hari kemudian, kecuali seorang pemilik memulihkannya sebelum itu, dan keluar dari cadangan kami dalam waktu 30 hari setelahnya, kecuali konten yang wajib kami simpan menurut hukum atau sebagai catatan penyalahgunaan (di bawah).",
              "**Log:** log permintaan dan keamanan hingga 90 hari. Catatan penggunaan model (token dan biaya) selama ruang kerja ada, karena anggaran dan laporan penggunaan bergantung padanya.",
              "**Data penagihan:** selama Anda membayar suatu ruang kerja, dan setelah itu selama diwajibkan oleh hukum perpajakan dan akuntansi.",
              "**Daftar tunggu:** hingga Anda diundang dan selama 12 bulan setelahnya, atau hingga Anda meminta kami menghapus Anda.",
              "**Akun yang kami tangguhkan atau tutup karena penyalahgunaan:** kami dapat menyimpan catatan akun dan penyalahgunaan tersebut melampaui jangka waktu ini, termasuk setelah penghapusan diminta, selama diperlukan untuk menetapkan, melaksanakan, atau membela klaim hukum, untuk memenuhi kewajiban hukum, dan untuk mencegah orang yang sama menyalahgunakan Layanan lagi, berdasarkan Pasal 17(3)(b) dan (e) serta Pasal 6(1)(f) GDPR dan Pasal 7(VI), 7(IX), dan 16(I) LGPD.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "8. Keamanan",
        blocks: [
          "Data dienkripsi saat transit (TLS) dan saat disimpan. Kunci penyedia model, token konektor, dan kredensial basis data juga dienkripsi dengan enkripsi amplop (envelope encryption) per ruang kerja dan tidak pernah dikirim kembali ke peramban atau aplikasi. Akses ke sistem produksi dibatasi dan dicatat. Apabila kami mengetahui adanya pelanggaran data pribadi, kami akan memberi tahu ruang kerja yang terdampak tanpa penundaan yang tidak semestinya dan dalam jangka waktu yang disyaratkan oleh GDPR dan LGPD.",
        ],
      },
      {
        id: "transfers",
        heading: "9. Transfer internasional",
        blocks: [
          "Aplikasi kami dan basis datanya berjalan di Amerika Serikat, dan penyedia yang disebutkan dalam kebijakan ini memproses data di Amerika Serikat. Komputer ruang kerja berjalan di Uni Eropa atau di Amerika Serikat, dan penyedia jaringan kami menangani lalu lintas di pusat datanya yang terdekat dengan setiap perangkat, di Amerika Serikat atau di tempat lain. Apabila data pribadi yang tunduk pada GDPR atau UK GDPR ditransfer ke negara ketiga, kami mengandalkan Klausul Kontrak Standar Komisi Eropa dan Adendum Inggris (UK Addendum). Untuk data yang tunduk pada LGPD, kami mengandalkan pengamanan kontraktual Pasal 33.",
        ],
      },
      {
        id: "apps",
        heading: "10. Aplikasi ponsel dan Mac",
        blocks: [
          "Aplikasi ponsel mengirim notifikasi melalui Apple dan Google. Notifikasi dapat menampilkan nama penulis dan awal pesan, dan Anda memilih notifikasi mana yang Anda terima. Aplikasi Mac dan komputer yang terhubung menyimpan sesi masuknya di perangkat. Menghapus akun Anda (juga tersedia di aplikasi) mengeluarkan semua perangkat dari sesi masuk.",
        ],
      },
      {
        id: "gdpr",
        heading: "11. Hak Anda berdasarkan GDPR",
        blocks: [
          "Apabila Anda berada di EEA atau Inggris, Anda dapat meminta akses, perbaikan, penghapusan, pembatasan, dan portabilitas, serta mengajukan keberatan atas pemrosesan, dan Anda dapat mengajukan pengaduan kepada otoritas pengawas Anda. Untuk data akun, hubungi kami secara langsung. Anda juga dapat memperbaiki profil dan menghapus akun Anda sendiri di aplikasi. Untuk data pribadi dalam Konten Ruang Kerja, hubungi pemilik atau admin ruang kerja, yang mengendalikannya. Kami akan meneruskan permintaan yang kami terima kepada ruang kerja tersebut dan membantunya sebagai prosesor.",
        ],
      },
      {
        id: "lgpd",
        heading: "12. Hak Anda berdasarkan LGPD",
        blocks: [
          "Apabila Anda berada di Brasil, Lei Geral de Proteção de Dados memberi Anda hak-hak yang sesuai: konfirmasi pemrosesan, akses, perbaikan, anonimisasi, pemblokiran atau penghapusan, portabilitas, informasi tentang pembagian data, dan penarikan persetujuan. Permintaan diajukan melalui saluran yang sama seperti pada Bagian 11, dan Anda dapat mengajukan permohonan kepada ANPD. Tim privasi kami, yang dapat dihubungi di privacy@agentes.chat, bertindak sebagai narahubung kami (encarregado).",
        ],
      },
      {
        id: "dpa",
        heading: "13. Adendum Pemrosesan Data",
        blocks: [
          "DPA yang mencakup pemrosesan Konten Ruang Kerja oleh kami, termasuk Klausul Kontrak Standar dan ketentuan pemrosesan LGPD, tersedia bagi setiap ruang kerja. Mintalah melalui legal@agentes.chat.",
        ],
      },
      {
        id: "cookies",
        heading: "14. Cookie dan penyimpanan lokal",
        blocks: [
          "Ruang kerja hanya menggunakan cookie dan penyimpanan lokal yang diperlukan untuk menjaga Anda tetap masuk, melindungi formulir, dan mengingat preferensi seperti tema dan bahasa. Situs publik agentes.chat mengingat bahasa yang Anda pilih dan menggunakan analitik Himetrica (Bagian 2). Kami tidak menggunakan cookie iklan atau pelacakan lintas situs.",
        ],
      },
      {
        id: "children",
        heading: "15. Anak-anak",
        blocks: [
          "Layanan adalah alat kerja untuk orang dewasa. Layanan tidak ditujukan kepada siapa pun yang berusia di bawah 18 tahun, dan kami tidak dengan sengaja mengumpulkan data pribadi mereka. Apabila Anda yakin bahwa seorang anak di bawah umur telah memberikan data pribadi kepada kami, kirimkan email ke privacy@agentes.chat dan kami akan menghapusnya.",
        ],
      },
      {
        id: "changes",
        heading: "16. Perubahan atas kebijakan ini",
        blocks: [
          "Kami dapat memperbarui kebijakan ini. Perubahan material akan diumumkan melalui email atau di aplikasi sebelum berlaku. Versi terkini selalu tersedia di halaman ini. Apabila suatu terjemahan berbeda dengan versi bahasa Inggris, versi bahasa Inggris yang berlaku, kecuali apabila hukum menentukan lain.",
        ],
      },
      {
        id: "contact",
        heading: "17. Kontak",
        blocks: [
          "CODARI GLOBAL, LLC, yang menjalankan usaha dengan nama agentes.chat. Pemberitahuan: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · privacy@agentes.chat. Pertanyaan pelindungan data dari UE, Inggris, dan Brasil akan diterima oleh tim privasi kami di alamat yang sama. Untuk hal lainnya, kirimkan email ke hello@agentes.chat.",
        ],
      },
    ],
  },
};
