-- One-off: replace UUID-with-dashes IDs from initial user-added items with nanoid IDs.
-- Strategy (FKs stay on): clone parent row under new id, reparent children, delete old parent.
-- The DELETE on the old items row finds no children left to cascade.

-- Blouson
INSERT INTO items (id, source_url, title, brand, description, price, currency, created_at, updated_at)
  SELECT 'mbSpUjii7ZxdY3Lg1A4IP', source_url, title, brand, description, price, currency, created_at, updated_at
    FROM items WHERE id = 'd196dc60-6392-4c67-bf3a-1f8c81d66295';
UPDATE board_items SET item_id = 'mbSpUjii7ZxdY3Lg1A4IP'
  WHERE item_id = 'd196dc60-6392-4c67-bf3a-1f8c81d66295';
UPDATE item_images SET item_id = 'mbSpUjii7ZxdY3Lg1A4IP'
  WHERE item_id = 'd196dc60-6392-4c67-bf3a-1f8c81d66295';
DELETE FROM items WHERE id = 'd196dc60-6392-4c67-bf3a-1f8c81d66295';

-- Bag
INSERT INTO items (id, source_url, title, brand, description, price, currency, created_at, updated_at)
  SELECT 'RGSLL9ydxSuEVxXbZD5m9', source_url, title, brand, description, price, currency, created_at, updated_at
    FROM items WHERE id = 'b9290543-3c7d-4dca-9e4c-b6a34d0e48ee';
UPDATE board_items SET item_id = 'RGSLL9ydxSuEVxXbZD5m9'
  WHERE item_id = 'b9290543-3c7d-4dca-9e4c-b6a34d0e48ee';
UPDATE item_images SET item_id = 'RGSLL9ydxSuEVxXbZD5m9'
  WHERE item_id = 'b9290543-3c7d-4dca-9e4c-b6a34d0e48ee';
DELETE FROM items WHERE id = 'b9290543-3c7d-4dca-9e4c-b6a34d0e48ee';

-- Rename board_items rows themselves (no FK targets these)
UPDATE board_items SET id = 'U8BrWLUDdUTUWeWVMps9L'
  WHERE id = '99c0a0a1-4b1b-41eb-b24b-9e51f4759a80';
UPDATE board_items SET id = 'YWRezlLTEz9j21zYItWsp'
  WHERE id = 'a9c00a9b-0b14-4c53-8383-1ccbf9f3285d';
