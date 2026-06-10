-- Dev seed. Creates a fixture user (dev@local / tackdev123) plus a board
-- with 3 example placements. Sign in with those creds at http://localhost:5173.
--
-- Password hash: PBKDF2-SHA256, 600k iters, deterministic salt — same algorithm
-- as services/auth.ts:hashPassword. Regenerate with that function for a
-- different password.
INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES
  ('user-dev', 'dev@local', 'pbkdf2$600000$AQIDBAUGBwgJCgsMDQ4PEA$KhEG1BgRYW-FaFaZeQcAWhnE5RWxF7A5CGUzg3X48KQ', 1749168000, 1749168000);

INSERT INTO boards (id, owner_id, name, created_at, updated_at) VALUES
  ('board-1', 'user-dev', 'My Moodboard', 1749168000, 1749168000);

-- Placements carry their own metadata + images post-fold (migration 0009).
-- `added_by` is informational attribution, not a security boundary.
INSERT INTO board_items (
  id, board_id, added_by, source_url, title, brand, price, currency,
  x, y, width, height, z_index, created_at, updated_at
) VALUES
  ('bi-1', 'board-1', 'user-dev', 'https://example.com/linen-overshirt',  'Linen Overshirt',   NULL, 128.00, 'USD',  80,  80, 220, 400, 0, 1749168000, 1749168000),
  ('bi-2', 'board-1', 'user-dev', 'https://example.com/wide-leg-trousers', 'Wide-Leg Trousers', NULL, 215.00, 'USD', 340, 120, 220, 400, 0, 1749168000, 1749168000),
  ('bi-3', 'board-1', 'user-dev', 'https://example.com/leather-tote',     'Leather Tote',      NULL, 340.00, 'USD', 600,  60, 220, 400, 0, 1749168000, 1749168000);

INSERT INTO board_item_images (id, board_item_id, r2_key, source_url, display_order, created_at, updated_at) VALUES
  ('img-1', 'bi-1', 'items/user-dev/img-1.jpg', 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=300&h=400&fit=crop&auto=format', 0, 1749168000, 1749168000),
  ('img-2', 'bi-2', 'items/user-dev/img-2.jpg', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=300&h=400&fit=crop&auto=format', 0, 1749168000, 1749168000),
  ('img-3', 'bi-3', 'items/user-dev/img-3.jpg', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&h=400&fit=crop&auto=format', 0, 1749168000, 1749168000);
