# 腾讯云部署（与 beproj 共存，CRM 端口 3001）

## 安全组

- 放行 TCP **3001**（CRM 直连，过渡期）
- 放行 TCP **80** / **443**（`crm.pynntech.com` Nginx 反代）
- **80 端口 beproj 勿动**

## 部署命令

```bash
./scripts/deploy-tencent.sh ubuntu@122.51.86.223 "/path/to/Pynn.pem"
```

## 当前状态（2026-07）

| 项 | 状态 |
|----|------|
| CRM 服务 | `http://122.51.86.223:3001` 可用 |
| 域名 `crm.pynntech.com` DNS | 阿里云 A 记录 → `122.51.86.223` |
| Nginx 反代 | 已配置（服务器本机可访问） |
| HTTPS | 待备案接入通过后申请证书 |
| 腾讯云接入备案 | 审核中（订单见备案控制台） |
| `NEXTAUTH_URL` | 备案+HTTPS 后改为 `https://crm.pynntech.com` |

---

## 线上部署成功后 — 待测清单

> 以下功能代码已实现，**需等 `https://crm.pynntech.com` 可用后再测**。

### 1. 企微扫码登录全流程（优先）

- [ ] 登录页展示企微二维码（`WECOM_*` 环境变量已配置）
- [ ] PC 浏览器扫码 → OAuth 回调成功
- [ ] **未绑定用户** → 跳转申请页 `/mobile/wecom/unbound`
- [ ] 填写姓名/邮箱 → 提交开通申请
- [ ] 管理员：**系统设置 → 企业微信 → 企微开通申请** → 批准并分配角色
- [ ] **再次扫码** → 自动登录进入 `/today-work`
- [ ] 企微内打开应用 → 静默 OAuth 登录
- [ ] 企微应用主页：`https://crm.pynntech.com/today-work`
- [ ] OAuth 回调域：`crm.pynntech.com`

### 2. 生产环境配置

- [ ] `NEXTAUTH_URL=https://crm.pynntech.com`
- [ ] 企微后台可信域名 / JS 安全域名
- [ ] AI Key、高德 Key（管理后台或 `.env.production`）
- [ ] 安全组 443 已放行

### 3. 核心业务冒烟

- [ ] 邮箱密码登录
- [ ] 今日工作 / 销售日志 / 打卡定位
- [ ] 客户、商机、合同、日报

---

## 备案通过后联系我方操作

1. 申请 Let's Encrypt 证书并开启 HTTPS
2. 更新 `NEXTAUTH_URL` 并重启容器
3. 协助验证企微扫码登录
