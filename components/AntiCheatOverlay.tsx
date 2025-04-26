import React from "react";

interface OverlayProps {
  alerts: string[];
}

/**
 * AntiCheatOverlay
 * Renders real-time alerts about potential cheating behaviors
 */
export default function AntiCheatOverlay({ alerts }: OverlayProps) {
  return (
    <div className="absolute top-2 left-2 z-10 p-2 bg-white bg-opacity-75 backdrop-blur-sm rounded-lg shadow-md max-w-xs">
      {alerts.length === 0 ? (
        <p className="text-green-700 font-medium">All clear ✅</p>
      ) : (
        alerts.map((alert, idx) => (
          <p key={idx} className="text-red-600 font-medium flex items-center space-x-1">
            <span>⚠️</span>
            <span>{alert}</span>
          </p>
        ))
      )}
    </div>
  );
}
