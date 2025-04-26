import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import {
  createDetector,
  SupportedModels,
  FaceLandmarksDetector,
} from "@tensorflow-models/face-landmarks-detection";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

/**
 * useAntiCheat hook
 * @param videoRef React ref for a HTMLVideoElement capturing the user's webcam
 * @returns an array of real-time alerts about potential cheating behaviors
 */
export function useAntiCheat(
  videoRef: React.RefObject<HTMLVideoElement>
) {
  const [alerts, setAlerts] = useState<string[]>([]);
  const faceModelRef = useRef<FaceLandmarksDetector | null>(null);
  const objModelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  // Load models once on mount
  useEffect(() => {
    tf.ready().then(async () => {
      try {
        // Face mesh detector for landmarks (eyes, head pose)
        faceModelRef.current = await createDetector(
          SupportedModels.MediaPipeFaceMesh,
          { runtime: "tfjs", refineLandmarks: true }
        );
        // Object detector for extra people/objects
        objModelRef.current = await cocoSsd.load();
      } catch (error) {
        console.error("AntiCheat: model load error", error);
      }
    });
  }, []);

  // Analyze video frames continuously
  useEffect(() => {
    let rafId: number;

    const analyzeFrame = async () => {
      const video = videoRef.current;
      const faceModel = faceModelRef.current;
      const objModel = objModelRef.current;
      const newAlerts: string[] = [];

      if (video && faceModel && objModel) {
        try {
          // 1. Face count
          const faces = await faceModel.estimateFaces(video);
          if (faces.length !== 1) {
            newAlerts.push(`Face count: ${faces.length}`);
          }

          // 2. Extra persons via object detection
          const detections = await objModel.detect(video);
          const persons = detections.filter((d) => d.class === "person");
          if (persons.length !== 1) {
            newAlerts.push(`People detected: ${persons.length}`);
          }

          // 3. Head pose & gaze (placeholder)
          // TODO: compute yaw/pitch/roll from face landmarks and compare against thresholds
          // If deviation > threshold, push an alert like:
          // newAlerts.push("Head turned away");

          // 4. Body posture (placeholder)
          // TODO: integrate @tensorflow-models/pose-detection for full-body keypoints and detect slouching

          // 5. Engagement: measure landmark movement variance over time
          // TODO: track consistency; low movement may indicate disengagement
        } catch (err) {
          console.error("AntiCheat: frame analysis error", err);
        }
      }

      setAlerts(newAlerts);
      rafId = requestAnimationFrame(analyzeFrame);
    };

    rafId = requestAnimationFrame(analyzeFrame);
    return () => cancelAnimationFrame(rafId);
  }, [videoRef]);

  return { alerts };
}
