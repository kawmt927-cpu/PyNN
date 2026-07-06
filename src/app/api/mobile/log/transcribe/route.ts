import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { isSttAvailable, transcribeAudioBlob } from "@/lib/agent/speech-to-text";

export const maxDuration = 60;

const CHAT_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function extensionForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  if (!CHAT_ROLES.includes(session.user.role)) {
    return Response.json({ error: "当前角色无法使用语音输入" }, { status: 403 });
  }

  const available = await isSttAvailable();
  if (!available) {
    return Response.json(
      {
        error:
          "语音识别未配置，请管理员在系统配置 → AI 助手中设置语音识别 API Key（推荐硅基流动 SenseVoice）",
      },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "无效的音频上传" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "请上传有效的录音文件" }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "录音文件过大，请缩短录音时长" }, { status: 400 });
  }

  const mime = file.type || "audio/webm";
  const filename =
    file instanceof File && file.name
      ? file.name
      : `voice.${extensionForMime(mime)}`;

  try {
    const text = await transcribeAudioBlob(file, filename);
    return Response.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "语音识别失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
