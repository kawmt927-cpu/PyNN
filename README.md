# 培安 CRM + 项目管理系统

医院软件 CRM 与项目管理统一平台。

## 功能模块

- **CRM**：客户、跟进（含面访）、合同、回款
- **项目管理**：项目、阶段、任务、团队
- **销售日志**：手机端 AI Agent 对话采集（PyNN Prompt）
- **人员管理**：销售/实施大类，售前标签
- **成本管理**：销售成本三类 + 项目成本

## 环境要求

- Node.js 20+
- npm 10+

如未安装 Node.js，请访问 https://nodejs.org/ 或使用：

```bash
# macOS (Homebrew)
brew install node

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
```

## 本地开发

```bash
cd ~/Projects/hospital-crm-pm
cp .env.example .env
# 编辑 .env，至少设置 NEXTAUTH_SECRET 和 LLM_API_KEY（销售日志需要）

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

访问 http://localhost:3000

### 默认账号

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@example.com | admin123 |
| 销售管理 | salesmgr@example.com | sales123 |
| 销售 | sales@example.com | sales123 |
| 项目管理员 | projadmin@example.com | proj123 |

## 生产部署（国内云）

见 `docker-compose.prod.yml`，需要：

- ECS 云服务器 + RDS PostgreSQL + OSS
- 环境变量见 `.env.example`

```bash
docker compose -f docker-compose.prod.yml up -d
```

## 企业微信应用

CRM 可嵌入**企业微信自建应用**，支持手机/PC 企微内打开与 PC 浏览器扫码登录。

### 管理后台配置

1. 在企业微信管理后台创建自建应用
2. **应用主页（推荐 · 销售移动端）**：`https://你的域名/mobile`（或静态跳板 `https://你的域名/wecom-entry.html`）
3. **PC 今日工作（可选）**：`https://你的域名/today-work`
4. **可信域名** / **OAuth 回调域** / **JS 接口安全域名**：均填写 CRM 域名
5. 记录 CorpID、AgentId、Secret，写入 `.env`：

```bash
WECOM_CORP_ID="wwxxxxxxxx"
WECOM_AGENT_ID="1000002"
WECOM_SECRET="xxxxxxxx"
NEXTAUTH_URL="https://crm.yourcompany.com"
```

### 登录方式

| 场景 | 方式 |
|------|------|
| PC 浏览器 | 登录页 → 企业微信扫码 |
| 手机 / PC 企微内 | 打开应用自动 OAuth，或登录页点「授权登录」 |
| 邮箱密码 | 登录页原有方式（管理员、未绑企微账号） |

### 账号绑定

1. 销售首次企微登录若未绑定，会显示 **UserID** 与复制按钮
2. 管理员在 **系统配置 → 企业微信** 将 UserID 绑定到 CRM 账号
3. 若 CRM 邮箱与企微企业邮箱一致，在应用开启敏感信息授权后可能**自动绑定**（需重新登录）

### 手机端能力（企微内）

- **OAuth 静默登录**：企微内打开受保护页面自动授权
- **定位 / 语音**：销售日志 `/mobile/log` 使用企微 JS-SDK

### 本地调试说明

企业微信 OAuth 和 JS-SDK 需要**公网 HTTPS 域名**，本地 `localhost` 无法完整调试。建议：

- 使用内网穿透（如 ngrok / frp）映射到 `npm run dev`
- 或在测试服务器上部署后，用企微扫码验证

## 技术栈

- Next.js 15 · TypeScript · Prisma · NextAuth
- Tailwind CSS · shadcn/ui · Recharts
- Vercel AI SDK（销售日志 Agent）
