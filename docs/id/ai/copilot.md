# AI SRE Copilot

Asisten pemecahan masalah operasional server yang membaca dan mendiagnosa kondisi server secara langsung over SSH sebelum memberikan jawaban.

---

## Alur Kerja Diagnosa Mandiri (Agent Mode)

1. **Perencanaan Diagnosa**: Copilot merumuskan perintah inspeksi yang dibutuhkan.
2. **Pemeriksaan Read-Only Otomatis**: Menjalankan perintah non-destruktif (`docker stats`, `free -m`, `journalctl`) tanpa menunggu klik.
3. **Pemberian Solusi**: Menjelaskan akar masalah berdasarkan data riil dari terminal server.
4. **Persetujuan Tindakan Modifikasi**: Jika ada perintah perbaikan (seperti restart kontainer atau resize alokasi RAM), Copilot **wajib meminta konfirmasi klik** sebelum menjalankannya.

