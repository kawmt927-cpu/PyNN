"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

type Props = {
  disabled?: boolean;
  wecomReady: boolean;
  inWeCom?: boolean;
  onStartWeComRecord: () => void | Promise<void>;
  onStopWeComRecord: () => Promise<string>;
  onTranscript: (text: string) => void;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognition)
  | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function VoiceInputButton({
  disabled,
  wecomReady,
  inWeCom = false,
  onStartWeComRecord,
  onStopWeComRecord,
  onTranscript,
}: Props) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingRef = useRef(false);

  async function startWeComRecording() {
    if (!wecomReady) {
      onTranscript("[企业微信 SDK 未就绪，请稍后重试或检查企微配置]");
      return;
    }
    try {
      await onStartWeComRecord();
      recordingRef.current = true;
      setRecording(true);
    } catch (e) {
      onTranscript(
        `[开始录音失败: ${e instanceof Error ? e.message : "请重试"}]`
      );
    }
  }

  async function stopWeComRecording() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    try {
      const text = await onStopWeComRecord();
      if (text.trim()) {
        onTranscript(text.trim());
      } else {
        onTranscript("[未识别到语音，请按住说话后再松开]");
      }
    } catch (e) {
      onTranscript(
        `[语音识别失败: ${e instanceof Error ? e.message : "请重试"}]`
      );
    }
  }

  function startBrowserRecording() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onTranscript(
        inWeCom
          ? "[企微语音未就绪，请刷新页面重试]"
          : "[当前浏览器不支持语音输入，请使用 Chrome/Safari 或企业微信内打开]"
      );
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript;
      if (text) onTranscript(text);
      recordingRef.current = false;
      setRecording(false);
    };

    recognition.onerror = () => {
      onTranscript("[语音识别失败，请检查麦克风权限]");
      recordingRef.current = false;
      setRecording(false);
    };

    recognition.onend = () => {
      recordingRef.current = false;
      setRecording(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      recordingRef.current = true;
      setRecording(true);
    } catch (e) {
      onTranscript(
        `[无法启动语音识别: ${e instanceof Error ? e.message : "请重试"}]`
      );
    }
  }

  function stopBrowserRecording() {
    recognitionRef.current?.stop();
    recordingRef.current = false;
    setRecording(false);
  }

  function handleStart(e: React.SyntheticEvent) {
    e.preventDefault();
    if (disabled || recordingRef.current) return;
    if (wecomReady || inWeCom) {
      void startWeComRecording();
    } else {
      startBrowserRecording();
    }
  }

  function handleStop(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!recordingRef.current) return;
    if (wecomReady || inWeCom) {
      void stopWeComRecording();
    } else {
      stopBrowserRecording();
    }
  }

  return (
    <Button
      type="button"
      variant={recording ? "default" : "outline"}
      size="icon"
      disabled={disabled}
      className="touch-none select-none"
      style={{ touchAction: "none" }}
      onPointerDown={handleStart}
      onPointerUp={handleStop}
      onPointerCancel={handleStop}
      onPointerLeave={recording ? handleStop : undefined}
      onTouchStart={handleStart}
      onTouchEnd={handleStop}
      title={recording ? "松开结束" : "按住说话"}
      aria-label="按住说话"
      aria-pressed={recording}
    >
      <Mic className={`h-4 w-4 ${recording ? "animate-pulse" : ""}`} />
    </Button>
  );
}
