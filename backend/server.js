const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'campus_blood_emergency_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Konfigurasi koneksi ke MySQL yang sudah ada
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',        // Sesuaikan dengan user MySQL Anda
  password: '',        // Sesuaikan dengan password MySQL Anda
  database: 'campus_blood_emergency',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true    // tanggal dikirim sebagai teks 'YYYY-MM-DD'
});

// Cek input berupa teks yang tidak kosong
function isTeks(nilai) {
  return typeof nilai === 'string' && nilai.trim() !== '';
}

// Middleware verifikasi JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Akses ditolak, token tidak ditemukan.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token tidak valid atau kedaluwarsa.' });
    req.user = user;
    next();
  });
}

// 1. POST /api/register -> Daftar akun baru ke tabel `users`
app.post('/api/register', async (req, res) => {
  const { email_kampus, password } = req.body || {};

  if (!isTeks(email_kampus) || !isTeks(password)) {
    return res.status(400).json({ message: 'Email kampus dan password wajib diisi.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password minimal 6 karakter.' });
  }

  try {
    // Cek apakah email sudah terdaftar
    const [existing] = await pool.execute(
      'SELECT id_user FROM users WHERE email_kampus = ?',
      [email_kampus.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email kampus sudah terdaftar. Silakan masuk.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan ke tabel users
    const [result] = await pool.execute(
      'INSERT INTO users (email_kampus, password) VALUES (?, ?)',
      [email_kampus.trim(), hashedPassword]
    );

    const token = jwt.sign(
      { id_user: result.insertId, email_kampus: email_kampus.trim() },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Registrasi berhasil!',
      token,
      user: { id_user: result.insertId, email_kampus: email_kampus.trim() },
      hasProfile: false
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// 2. POST /api/login -> Autentikasi ke `users` & cek profil di `pendonor`
app.post('/api/login', async (req, res) => {
  const { email_kampus, password } = req.body || {};

  if (!isTeks(email_kampus) || !isTeks(password)) {
    return res.status(400).json({ message: 'Email kampus dan password wajib diisi.' });
  }

  try {
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email_kampus = ?',
      [email_kampus.trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Email kampus atau password salah.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Email kampus atau password salah.' });
    }

    // Cek apakah profil pendonor sudah ada
    const [pendonorRows] = await pool.execute(
      'SELECT * FROM pendonor WHERE user_id = ?',
      [user.id_user]
    );

    const token = jwt.sign(
      { id_user: user.id_user, email_kampus: user.email_kampus },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login berhasil!',
      token,
      user: { id_user: user.id_user, email_kampus: user.email_kampus },
      hasProfile: pendonorRows.length > 0,
      profil: pendonorRows[0] || null
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// 3. GET /api/profil -> Ambil data pendonor milik user yang sedang login
app.get('/api/profil', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM pendonor WHERE user_id = ?',
      [req.user.id_user]
    );

    if (rows.length === 0) {
      return res.json({ hasProfile: false, profil: null });
    }

    res.json({ hasProfile: true, profil: rows[0] });
  } catch (error) {
    console.error('Get profil error:', error);
    res.status(500).json({ message: 'Gagal mengambil data profil.' });
  }
});

// 4. POST /api/profil -> Simpan (INSERT) atau Perbarui (UPDATE) data di tabel `pendonor`
app.post('/api/profil', authenticateToken, async (req, res) => {
  const {
    nama_lengkap,
    nim_id_civitas,
    no_telepon,
    fakultas_unit,
    golongan_darah,
    bersedia_donor
  } = req.body || {};

  if (![nama_lengkap, nim_id_civitas, no_telepon, fakultas_unit].every(isTeks)) {
    return res.status(400).json({ message: 'Semua kolom identitas wajib diisi.' });
  }

  const validGolongan = ['A', 'B', 'AB', 'O', 'Belum Tahu'];
  const goldar = validGolongan.includes(golongan_darah) ? golongan_darah : 'Belum Tahu';
  const bersedia = bersedia_donor ? 1 : 0;

  try {
    const [existing] = await pool.execute(
      'SELECT id_pendonor FROM pendonor WHERE user_id = ?',
      [req.user.id_user]
    );

    if (existing.length > 0) {
      // Update profil yang sudah ada
      await pool.execute(
        `UPDATE pendonor 
         SET nama_lengkap = ?, nim_id_civitas = ?, no_telepon = ?, 
             fakultas_unit = ?, golongan_darah = ?, bersedia_donor = ?, update_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [nama_lengkap.trim(), nim_id_civitas.trim(), no_telepon.trim(), fakultas_unit.trim(), goldar, bersedia, req.user.id_user]
      );
    } else {
      // Insert profil baru
      await pool.execute(
        `INSERT INTO pendonor 
         (user_id, nama_lengkap, nim_id_civitas, no_telepon, fakultas_unit, golongan_darah, bersedia_donor) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id_user, nama_lengkap.trim(), nim_id_civitas.trim(), no_telepon.trim(), fakultas_unit.trim(), goldar, bersedia]
      );
    }

    const [updated] = await pool.execute(
      'SELECT * FROM pendonor WHERE user_id = ?',
      [req.user.id_user]
    );

    res.json({
      message: 'Profil pendonor berhasil disimpan',
      profil: updated[0]
    });
  } catch (error) {
    console.error('Save profil error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'NIM / ID Civitas sudah terdaftar pada akun lain.' });
    }
    res.status(500).json({ message: 'Gagal menyimpan profil pendonor.' });
  }
});

// 5. GET /api/jadwal -> Daftar jadwal mendatang, sisa kuota, dan status pendaftaran user
app.get('/api/jadwal', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT j.id_jadwal, j.lokasi, j.tanggal, j.jam_mulai, j.jam_selesai, j.penyelenggara, j.kuota,
              GREATEST(j.kuota - COUNT(p.id_pendaftaran), 0) AS sisa_kuota,
              COALESCE(MAX(p.user_id = ?), 0) AS sudah_daftar
       FROM jadwal_donor j
       LEFT JOIN pendaftaran_donor p ON p.jadwal_id = j.id_jadwal AND p.status <> 'batal'
       WHERE j.tanggal >= CURDATE()
       GROUP BY j.id_jadwal
       ORDER BY j.tanggal, j.jam_mulai`,
      [req.user.id_user]
    );
    res.json({ jadwal: rows });
  } catch (error) {
    console.error('Get jadwal error:', error);
    res.status(500).json({ message: 'Gagal mengambil jadwal donor.' });
  }
});

// 6. POST /api/jadwal/:id/daftar -> Daftar ke satu jadwal donor
app.post('/api/jadwal/:id/daftar', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const gagal = async (status, message) => {
      await conn.rollback();
      return res.status(status).json({ message });
    };

    // FOR UPDATE mengunci baris jadwal agar kuota tidak terlewati saat daftar bersamaan
    const [jadwal] = await conn.execute(
      'SELECT kuota, tanggal >= CURDATE() AS masih_buka FROM jadwal_donor WHERE id_jadwal = ? FOR UPDATE',
      [req.params.id]
    );
    if (jadwal.length === 0) return await gagal(404, 'Jadwal tidak ditemukan.');
    if (!jadwal[0].masih_buka) return await gagal(400, 'Jadwal ini sudah lewat.');

    const [profil] = await conn.execute(
      'SELECT bersedia_donor FROM pendonor WHERE user_id = ?',
      [req.user.id_user]
    );
    if (profil.length === 0) return await gagal(400, 'Lengkapi profil pendonor terlebih dahulu.');
    if (!profil[0].bersedia_donor) return await gagal(400, 'Aktifkan status bersedia donor di profil Anda.');

    const [lama] = await conn.execute(
      'SELECT status FROM pendaftaran_donor WHERE user_id = ? AND jadwal_id = ? FOR UPDATE',
      [req.user.id_user, req.params.id]
    );
    if (lama.length > 0 && lama[0].status !== 'batal') {
      return await gagal(409, 'Anda sudah terdaftar di jadwal ini.');
    }

    const [[{ terisi }]] = await conn.execute(
      "SELECT COUNT(*) AS terisi FROM pendaftaran_donor WHERE jadwal_id = ? AND status <> 'batal' FOR UPDATE",
      [req.params.id]
    );
    if (terisi >= jadwal[0].kuota) return await gagal(409, 'Kuota jadwal ini sudah penuh.');

    await conn.execute(
      `INSERT INTO pendaftaran_donor (user_id, jadwal_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE status = 'terdaftar'`,
      [req.user.id_user, req.params.id]
    );
    await conn.commit();
    res.status(201).json({ message: 'Pendaftaran donor berhasil.' });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error('Daftar jadwal error:', error);
    res.status(500).json({ message: 'Gagal mendaftar jadwal donor.' });
  } finally {
    if (conn) conn.release();
  }
});

// 7. DELETE /api/jadwal/:id/daftar -> Batalkan pendaftaran
app.delete('/api/jadwal/:id/daftar', authenticateToken, async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE pendaftaran_donor p
       JOIN jadwal_donor j ON j.id_jadwal = p.jadwal_id
       SET p.status = 'batal'
       WHERE p.user_id = ? AND p.jadwal_id = ? AND p.status = 'terdaftar' AND j.tanggal >= CURDATE()`,
      [req.user.id_user, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Tidak ada pendaftaran yang bisa dibatalkan.' });
    }
    res.json({ message: 'Pendaftaran dibatalkan.' });
  } catch (error) {
    console.error('Batal jadwal error:', error);
    res.status(500).json({ message: 'Gagal membatalkan pendaftaran.' });
  }
});

// 8. GET /api/riwayat -> Semua pendaftaran milik user (terdaftar, selesai, batal)
app.get('/api/riwayat', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.id_pendaftaran, p.status, j.id_jadwal, j.lokasi, j.tanggal,
              j.jam_mulai, j.jam_selesai, j.penyelenggara
       FROM pendaftaran_donor p
       JOIN jadwal_donor j ON j.id_jadwal = p.jadwal_id
       WHERE p.user_id = ?
       ORDER BY j.tanggal DESC, j.jam_mulai DESC`,
      [req.user.id_user]
    );
    res.json({ riwayat: rows });
  } catch (error) {
    console.error('Get riwayat error:', error);
    res.status(500).json({ message: 'Gagal mengambil riwayat donor.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server Campus Blood Emergency berjalan di http://localhost:${PORT}`);
});