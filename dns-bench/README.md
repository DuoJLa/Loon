# DNS Bench · Loon 插件

DNS 服务器延迟测速工具,内置 23 台国内外 DNS(含 IPv6 与 DoH/DoH3/DoQ),本地 WebUI 展示与策略组切换。

## 功能

- 🚀 一键测速:逐台真实 DNS 查询,多轮取最小延迟(默认 3 轮,可调 1/2/3/5)
- 🌍 23 台服务器:阿里/腾讯/字节/114/百度(国内),Google/Cloudflare/Quad9/AdGuard/OpenDNS/DNS.SB(国际)
- 🔀 IPv6 完整支持:`[2400:3200::1]:53` 等原生 v6 服务器
- 🔐 加密 DNS:DoH / DoH3 / DoQ
- 🖥️ 本地 WebUI:延迟条颜色分级、筛选(国内/国际/IPv6/加密)、测速完成自动排序、一键复制服务器地址
- 📡 策略组切换:WebUI 内直接切换测速出网策略组

## 使用

1. Loon Build 988+ (依赖 `$dns.query`)
2. 安装插件(一键订阅,见下方链接)
3. 将脚本 `dns-bench.js` 保持在插件同目录(远程插件会自动下载脚本)
4. 主配置需存在名为「DNS 测速」的策略组(或在插件参数中修改为自己的组名)
5. 浏览器打开 `http://dns.bench.local` 进入 WebUI

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| policy_group | DNS 测速 | 测速流量出网使用的策略组名称 |
| rounds | 3 | 每台 DNS 测试轮数,取最小值 |

## 一键安装

Loon 中打开: `loon://import?sub=https://raw.githubusercontent.com/DuoJLa/LoonPlugin/main/dns-bench/DNSBench.plugin`
