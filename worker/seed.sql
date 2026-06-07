INSERT INTO boards (id, name, created_at) VALUES
  ('board-1', 'My Moodboard', 1749168000);

INSERT INTO items (id, source_url, title, brand, price, currency, created_at, updated_at) VALUES
  ('item-1', 'https://picsum.photos/seed/shirt/300/400',  'Linen Overshirt',    NULL, 128.00, 'USD', 1749168000, 1749168000),
  ('item-2', 'https://picsum.photos/seed/pants/300/400', 'Wide-Leg Trousers',  NULL, 215.00, 'USD', 1749168000, 1749168000),
  ('item-3', 'https://picsum.photos/seed/bag/300/400',   'Leather Tote',       NULL, 340.00, 'USD', 1749168000, 1749168000);

INSERT INTO item_images (id, item_id, r2_key, source_url, display_order, created_at) VALUES
  ('img-1', 'item-1', 'items/item-1/img-1.jpg', 'https://picsum.photos/seed/shirt/300/400', 0, 1749168000),
  ('img-2', 'item-2', 'items/item-2/img-2.jpg', 'https://picsum.photos/seed/pants/300/400', 0, 1749168000),
  ('img-3', 'item-3', 'items/item-3/img-3.jpg', 'https://picsum.photos/seed/bag/300/400',   0, 1749168000);

INSERT INTO board_items (id, board_id, item_id, x, y, width, height, z_index, created_at, updated_at) VALUES
  ('bi-1', 'board-1', 'item-1', 80,  80,  220, 400, 0, 1749168000, 1749168000),
  ('bi-2', 'board-1', 'item-2', 340, 120, 220, 400, 0, 1749168000, 1749168000),
  ('bi-3', 'board-1', 'item-3', 600, 60,  220, 400, 0, 1749168000, 1749168000);
