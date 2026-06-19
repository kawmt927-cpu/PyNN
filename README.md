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

## 企业微信 H5 应用（销售日志）

手机端销售日志可嵌入**企业微信自建应用**，无需小程序。

### 管理后台配置

1. 在企业微信管理后台创建自建应用
2. **应用主页**：`https://你的域名/mobile/log`
3. **可信域名** / **OAuth 回调域** / **JS 接口安全域名**：均填写你的 CRM 域名
4. 记录 CorpID、AgentId、Secret，写入 `.env`：

```bash
WECOM_CORP_ID="wwxxxxxxxx"
WECOM_AGENT_ID="1000002"
WECOM_SECRET="xxxxxxxx"
```

### 账号绑定

1. 销售首次在企微打开应用时，若未绑定会显示其 **UserID**
2. 管理员登录 CRM → **系统配置** → 将 UserID 绑定到对应 CRM 账号
3. 绑定后再次打开应用即可自动登录

### 手机端能力

- **OAuth 静默登录**：企微内打开自动授权，无需输入密码
- **定位**：输入框旁定位按钮，插入 GPS 坐标（面访场景）
- **语音**：按住麦克风说话，松开后转文字填入输入框（企微 JS-SDK；浏览器环境降级为 Web Speech API）

### 本地调试说明

企业微信 OAuth 和 JS-SDK 需要**公网 HTTPS 域名**，本地 `localhost` 无法完整调试。建议：

- 使用内网穿透（如 ngrok / frp）映射到 `npm run dev`
- 或在测试服务器上部署后，用企微扫码验证

## 技术栈

- Next.js 15 · TypeScript · Prisma · NextAuth
- Tailwind CSS · shadcn/ui · Recharts
- Vercel AI SDK（销售日志 Agent）
