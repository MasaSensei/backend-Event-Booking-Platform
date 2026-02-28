# Event Booking System API (Backend)

Sistem Backend yang menangani pemesanan tiket event secara real-time dengan fokus pada integritas data, penanganan konkurensi, dan fitur waitlist otomatis.

---

## 🚀 Tech Choices

- **NestJS**: Digunakan karena arsitektur modularnya yang memudahkan pengelolaan logika bisnis yang kompleks dan integrasi **WebSockets** yang robust.
- **Prisma & PostgreSQL**: Dipilih untuk memastikan _strict type-safety_ dan konsistensi data. Prisma memudahkan pengelolaan relasi database yang kompleks antara User, Event, Slot, dan Booking.
- **Socket.io**: Digunakan untuk mengimplementasikan **Global Availability Update**. Setiap ada perubahan kuota (Booking/Cancel), sistem akan menyiarkan sisa slot terbaru ke semua klien yang terhubung secara real-time.
- **Alternative Considered (Go)**: Sempat mempertimbangkan Go untuk performa konkurensi yang lebih tinggi, namun akhirnya memilih NestJS untuk memaksimalkan kecepatan pengembangan dan sinkronisasi tipe data (TypeScript) antara BE dan FE.

---

## ⚖️ Trade-offs

### 1. Pessimistic Locking vs High-Throughput

Untuk menangani **Race Conditions** (Requirement 4), saya menggunakan `SELECT FOR UPDATE` (Pessimistic Locking) di level database saat proses transaksi booking.

- **Kenapa?** Ini menjamin **zero overbooking**. Tidak akan pernah ada tiket yang terjual melebihi kapasitas meskipun diserbu ribuan user di detik yang sama.
- **Risiko di Production:** Pada beban traffic yang sangat ekstrim, database locking dapat menyebabkan antrean transaksi (_lock contention_), yang berpotensi memperlambat respon API.

### 2. Immediate Waitlist Promotion

Logika **Auto-Promotion** (Requirement 2.3) dijalankan langsung di dalam transaksi pembatalan (Cancellation).

- **Kenapa?** Memberikan kepastian status instan bagi user yang berada di antrean pertama.
- **Deprioritized:** Penggunaan _Message Broker_ (seperti RabbitMQ) dideprioritaskan untuk mengurangi kompleksitas infrastruktur pada tahap MVP, namun tetap menjaga konsistensi data.

---

## 🛠️ Setup Instructions

### Prerequisites

- Node.js v18 atau lebih baru
- PostgreSQL

### Local Installation

1.  **Clone Repository** dan masuk ke direktori backend.
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Variables**: Buat file `.env` di root:
    ```env
    DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/event_db?schema=public"
    JWT_SECRET="rahasia_super_aman"
    ```
4.  **Database Sync & Seed**:
    ```bash
    npx prisma migrate dev --name init
    npx prisma db seed
    ```
    _Seed ini akan membuat akun admin dan beberapa event dengan kuota terbatas untuk memudahkan testing waitlist._
5.  **Run Server**:
    ```bash
    npm run start:dev
    ```

### Test Accounts (Credentials)

| Role                   | Email          | Password    |
| :--------------------- | :------------- | :---------- |
| **Admin/Organizer**    | admin@test.com | password123 |
| **User A (Confirmed)** | userA@test.com | password123 |
| **User B (Waitlist)**  | userB@test.com | password123 |

---

## 📈 What You'd Improve

Jika memiliki waktu pengembangan lebih banyak, saya akan memprioritaskan hal berikut:

1.  **Redis-based Distributed Locking**: Memindahkan mekanisme locking ke Redis menggunakan **Redlock**. Ini akan jauh lebih skalabel dibandingkan database locking karena tidak membebani transaksi PostgreSQL utama.
2.  **Idempotency Keys**: Menambahkan key unik pada setiap request booking untuk mencegah duplikasi data jika terjadi _network retry_ dari sisi klien.
3.  **Asynchronous Job Queue (BullMQ)**: Memindahkan proses notifikasi email dan promosi waitlist ke _background worker_ agar proses utama (Cancel/Booking) terasa lebih cepat bagi user.
4.  **Load Testing**: Melakukan stress test menggunakan _K6_ khusus pada skenario "Flash Sale" untuk memastikan integritas data tetap terjaga di bawah tekanan ribuan koneksi konkuren.
