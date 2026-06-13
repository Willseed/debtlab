INSERT INTO easter_eggs (id, code, name, description, trigger_type, trigger_value, is_enabled)
VALUES
  (
    'egg_konami_gold_cockpit',
    'konami_gold_cockpit',
    'Gold Cockpit Mode',
    'Enhanced gold dashboard border unlocked by the Konami code.',
    'konami_code',
    'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,KeyB,KeyA',
    1
  ),
  (
    'egg_midnight_lab_mode',
    'midnight_lab_mode',
    'Night Shift Survivor',
    'Unlocked when a member creates an expense between 00:00 and 03:59 local time.',
    'time_window',
    '00:00-03:59',
    1
  ),
  (
    'egg_hidden_garage',
    'hidden_garage',
    'Hidden Garage',
    'Hidden lab spending dashboard route.',
    'hidden_route',
    '/garage',
    1
  )
ON CONFLICT(code) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  trigger_type = excluded.trigger_type,
  trigger_value = excluded.trigger_value,
  is_enabled = excluded.is_enabled;
