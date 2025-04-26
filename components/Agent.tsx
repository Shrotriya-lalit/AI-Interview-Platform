"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";

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

  // call & transcript state
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  // refs for video + streams
  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // refs for MediaPipe
  const faceMeshRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const lastCheckRef = useRef<number>(0);

  // 1️⃣ Inject MediaPipe scripts on client only
  useEffect(() => {
    if (typeof window === "undefined") return;
    const libs = [
      {
        id: "mp-face-mesh",
        src: "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js",
      },
      {
        id: "mp-camera-utils",
        src: "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js",
      },
    ];
    libs.forEach(({ id, src }) => {
      if (!document.getElementById(id)) {
        const s = document.createElement("script");
        s.id = id;
        s.src = src;
        s.async = true;
        document.head.appendChild(s);
      }
    });
  }, []);

  // 2️⃣ Wire up VAPI events
  useEffect(() => {
    const onCallStart = () => setCallStatus(CallStatus.ACTIVE);
    const onCallEnd = () => setCallStatus(CallStatus.FINISHED);
    const onMessage = (m: Message) => {
      if (m.type === "transcript" && m.transcriptType === "final") {
        setMessages((prev) => [...prev, { role: m.role, content: m.transcript }]);
      }
    };
    const onSpeechStart = () => setIsSpeaking(true);
    const onSpeechEnd = () => setIsSpeaking(false);
    const onError = (e: Error) => console.error("VAPI error:", e);

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

  // 3️⃣ Anti-cheat frame handler (runs at most once/sec)
  const handleFaceResults = (results: any) => {
    const now = performance.now();
    if (now - lastCheckRef.current < 1000) return;
    lastCheckRef.current = now;

    const newWarnings: string[] = [];
    const faces = results.multiFaceLandmarks || [];

    // ▪️ Face count
    if (faces.length === 0) {
      newWarnings.push("No face detected");
    } else if (faces.length > 1) {
      newWarnings.push("Multiple faces detected");
    } else {
      const lm = faces[0];
      // ▪️ Head turn: eye midpoint X drift
      const leftEye = lm[33], rightEye = lm[263];
      const eyeMidX = (leftEye.x + rightEye.x) / 2;
      if (Math.abs(eyeMidX - 0.5) > 0.12) {
        newWarnings.push("Head turned away");
      }
      // ▪️ Eye gaze: iris vs eye corner
      const leftIris = lm[468], rightIris = lm[473];
      if (
        Math.abs(leftIris.x - leftEye.x) > 0.04 ||
        Math.abs(rightIris.x - rightEye.x) > 0.04
      ) {
        newWarnings.push("Eyes looking off-screen");
      }
      // ▪️ Posture/distance: face height ratio
      let minY = 1, maxY = 0;
      lm.forEach((pt) => {
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
      if (maxY - minY < 0.18) {
        newWarnings.push("Too far / slouching");
      }
    }

    setWarnings(newWarnings);
  };

  // 4️⃣ Cleanup and feedback on call end
  useEffect(() => {
    if (callStatus !== CallStatus.FINISHED) return;

    // stop MediaPipe
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }
    // stop webcam
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    // generate or route feedback
    const finalize = async () => {
      if (type === "generate") {
        router.push("/");
      } else {
        const { success, feedbackId: id } = await createFeedback({
          interviewId: interviewId!,
          userId: userId!,
          transcript: messages,
          feedbackId,
        });
        if (success && id) {
          router.push(`/interview/${interviewId}/feedback`);
        } else {
          router.push("/");
        }
      }
    };
    finalize();
  }, [callStatus]);

  // 5️⃣ Start call + camera + anti-cheat
  const handleCall = async () => {
    setCallStatus(CallStatus.CONNECTING);

    try {
      // start webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // wait for MediaPipe scripts to load
      await new Promise<void>((resolve) => {
        const id = window.setInterval(() => {
          if ((window as any).FaceMesh && (window as any).Camera) {
            window.clearInterval(id);
            resolve();
          }
        }, 50);
      });

      // access from globals
      const MPFaceMesh = (window as any).FaceMesh;
      const MPCamera = (window as any).Camera;

      // instantiate FaceMesh
      const fm = new MPFaceMesh({
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

      // hook Camera util
      cameraRef.current = new MPCamera(videoRef.current!, {
        onFrame: async () => {
          await fm.send({ image: videoRef.current! });
        },
        width: 640,
        height: 480,
      });
      cameraRef.current.start();
    } catch (e) {
      console.warn("Camera/AntiCheat setup failed:", e);
    }

    // finally, start the VAPI call
    if (type === "generate") {
      await vapi.start(process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!, {
        variableValues: { username: userName, userid: userId },
      });
    } else {
      const formatted = questions?.map((q) => `- ${q}`).join("\n") ?? "";
      await vapi.start(interviewer, {
        variableValues: { questions: formatted },
      });
    }
  };

  // 6️⃣ End call on button
  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    vapi.stop();
  };

  return (
    <>
      {/* Warnings Panel */}
      {warnings.length > 0 && (
        <div className="mb-2 p-2 bg-yellow-100 border-l-4 border-yellow-500">
          {warnings.map((w, i) => (
            <p key={i} className="text-yellow-800 text-sm">
              ⚠️ {w}
            </p>
          ))}
        </div>
      )}

      {/* Interview UI */}
      <div className="call-view flex space-x-6">
        {/* AI Interviewer */}
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

        {/* User + Live Camera */}
        <div className="card-border">
          <div className="card-content flex flex-col items-center space-y-2">
            <video
              ref={videoRef}
              className="rounded-lg w-64 h-48 bg-black"
              muted
              playsInline
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {/* Transcript */}
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

      {/* Controls */}
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
              {callStatus === CallStatus.INACTIVE ||
              callStatus === CallStatus.FINISHED
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
