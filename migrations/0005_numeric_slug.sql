-- 文章地址统一为纯数字（创建时刻的 Unix 毫秒）。
-- 旧规则是「标题转写」，中文标题会变成一串中文，长短不一、还随标题变动。
-- created_at 本身就是毫秒整数，直接字符串化就是 13 位数字且天然唯一。
UPDATE posts SET slug = CAST(created_at AS TEXT) WHERE slug GLOB '*[^0-9]*';
