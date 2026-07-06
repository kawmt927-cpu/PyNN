"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
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
  onTranscript: (text: string) => void;
  onStatus?: (text: string | null) => void;
};

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
}: Props) {
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const holdMode = prefersHoldToTalk();
  const useWeComVoice = wecomReady || inWeCom;

  function setRecordingState(active: boolean) {
    recordingRef.current = active;
    setRecording(active);
  }

  function reportTranscript(text: string) {
    onTranscript(text);
    if (text.startsWith("[")) {
      onStatus?.(text.slice(1, -1));
    } else {
      onStatus?.("语音识别已插入输入框");
    }
  }

  function cleanupMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }

  async function startWeComRecording() {
    if (!wecomReady) {
      reportTranscript("[企业微信 SDK 未就绪，请稍后重试或检查企微配置]");
      return;
    }
    try {
      onStatus?.("正在录音，松开后识别…");
      await onStartWeComRecord();
      setRecordingState(true);
    } catch (e) {
      reportTranscript(`[开始录音失败: ${e instanceof Error ? e.message : "请重试"}]`);
    }
  }

  async function stopWeComRecording() {
    if (!recordingRef.current) return;
    setRecordingState(false);
    onStatus?.("正在识别语音…");
    try {
      const text = await onStopWeComRecord();
      if (text.trim()) {
        reportTranscript(text.trim());
      } else {
        reportTranscript("[未识别到语音，请按住说话后再松开]");
      }
    } catch (e) {
      reportTranscript(`[语音识别失败: ${e instanceof Error ? e.message : "请重试"}]`);
    }
  }

  async function startBrowserRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      reportTranscript("[当前浏览器不支持录音，请使用 Chrome/Safari 或企业微信内打开]");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      reportTranscript("[当前浏览器不支持录音功能]");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickAudioRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

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
      reportTranscript(`[${microphoneErrorMessage(e)}]`);
    }
  }

  async function stopBrowserRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupMediaStream();
      setRecordingState(false);
      return;
    }

    setRecordingState(false);
    onStatus?.("正在识别语音…");

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

    if (blob.size === 0) {
      reportTranscript("[未录到有效音频，请重试]");
      return;
    }

    try {
      reportTranscript(await transcribeRecordedAudio(blob));
    } catch (e) {
      reportTranscript(`[${e instanceof Error ? e.message : "语音识别失败"}]`);
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
      variant={recording ? "default" : "outline"}
      size="icon"
      disabled={disabled}
      className="touch-none select-none"
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
      <Mic className={`h-4 w-4 ${recording ? "animate-pulse" : ""}`} />
    </Button>
  );
}
