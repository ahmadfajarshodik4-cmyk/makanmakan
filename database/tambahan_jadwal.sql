-- Tabel jadwal donor dan pendaftarannya
CREATE TABLE IF NOT EXISTS `jadwal_donor` (
  `id_jadwal` int NOT NULL AUTO_INCREMENT,
  `lokasi` varchar(150) NOT NULL,
  `tanggal` date NOT NULL,
  `jam_mulai` time NOT NULL,
  `jam_selesai` time NOT NULL,
  `penyelenggara` varchar(100) NOT NULL,
  `kuota` int NOT NULL DEFAULT '50',
  PRIMARY KEY (`id_jadwal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pendaftaran_donor` (
  `id_pendaftaran` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `jadwal_id` int NOT NULL,
  `status` enum('terdaftar','selesai','batal') NOT NULL DEFAULT 'terdaftar',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_pendaftaran`),
  UNIQUE KEY `user_jadwal` (`user_id`,`jadwal_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id_user`) ON DELETE CASCADE,
  FOREIGN KEY (`jadwal_id`) REFERENCES `jadwal_donor` (`id_jadwal`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Data contoh (diambil dari tampilan; kuota 50 hanya contoh)
INSERT IGNORE INTO `jadwal_donor`
  (`id_jadwal`, `lokasi`, `tanggal`, `jam_mulai`, `jam_selesai`, `penyelenggara`, `kuota`) VALUES
  (1, 'Aula Utama Rektorat', '2026-12-03', '09:00', '14:00', 'PMI Kota', 50),
  (2, 'Gedung Student Center Lt. 1', '2026-12-14', '08:30', '13:00', 'KSR Kampus', 50);
