# P6.2 回放契约与兼容性

独立连续采样是新增需求，不能改写Match或稀疏Spatial语义。影响match-model、dem-parser、
report-contract和Desktop；Analytics/Findings/Deep Review仅继续使用原Match+Spatial。
原parse()/parseWithSpatial()及报告schema v2保持，新增显式parseWithReplay()入口与独立schema v1。
report-contract新增可选replay会话描述，不修改原报告字段/旧消费者。

领域Replay包含内容身份、schema/采样版本、精确requested/actual tick状态、逐玩家连续segment、
回合窗口、精确事件引用与coverage。只有dem-parser内部adapter查询native，单次读取与基础查询共享，
独立8 Hz回放预算不裁剪稀疏证据。Unknown clock仅保留事件tick，不编造秒数或倍速。

显示插值不进入领域/Analytics。sample仅表示native该tick最终状态；same-tick生命周期冲突明确歧义。
缺失位置/状态、死亡、spawn、disconnect、side_change、回合和超间隔均切断segment。
Utility仅保留已验证生效点；不表示轨迹或区域。Bomb事件在Utility Process投影，未知位置保持null。

Utility会话缓存按内容SHA/schema/解析器采样版本/地图资源身份隔离；最多64MiB序列化内容，
固定请求tick≤60000。按回合、最长20秒分块，超过1MiB继续拆分。每块含边界frame，
各frame是完整独立状态（含炸弹基线），随机seek不从比赛开头重播。Renderer最多缓存3块。
只有当前窗口主frame、当前会话和该会话登记的回合/块可请求；旧会话/过期返回被拒绝。
重新导入实际开始、取消解析、释放和窗口关闭终止旧worker并清空会话；取消文件对话框保留原会话。
成功报告后worker持久保留至会话结束；回放错误独立降级，报告仍可用。

本契约为additive变更，不迁移历史缓存（仅会话缓存）。安装版必须同时构建同一版本Main/preload/Renderer。
