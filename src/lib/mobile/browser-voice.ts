export function pickAudioRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }

  return undefined;
}

export function extensionForMimeType(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export async function transcribeRecordedAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  const filename = `voice.${extensionForMimeType(blob.type || "audio/webm")}`;
  form.append("file", blob, filename);

  const res = await fetch("/api/mobile/log/transcribe", {
    method: "POST",
    credentials: "include",
    body: form,
  });

  let data: { text?: string; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error("语音识别服务响应异常");
  }

  if (!res.ok) {
    throw new Error(data.error || "语音识别失败");
  }

  const text = data.text?.trim();
  if (!text) {
    throw new Error("未识别到语音内容");
  }

  return text;
}
