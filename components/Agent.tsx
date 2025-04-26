"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";

interface Message {
  type: string;
  role?: "user" | "assistant" | "system";
  transcript?: string;
  transcriptType?: "final" | "interim";
}

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
}: AgentProps) => {
  const router = useRouter();

  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const faceMeshRef = useRef<any>(null);
  const lastCheckRef = useRef<number>(0);

  // Inject FaceMesh script
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!document.getElementById("mp-face-mesh")) {
      const s = document.createElement("script");
      s.id = "mp-face-mesh";
      s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

  // VAPI event handlers
  useEffect(() => {
    const onCallStart = () => setCallStatus(CallStatus.ACTIVE);
    const onCallEnd = () => setCallStatus(CallStatus.FINISHED);
    const onMessage = (m: Message) => {
      console.log("[Vapi Message]", m);
      if (m.type === "transcript" && m.transcriptType === "final") {
        setMessages((prev) => [...prev, { role: m.role!, content: m.transcript! }]);
      }
    };
    const onSpeechStart = () => setIsSpeaking(true);
    const onSpeechEnd = () => setIsSpeaking(false);
    const onError = (e: Error) => console.error("VAPI error", e);

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
    };
  }, []);

  // ✨ NEW: Update lastMessage when messages update
  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }
  }, [messages]);

  const handleFaceResults = (results: any) => {
    const now = performance.now();
    if (now - lastCheckRef.current < 1000) return;
    lastCheckRef.current = now;

    const W: string[] = [];
    const faces = results.multiFaceLandmarks || [];

    if (faces.length === 0) {
      W.push("No face detected");
    } else if (faces.length > 1) {
      W.push("Multiple faces detected");
    } else {
      const lm = faces[0];
      const L = lm[33], R = lm[263];
      if (Math.abs((L.x + R.x) / 2 - 0.5) > 0.12) W.push("Head turned away");
      const Li = lm[468], Ri = lm[473];
      if (Math.abs(Li.x - L.x) > 0.04 || Math.abs(Ri.x - R.x) > 0.04) {
        W.push("Eyes looking off-screen");
      }
      let minY = 1, maxY = 0;
      lm.forEach((pt: any) => {
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
      if (maxY - minY < 0.18) W.push("Too far / slouching");
    }

    setWarnings(W);
  };

  // Cleanup and feedback saving
  useEffect(() => {
    if (callStatus !== CallStatus.FINISHED) return;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }

    (async () => {
      if (type === "generate") {
        router.push("/");
      } else {
        const { success, feedbackId: id } = await createFeedback({
          interviewId: interviewId!,
          userId: userId!,
          transcript: messages,
          feedbackId,
        });
        router.push(success && id ? `/interview/${interviewId}/feedback` : "/");
      }
    })();
  }, [callStatus]);

  const handleCall = async () => {
    setCallStatus(CallStatus.CONNECTING);

    try {
      if (type === "generate") {
        await vapi.start(process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!, {
          variableValues: { username: userName, userid: userId },
        });
      } else {
        const q = questions?.map((x) => `- ${x}`).join("\n") ?? "";
        await vapi.start(interviewer, { variableValues: { questions: q } });
      }
    } catch (err) {
      console.error("Failed to start Vapi:", err);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      localStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }

      await new Promise<void>((res) => {
        const check = window.setInterval(() => {
          if ((window as any).FaceMesh) {
            clearInterval(check);
            res();
          }
        }, 50);
      });

      const MP = (window as any).FaceMesh;
      const fm = new MP({
        locateFile: (f: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
      });
      fm.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      fm.onResults(handleFaceResults);
      faceMeshRef.current = fm;

      const loop = async () => {
        if (videoRef.current && faceMeshRef.current) {
          await faceMeshRef.current.send({ image: videoRef.current });
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      console.warn("Camera/FaceMesh init failed:", e);
    }
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    vapi.stop();
  };

  return (
    <>
      {/* Anti-cheat warnings */}
      {warnings.length > 0 && (
        <div className="mb-2 p-2 bg-yellow-100 border-l-4 border-yellow-500">
          {warnings.map((w, i) => (
            <p key={i} className="text-yellow-800 text-sm">⚠️ {w}</p>
          ))}
        </div>
      )}

      {/* Interview UI */}
      <div className="call-view flex space-x-6">
        <div className="card-interviewer">
          <div className="avatar relative">
            <Image
              src="/ai-avatar.png"
              alt="AI"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && (
              <span className="animate-ping absolute inset-0 rounded-full bg-green-400 opacity-50" />
            )}
          </div>
          <h3>AI Interviewer</h3>
        </div>

        <div className="card-border">
          <div className="card-content flex flex-col items-center space-y-2">
            <video
              ref={videoRef}
              className="rounded-lg w-64 h-48 bg-black"
              playsInline
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {/* Live Captions */}
      {messages.length > 0 && (
        <div className="transcript-border mt-4">
          <div className="transcript">
            <p
              key={lastMessage}
              className={cn(
                "transition-opacity duration-500 opacity-0",
                "animate-fadeIn opacity-100"
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      {/* Call Controls */}
      <div className="flex justify-center mt-6">
        {callStatus !== CallStatus.ACTIVE ? (
          <button className="btn-call relative" onClick={handleCall}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== CallStatus.CONNECTING && "hidden"
              )}
            />
            <span className="relative">
              {callStatus === "INACTIVE" || callStatus === "FINISHED"
                ? "Call"
                : "..."}
            </span>
          </button>
        ) : (
          <button className="btn-disconnect" onClick={handleDisconnect}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;
