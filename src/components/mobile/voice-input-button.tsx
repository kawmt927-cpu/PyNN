"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

type Props = {
  disabled?: boolean;
  wecomReady: boolean;
  onStartWeComRecord: () => void;
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
  onStartWeComRecord,
  onStopWeComRecord,
  onTranscript,
}: Props) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  async function startWeComRecording() {
    onStartWeComRecord();
    setRecording(true);
  }

  async function stopWeComRecording() {
    try {
      const text = await onStopWeComRecord();
      if (text.trim()) onTranscript(text.trim());
    } catch (e) {
      onTranscript(
        `[语音识别失败: ${e instanceof Error ? e.message : "请重试"}]`
      );
    } finally {
      setRecording(false);
    }
  }

  function startBrowserRecording() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onTranscript("[当前浏览器不支持语音输入，请在企业微信内使用]");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript;
      if (text) onTranscript(text);
      setRecording(false);
    };

    recognition.onerror = () => {
      onTranscript("[语音识别失败，请检查麦克风权限]");
      setRecording(false);
    };

    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  function stopBrowserRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  function handlePointerDown() {
    if (disabled || recording) return;
    if (wecomReady) {
      startWeComRecording();
    } else {
      startBrowserRecording();
    }
  }

  function handlePointerUp() {
    if (!recording) return;
    if (wecomReady) {
      stopWeComRecording();
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
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={recording ? handlePointerUp : undefined}
      title={recording ? "松开结束" : "按住说话"}
      aria-label="按住说话"
    >
      <Mic className={`h-4 w-4 ${recording ? "animate-pulse" : ""}`} />
    </Button>
  );
}
