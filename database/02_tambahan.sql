ALTER TABLE users
  ADD role ENUM('pendonor','admin') NOT NULL DEFAULT 'pendonor';

ALTER TABLE pendonor
  ADD rhesus ENUM('+','-','Belum Tahu') NOT NULL DEFAULT 'Belum Tahu' AFTER golongan_darah,
  MODIFY bersedia_donor TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE pendonor
  CHANGE update_at updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE jadwal_donor (
  id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
  judul VARCHAR(150) NOT NULL,
  lokasi VARCHAR(150) NOT NULL,
  waktu_mulai DATETIME NOT NULL,
  waktu_selesai DATETIME NOT NULL,
  kuota INT NOT NULL DEFAULT 0
);

CREATE TABLE pendaftaran_donor (
  id_pendaftaran INT AUTO_INCREMENT PRIMARY KEY,
  id_pendonor INT NOT NULL,
  id_jadwal INT NOT NULL,
  status ENUM('terdaftar','selesai','batal') NOT NULL DEFAULT 'terdaftar',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_pendonor, id_jadwal),
  FOREIGN KEY (id_pendonor) REFERENCES pendonor(id_pendonor) ON DELETE CASCADE,
  FOREIGN KEY (id_jadwal) REFERENCES jadwal_donor(id_jadwal)
);

CREATE TABLE permintaan_darurat (
  id_permintaan INT AUTO_INCREMENT PRIMARY KEY,
  id_user INT NOT NULL,
  golongan_darah ENUM('A','B','AB','O') NOT NULL,
  rhesus ENUM('+','-') NOT NULL,
  jumlah_kantong INT NOT NULL,
  lokasi VARCHAR(150) NOT NULL,
  kontak VARCHAR(20) NOT NULL,
  status ENUM('aktif','terpenuhi','batal') NOT NULL DEFAULT 'aktif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
);

INSERT INTO jadwal_donor (judul, lokasi, waktu_mulai, waktu_selesai, kuota) VALUES
('Donor Darah Kampus (contoh)', 'Aula Utama', DATE_ADD(CURDATE(), INTERVAL '14 09' DAY_HOUR), DATE_ADD(CURDATE(), INTERVAL '14 14' DAY_HOUR), 50);
