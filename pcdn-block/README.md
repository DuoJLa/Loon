# PCDN Block · Loon 规则集

屏蔽 Bilibili PCDN、Bilibili 遥测及其他 PCDN 域名。共 78 条规则，统一使用 `REJECT` 策略。

## 一键导入

[Loon 规则集](https://www.nsloon.com/openloon/import?rules=https%3A%2F%2Fraw.githubusercontent.com%2FDuoJLa%2FLoon%2Fmain%2Fpcdn-block%2FPCDN-Block.list)

## 手动订阅

在 Loon 的「配置 → 规则 → 规则订阅」中添加：

```text
https://raw.githubusercontent.com/DuoJLa/Loon/main/pcdn-block/PCDN-Block.list
```

## 来源

原始规则：<https://pastebin.com/cyKBv0qK>

已补充 Loon 规则所需的 `REJECT` 策略，并移除重复的 `DOMAIN-SUFFIX,zhenxyun.cn` 规则。规则会拦截 Bilibili 的 PCDN 和遥测请求，可能影响相关功能，请按需启用。
