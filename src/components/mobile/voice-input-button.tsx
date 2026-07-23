"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  pickAudioRecorderMimeType,
  transcribeRecordedAudio,
} from "@/lib/mobile/browser-voice";

type Props = {
  disabled?: boolean;
  wecomReady: boolean;
  inWeCom?: boolean;
  onStartWeComRecord: () => void | Promise<void>;
  onStopWeComRecord: () => Promise<string>;
  /** 仅成功识别的文本；失败不要写入输入框 */
  onTranscript: (text: string) => void;
  onStatus?: (text: string | null) => void;
  className?: string;
};

const MIN_HOLD_MS = 700;

function prefersHoldToTalk() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "麦克风权限被拒绝，请在浏览器设置中允许访问";
    }
    if (error.name === "NotFoundError") {
      return "未检测到麦克风设备";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "无法访问麦克风";
}

export function VoiceInputButton({
  disabled,
  wecomReady,
  inWeCom = false,
  onStartWeComRecord,
  onStopWeComRecord,
  onTranscript,
  onStatus,
  className,
}: Props) {
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const holdMode = prefersHoldToTalk();
  const useWeComVoice = wecomReady || inWeCom;

  function setRecordingState(active: boolean) {
    recordingRef.current = active;
    setRecording(active);
    if (active) startedAtRef.current = Date.now();
  }

  function reportStatus(text: string) {
    onStatus?.(text);
  }

  function reportSuccess(text: string) {
    onTranscript(text);
    onStatus?.("语音已填入输入框，可修改后发送");
  }

  function cleanupMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }

  function isHoldTooShort() {
    return Date.now() - startedAtRef.current < MIN_HOLD_MS;
  }

  async function startWeComRecording() {
    if (!wecomReady) {
      reportStatus("企业微信 SDK 未就绪，请稍后重试");
      return;
    }
    try {
      onStatus?.("正在录音，松开后识别…");
      await onStartWeComRecord();
      setRecordingState(true);
    } catch (e) {
      reportStatus(`开始录音失败：${e instanceof Error ? e.message : "请重试"}`);
    }
  }

  async function stopWeComRecording() {
    if (!recordingRef.current) return;
    const tooShort = isHoldTooShort();
    setRecordingState(false);
    if (tooShort) {
      try {
        await onStopWeComRecord();
      } catch {
        // 短按结束时识别常失败，忽略
      }
      reportStatus("按住时间过短，请重新长按说话");
      return;
    }
    onStatus?.("正在识别语音…");
    try {
      const text = await onStopWeComRecord();
      if (text.trim()) {
        reportSuccess(text.trim());
      } else {
        reportStatus("未识别到有效语音，请重新长按说话");
      }
    } catch {
      reportStatus("语音识别失败，请重新长按说话");
    }
  }

  async function startBrowserRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      reportStatus("当前浏览器不支持录音，请使用 Chrome/Safari 或企业微信内打开");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      reportStatus("当前浏览器不支持录音功能");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickAudioRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState(true);
      onStatus?.(holdMode ? "正在录音，松开后识别…" : "正在录音，再次点击结束…");
    } catch (e) {
      cleanupMediaStream();
      reportStatus(microphoneErrorMessage(e));
    }
  }

  async function stopBrowserRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupMediaStream();
      setRecordingState(false);
      return;
    }

    const tooShort = isHoldTooShort();
    setRecordingState(false);

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        resolve(new Blob(audioChunksRef.current, { type: mimeType }));
      };
      recorder.onerror = () => reject(new Error("录音失败"));
      recorder.stop();
    }).finally(() => {
      cleanupMediaStream();
    });

    if (tooShort || blob.size === 0) {
      reportStatus("按住时间过短，请重新长按说话");
      return;
    }

    onStatus?.("正在识别语音…");
    try {
      reportSuccess(await transcribeRecordedAudio(blob));
    } catch {
      reportStatus("语音识别失败，请重新长按说话");
    }
  }

  function startRecording() {
    if (disabled || recordingRef.current) return;
    if (useWeComVoice) {
      void startWeComRecording();
    } else {
      void startBrowserRecording();
    }
  }

  function stopRecording() {
    if (!recordingRef.current) return;
    if (useWeComVoice) {
      void stopWeComRecording();
    } else {
      void stopBrowserRecording();
    }
  }

  function toggleRecording() {
    if (recordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!holdMode || disabled) return;
    e.preventDefault();
    startRecording();
  }

  function handlePointerUp(e: React.SyntheticEvent) {
    if (!holdMode) return;
    e.preventDefault();
    stopRecording();
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (holdMode) return;
    e.preventDefault();
    toggleRecording();
  }

  return (
    <Button
      type="button"
      variant={recording ? "default" : "secondary"}
      disabled={disabled}
      className={cn(
        "h-14 min-w-[7.5rem] touch-none select-none gap-2 rounded-2xl px-5 text-base shadow-sm",
        recording && "ring-2 ring-primary/40",
        className
      )}
      style={{ touchAction: "none" }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={recording && holdMode ? handlePointerUp : undefined}
      title={recording ? (holdMode ? "松开结束" : "点击结束") : holdMode ? "按住说话" : "点击开始说话"}
      aria-label="语音输入"
      aria-pressed={recording}
    >
      <Mic className={`h-6 w-6 shrink-0 ${recording ? "animate-pulse" : ""}`} />
      <span className="font-medium">{recording ? "松开结束" : holdMode ? "按住说话" : "点击说话"}</span>
    </Button>
  );
}
