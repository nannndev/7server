# Pengenalan 7Server

<div class="dok-pill mb-4"><span class="led"></span> v2.0 AI-Ready · Self-Hosted · Agentless</div>

**7Server** adalah panel kontrol web *self-hosted* modern yang dirancang bagi pengembang, *sysadmin*, dan pegiat *homelab* untuk mengelola banyak instans Linux VPS, *cloud droplets*, maupun server *bare-metal* dari satu tempat.

Panel server konvensional (seperti cPanel, Portainer, atau Coolify) biasanya mewajibkan instalasi *daemon* atau agen khusus yang terus berjalan di setiap server. **7Server memilih pendekatan yang berbeda: 100% Agentless via SSH.**

---

## Filosofi Utama

Jika Anda bisa melakukan SSH ke suatu server, 7Server dapat mengelolanya.

1. **Tanpa Jejak di Server Target**: 7Server tidak memasang software apa pun secara permanen di VPS Anda. Semua metrik telemetri, inspeksi kontainer, dan perubahan konfigurasi berjalan melalui perintah SSH standar.
2. **Kredensial Terenkripsi**: Password dan private key SSH Anda tidak pernah meninggalkan mesin Anda. Seluruh kredensial disimpan terenkripsi dengan **AES-256-GCM**.
3. **Keamanan & Kendali Penuh**: Tindakan berisiko (me-restart kontainer utama, mengubah firewall, menghapus volume) selalu membutuhkan konfirmasi klik manual. Asisten **AI SRE Copilot** membaca telemetri secara mandiri dalam mode *read-only*, namun wajib meminta persetujuan sebelum mengubah konfigurasi server.

---

## Langkah Selanjutnya

Lanjutkan ke panduan [Mulai Cepat](/id/getting-started/quick-start) untuk menjalankan 7Server dalam waktu kurang dari dua menit.

