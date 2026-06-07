INSERT INTO boards (id, name, created_at) VALUES
  ('board-1', 'My Moodboard', 1749168000);

INSERT INTO items (id, source_url, title, brand, price, currency, created_at, updated_at) VALUES
  ('item-1', 'https://example.com/linen-overshirt',  'Linen Overshirt',   NULL, 128.00, 'USD', 1749168000, 1749168000),
  ('item-2', 'https://example.com/wide-leg-trousers','Wide-Leg Trousers', NULL, 215.00, 'USD', 1749168000, 1749168000),
  ('item-3', 'https://example.com/leather-tote',     'Leather Tote',      NULL, 340.00, 'USD', 1749168000, 1749168000);

INSERT INTO item_images (id, item_id, r2_key, source_url, display_order, created_at) VALUES
  ('img-1', 'item-1', 'items/item-1/img-1.jpg', 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=300&h=400&fit=crop&auto=format', 0, 1749168000),
  ('img-2', 'item-2', 'items/item-2/img-2.jpg', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=300&h=400&fit=crop&auto=format', 0, 1749168000),
  ('img-3', 'item-3', 'items/item-3/img-3.jpg', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&h=400&fit=crop&auto=format', 0, 1749168000);

INSERT INTO board_items (id, board_id, item_id, x, y, width, height, z_index, created_at, updated_at) VALUES
  ('bi-1', 'board-1', 'item-1', 80,  80,  220, 400, 0, 1749168000, 1749168000),
  ('bi-2', 'board-1', 'item-2', 340, 120, 220, 400, 0, 1749168000, 1749168000),
  ('bi-3', 'board-1', 'item-3', 600, 60,  220, 400, 0, 1749168000, 1749168000);
