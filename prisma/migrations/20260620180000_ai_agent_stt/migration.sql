-- AlterTable
ALTER TABLE "AiAgentConfig" ADD COLUMN "sttApiKey" TEXT;
ALTER TABLE "AiAgentConfig" ADD COLUMN "sttApiBase" TEXT NOT NULL DEFAULT 'https://api.siliconflow.cn/v1';
ALTER TABLE "AiAgentConfig" ADD COLUMN "sttModel" TEXT NOT NULL DEFAULT 'FunAudioLLM/SenseVoiceSmall';
