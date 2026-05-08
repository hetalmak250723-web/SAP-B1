import React from "react";

export default function SapWindowControls({ windowFrame, onClose }) {
  if (!windowFrame) {
    return null;
  }

  return (
    <div className="sar-window__controls">
      <button
        type="button"
        aria-label={windowFrame.isMinimized ? "Restore" : "Minimize"}
        onClick={windowFrame.toggleMinimize}
      />
      <button
        type="button"
        aria-label={windowFrame.isMaximized ? "Restore Down" : "Maximize"}
        onClick={windowFrame.toggleMaximize}
      />
      <button type="button" aria-label="Close" onClick={onClose} />
    </div>
  );
}
