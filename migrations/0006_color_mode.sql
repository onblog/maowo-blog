-- 形态切换（cute / minimal）取消：视觉只有一套，作者只需要决定**颜色模式**。
-- light / dark / auto（auto = 跟随读者系统）。
ALTER TABLE site ADD COLUMN color_mode TEXT NOT NULL DEFAULT 'auto';

UPDATE site SET color_mode = 'auto';

ALTER TABLE site DROP COLUMN theme;
