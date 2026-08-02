# 腾讯云部署（与 beproj 共存，CRM 端口 3001）

## 安全组

- 放行 TCP **3001**（CRM 直连，过渡期）
- 放行 TCP **80** / **443**（`crm.pynntech.com` Nginx 反代）——**正式 HTTPS 必须放行 443**
- **80 端口 beproj 勿动**

## Nginx 上传限制

CRM 站点（`/etc/nginx/sites-available/crm.pynntech.com`）须设置：

```nginx
client_max_body_size 25m;
```

（应用侧上限 20MB；Nginx 默认仅 1m，未配置时企微/浏览器上传稍大文件会 HTTP 413。）
修改后：`sudo nginx -t && sudo systemctl reload nginx`。

## 部署命令

```bash
./scripts/deploy-tencent.sh ubuntu@122.51.86.223 "/path/to/Pynn.pem"
```

部署脚本**不会覆盖**远端已有 `.env.production`。若改域名/HTTPS，需单独改 `NEXTAUTH_URL` 后：

```bash
cd /home/ubuntu/hospital-crm-pm
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml up -d --force-recreate app
```

## 当前状态（2026-07-15）

| 项 | 状态 |
|----|------|
| CRM 服务 | Docker `hospital-crm-app-1` 在跑，宿主机 `3001→3000` |
| 域名 `crm.pynntech.com` DNS | 阿里云 A 记录 → `122.51.86.223` |
| Nginx HTTP | 已配置；访问 80 会 **301 → HTTPS** |
| HTTPS 证书 | Let's Encrypt 已签发（至 2026-10-13），`certbot.timer` 自动续期 |
| Nginx HTTPS | `listen 443 ssl` 已启用；本机 `https://127.0.0.1` + Host 头测 **/login = 200** |
| 外网 443 | 安全组已放行；`https://crm.pynntech.com/login` = 200 |
| 腾讯云接入备案 | 已通过 |
| `NEXTAUTH_URL` | `https://crm.pynntech.com`（容器内已生效） |

---

## 线上部署成功后 — 待测清单

> 以下在外网 `https://crm.pynntech.com` 可达后验证。

### 1. 企微扫码登录全流程（优先）

- [ ] 登录页展示企微二维码（`WECOM_*` 环境变量已配置）
- [ ] PC 浏览器扫码 → OAuth 回调成功
- [ ] **未绑定用户** → 跳转申请页 `/mobile/wecom/unbound`
- [ ] 填写姓名/邮箱 → 提交开通申请
- [ ] 管理员：**系统设置 → 企业微信 → 企微开通申请** → 批准并分配角色
- [ ] **再次扫码** → 自动登录进入 `/today-work`
- [ ] 企微内打开应用 → 静默 OAuth 登录
- [ ] 企微应用主页：`https://crm.pynntech.com/wecom-entry.html`（**禁止**填 IP 如 `http://122.51.86.223:3001/...`）
- [ ] 推荐落地消息列表：`returnTo=/mobile/inbox`
- [ ] OAuth 回调域：`crm.pynntech.com`

### 2. 生产环境配置

- [x] `NEXTAUTH_URL=https://crm.pynntech.com`
- [ ] 企微后台可信域名 / JS 安全域名
- [ ] AI Key、高德 Key（管理后台或 `.env.production`）
- [x] 安全组 **443** 已放行

### 3. 核心业务冒烟

- [ ] 邮箱密码登录（请在浏览器打开站点确认）
- [ ] 今日工作 / 销售日志 / 打卡定位
- [ ] 客户、商机、合同、日报

---

## 备案通过后操作

1. [x] 申请 Let's Encrypt 证书并开启 HTTPS（Nginx + certbot）
2. [x] 更新 `NEXTAUTH_URL` 并重启容器
3. [x] 腾讯云安全组放行 TCP 443
4. [x] 外网 `https://crm.pynntech.com/login` = 200（Let's Encrypt 证书有效至 2026-10-13）
5. [ ] 企微扫码登录全流程（需配置 `WECOM_*` 与企微后台域名）
