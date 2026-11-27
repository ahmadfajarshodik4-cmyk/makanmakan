# API Campus Blood Emergency

Alamat dasar: `http://localhost:3000/api`

## Persiapan database
Import `database/campus_blood_emergency.sql`, lalu `database/02_tambahan.sql` (urut).
Jika database sudah berisi 5 tabel, tidak perlu import lagi.

Admin: `UPDATE users SET role='admin' WHERE email_kampus='emailmu@kampus.ac.id';`

## Endpoint
Selain register dan login, wajib header `Authorization: Bearer <token>`.

| Method | Path | Isi (JSON) | Keterangan |
|---|---|---|---|
| POST | /register | email_kampus, password | Email .ac.id, password min. 6 |
| POST | /login | email_kampus, password | Mengembalikan token |
| GET | /profil | | Profil sendiri |
| POST | /profil | nama_lengkap, nim_id_civitas, no_telepon, fakultas_unit, golongan_darah, bersedia_donor | Simpan/ubah |
| GET | /jadwal | | Jadwal yang belum lewat + sisa_kuota |
| POST | /jadwal | judul, lokasi, waktu_mulai, waktu_selesai, kuota | Admin. Waktu: YYYY-MM-DD HH:MM |
| POST | /jadwal/:id/daftar | | Daftar donor |
| GET | /riwayat | | Pendaftaran sendiri |
| PATCH | /pendaftaran/:id/batal | | Batalkan pendaftaran |
| GET | /darurat | | Permintaan aktif |
| POST | /darurat | golongan_darah, rhesus, jumlah_kantong, lokasi, kontak | Buat permintaan |
| PATCH | /darurat/:id | status: terpenuhi / batal | Hanya pembuatnya |

Error selalu berbentuk `{ "message": "..." }` dengan status 400, 401, 403, 404, 409, 500, atau 503.
