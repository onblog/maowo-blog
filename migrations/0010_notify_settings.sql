-- 信鸽（pigeon）通知配置：单行表（id 恒为 1）。
--
-- 为什么单独一张表而不是往 site 里加列：site 行会被 getSite() 整行读出并透传给
-- 前台页面（layout / seo / 侧栏都要它）。Token 一旦混进这行，任何一次「把 site 打印出来」
-- 的调试或模板改动都可能把它带到公开页面上。单独一张表、只由后台接口按需读取，
-- 泄密面小得多。
--
-- 语义：endpoint 与 token 都非空 = 通知开启；任一为空 = 关闭。
-- 没有独立的 enabled 列 —— 两个字段就是开关本身，少一个可能互相矛盾的状态。
--
-- 地址为什么不写死在代码里：仓库规范要求「代码里绝不出现真实域名」，
-- 换域名 / 换实例只改后台，不必重新部署。
CREATE TABLE IF NOT EXISTS notify_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  -- 信鸽实例的基地址（https，不带尾斜杠），实际请求发往 <endpoint>/api/v1/notify
  endpoint TEXT NOT NULL DEFAULT '',
  -- 信鸽控制台创建的 API Token（pg_…）。只存明文，不做可逆编码——后台按需打码展示，
  -- 页面不返回明文；这是「能直接 curl 复现」的运维便利与泄露风险之间的取舍。
  token TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
