const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'campus_blood_emergency_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use((req, res, next) => { req.body = req.body || {}; next(); });
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Konfigurasi koneksi ke MySQL yang sudah ada
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',        // Sesuaikan dengan user MySQL Anda
  password: '',        // Sesuaikan dengan password MySQL Anda
  database: 'campus_blood_emergency',
  dateStrings: true,   // tanggal dikirim apa adanya (waktu lokal)
  waitForConnections: true,
  connectionLimit: 10
});

// ---------- Helper ----------
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isId = (v) => /^[1-9]\d*$/.test(String(v));

// Error yang pesannya boleh ditampilkan ke pengguna
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Meneruskan error dari route async ke penangan error di bawah
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Hanya admin (role dicek langsung ke database)
const requireAdmin = handle(async (req, res, next) => {
  const [rows] = await pool.execute('SELECT role FROM users WHERE id_user = ?', [req.user.id_user]);
  if (rows[0]?.role !== 'admin') throw new ApiError(403, 'Hanya admin yang boleh melakukan ini.');
  next();
});

async function getPendonor(userId, db = pool) {
  const [rows] = await db.execute('SELECT * FROM pendonor WHERE user_id = ?', [userId]);
  if (!rows[0]) throw new ApiError(400, 'Lengkapi profil pendonor terlebih dahulu.');
  return rows[0];
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
  const { email_kampus, password } = req.body;

  if (!isText(email_kampus) || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Email kampus dan password wajib diisi.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.ac\.id$/i.test(email_kampus.trim())) {
    return res.status(400).json({ message: 'Gunakan email kampus yang berakhiran .ac.id.' });
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
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email kampus sudah terdaftar. Silakan masuk.' });
    }
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// 2. POST /api/login -> Autentikasi ke `users` & cek profil di `pendonor`
app.post('/api/login', async (req, res) => {
  const { email_kampus, password } = req.body;

  if (!isText(email_kampus) || typeof password !== 'string' || !password) {
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
  } = req.body;

  if (![nama_lengkap, nim_id_civitas, no_telepon, fakultas_unit].every(isText)) {
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
             fakultas_unit = ?, golongan_darah = ?, bersedia_donor = ?
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

// ---------- Jadwal donor ----------
app.get('/api/jadwal', authenticateToken, handle(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT j.*, GREATEST(j.kuota - COUNT(p.id_pendaftaran), 0) AS sisa_kuota
     FROM jadwal_donor j
     LEFT JOIN pendaftaran_donor p ON p.id_jadwal = j.id_jadwal AND p.status <> 'batal'
     WHERE j.waktu_selesai >= NOW()
     GROUP BY j.id_jadwal
     ORDER BY j.waktu_mulai`
  );
  res.json({ jadwal: rows.map((r) => ({ ...r, sisa_kuota: Number(r.sisa_kuota) })) });
}));

app.post('/api/jadwal', authenticateToken, requireAdmin, handle(async (req, res) => {
  const { judul, lokasi, waktu_mulai, waktu_selesai, kuota } = req.body;
  const format = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
  const validWaktu = (v) => typeof v === 'string' && format.test(v) && !Number.isNaN(Date.parse(v.replace(' ', 'T')));

  if (!isText(judul) || !isText(lokasi)) throw new ApiError(400, 'Judul dan lokasi wajib diisi.');
  if (!validWaktu(waktu_mulai) || !validWaktu(waktu_selesai) || waktu_selesai <= waktu_mulai) {
    throw new ApiError(400, 'Waktu harus berformat YYYY-MM-DD HH:MM dan selesai setelah mulai.');
  }
  if (!isId(kuota)) throw new ApiError(400, 'Kuota harus angka lebih dari 0.');

  const [result] = await pool.execute(
    'INSERT INTO jadwal_donor (judul, lokasi, waktu_mulai, waktu_selesai, kuota) VALUES (?, ?, ?, ?, ?)',
    [judul.trim(), lokasi.trim(), waktu_mulai, waktu_selesai, Number(kuota)]
  );
  res.status(201).json({ message: 'Jadwal berhasil ditambahkan.', id_jadwal: result.insertId });
}));

// ---------- Pendaftaran & riwayat ----------
app.post('/api/jadwal/:id/daftar', authenticateToken, handle(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(400, 'ID jadwal tidak valid.');

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const pendonor = await getPendonor(req.user.id_user, db);
    if (!pendonor.bersedia_donor) throw new ApiError(400, 'Aktifkan "bersedia menjadi pendonor" di profil.');

    // FOR UPDATE mengunci jadwal agar kuota tidak terlampaui
    const [jadwal] = await db.execute(
      'SELECT kuota FROM jadwal_donor WHERE id_jadwal = ? AND waktu_selesai >= NOW() FOR UPDATE',
      [req.params.id]
    );
    if (!jadwal[0]) throw new ApiError(404, 'Jadwal tidak ditemukan atau sudah lewat.');

    const [lama] = await db.execute(
      'SELECT status FROM pendaftaran_donor WHERE id_pendonor = ? AND id_jadwal = ? FOR UPDATE',
      [pendonor.id_pendonor, req.params.id]
    );
    if (lama[0] && lama[0].status !== 'batal') throw new ApiError(409, 'Kamu sudah terdaftar di jadwal ini.');

    const [terisi] = await db.execute(
      "SELECT COUNT(*) AS n FROM pendaftaran_donor WHERE id_jadwal = ? AND status <> 'batal' FOR UPDATE",
      [req.params.id]
    );
    if (Number(terisi[0].n) >= jadwal[0].kuota) throw new ApiError(409, 'Kuota jadwal sudah penuh.');

    await db.execute(
      `INSERT INTO pendaftaran_donor (id_pendonor, id_jadwal) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE status = 'terdaftar'`,
      [pendonor.id_pendonor, req.params.id]
    );
    await db.commit();
    res.status(201).json({ message: 'Pendaftaran donor berhasil.' });
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}));

app.get('/api/riwayat', authenticateToken, handle(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.id_pendaftaran, p.status, j.id_jadwal, j.judul, j.lokasi, j.waktu_mulai, j.waktu_selesai
     FROM pendaftaran_donor p
     JOIN pendonor d ON d.id_pendonor = p.id_pendonor
     JOIN jadwal_donor j ON j.id_jadwal = p.id_jadwal
     WHERE d.user_id = ?
     ORDER BY j.waktu_mulai DESC`,
    [req.user.id_user]
  );
  res.json({ riwayat: rows });
}));

app.patch('/api/pendaftaran/:id/batal', authenticateToken, handle(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(400, 'ID pendaftaran tidak valid.');
  const [result] = await pool.execute(
    `UPDATE pendaftaran_donor p JOIN pendonor d ON d.id_pendonor = p.id_pendonor
     SET p.status = 'batal'
     WHERE p.id_pendaftaran = ? AND d.user_id = ? AND p.status = 'terdaftar'`,
    [req.params.id, req.user.id_user]
  );
  if (!result.affectedRows) throw new ApiError(404, 'Pendaftaran aktif tidak ditemukan.');
  res.json({ message: 'Pendaftaran dibatalkan.' });
}));

// ---------- Permintaan darah darurat ----------
app.get('/api/darurat', authenticateToken, handle(async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT * FROM permintaan_darurat WHERE status = 'aktif' ORDER BY created_at DESC"
  );
  res.json({ permintaan: rows });
}));

app.post('/api/darurat', authenticateToken, handle(async (req, res) => {
  const { golongan_darah, rhesus, jumlah_kantong, lokasi, kontak } = req.body;

  if (!['A', 'B', 'AB', 'O'].includes(golongan_darah)) throw new ApiError(400, 'Golongan darah harus A, B, AB, atau O.');
  if (!['+', '-'].includes(rhesus)) throw new ApiError(400, 'Rhesus harus + atau -.');
  if (!isId(jumlah_kantong) || Number(jumlah_kantong) > 20) throw new ApiError(400, 'Jumlah kantong harus 1 sampai 20.');
  if (!isText(lokasi)) throw new ApiError(400, 'Lokasi wajib diisi.');
  if (!isText(kontak) || !/^\+?\d{8,15}$/.test(kontak.trim())) throw new ApiError(400, 'Nomor kontak tidak valid.');

  const [result] = await pool.execute(
    `INSERT INTO permintaan_darurat (id_user, golongan_darah, rhesus, jumlah_kantong, lokasi, kontak)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id_user, golongan_darah, rhesus, Number(jumlah_kantong), lokasi.trim(), kontak.trim()]
  );
  res.status(201).json({ message: 'Permintaan darurat terkirim.', id_permintaan: result.insertId });
}));

app.patch('/api/darurat/:id', authenticateToken, handle(async (req, res) => {
  const { status } = req.body;
  if (!isId(req.params.id)) throw new ApiError(400, 'ID permintaan tidak valid.');
  if (!['terpenuhi', 'batal'].includes(status)) throw new ApiError(400, 'Status harus terpenuhi atau batal.');

  const [result] = await pool.execute(
    "UPDATE permintaan_darurat SET status = ? WHERE id_permintaan = ? AND id_user = ? AND status = 'aktif'",
    [status, req.params.id, req.user.id_user]
  );
  if (!result.affectedRows) throw new ApiError(404, 'Permintaan aktif milikmu tidak ditemukan.');
  res.json({ message: 'Status permintaan diperbarui.' });
}));

// ---------- Penanganan error ----------
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan.' }));

app.use((error, req, res, next) => {
  if (error instanceof ApiError) return res.status(error.status).json({ message: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Format JSON tidak valid.' });
  console.error(error);
  if (error.code === 'ECONNREFUSED') return res.status(503).json({ message: 'Database tidak dapat dihubungi.' });
  res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
});

app.listen(PORT, () => {
  console.log(`Server Campus Blood Emergency berjalan di http://localhost:${PORT}`);
});