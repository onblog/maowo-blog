-- 站点语言在部署时由 SITE_LOCALE 定死，站名/签名/简介/SEO 描述不再需要中英两套。
-- 回填优先级：中文列非空取中文，否则取英文，最后给默认值。

ALTER TABLE site ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE site ADD COLUMN tagline TEXT NOT NULL DEFAULT '';
ALTER TABLE site ADD COLUMN owner_bio TEXT NOT NULL DEFAULT '';
ALTER TABLE site ADD COLUMN seo_description TEXT NOT NULL DEFAULT '';

UPDATE site SET
  name = COALESCE(NULLIF(name_zh, ''), NULLIF(name_en, ''), '猫窝博客'),
  tagline = COALESCE(NULLIF(tagline_zh, ''), NULLIF(tagline_en, ''), ''),
  owner_bio = COALESCE(NULLIF(owner_bio_zh, ''), NULLIF(owner_bio_en, ''), ''),
  seo_description = COALESCE(NULLIF(seo_description_zh, ''), NULLIF(seo_description_en, ''), '');

ALTER TABLE site DROP COLUMN name_zh;
ALTER TABLE site DROP COLUMN name_en;
ALTER TABLE site DROP COLUMN tagline_zh;
ALTER TABLE site DROP COLUMN tagline_en;
ALTER TABLE site DROP COLUMN owner_bio_zh;
ALTER TABLE site DROP COLUMN owner_bio_en;
ALTER TABLE site DROP COLUMN seo_description_zh;
ALTER TABLE site DROP COLUMN seo_description_en;
