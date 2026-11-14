# Emby 规则集（模板）

给 Emby 用的 Loon 规则订阅模板，只含骨架和写法示例，具体规则自行补充。

- 订阅地址：`https://raw.githubusercontent.com/DuoJLa/Loon/main/emby/Emby.list`
- 一键导入：[Loon 规则集](https://www.nsloon.com/openloon/import?rules=https%3A%2F%2Fraw.githubusercontent.com%2FDuoJLa%2FLoon%2Fmain%2Femby%2FEmby.list)

## 接入方式

Loon → 配置 → 规则 → 订阅规则，粘贴地址并在末尾用英文逗号追加默认策略：

```ini
https://raw.githubusercontent.com/DuoJLa/Loon/main/emby/Emby.list,PROXY
```

自建服务器在国内、只想内网直连的，把 `PROXY` 换成 `DIRECT`。

## 文件说明

- 每行一条规则：`规则类型,参数[,策略][,no-resolve]`；不写策略则沿用订阅行的策略。
- `#` 开头为注释行；空行忽略。
- 默认已带三条局域网直连（RFC1918 与 IPv6 ULA），不需要可删。
- 规则来源优先级：本地规则 > 插件规则 > 订阅规则，同名规则被本地覆盖即可。

## 常用写法

| 场景 | 写法 |
| --- | --- |
| 自有域名及子域 | `DOMAIN-SUFFIX,emby.example.com,PROXY` |
| 单个主机 | `DOMAIN,media.example.com,PROXY` |
| 域名关键词 | `DOMAIN-KEYWORD,emby,PROXY` |
| 通配符（build 1008+） | `DOMAIN-WILDCARD,*.emby.example.com,PROXY` |
| 固定服务器 IP | `IP-CIDR,203.0.113.10/32,PROXY,no-resolve` |
| 按端口兜底（3.1.7+，Emby 默认 8096/8920） | `DEST-PORT,8096,PROXY` |

域名类规则优先于 IP 规则；纯 IP 规则建议加 `no-resolve`，避免额外 DNS 查询。
