import React from 'react';

function PdfViewer({ fileName, previewUrl, isOpen, onClose, onDownload, onOpen }) {
  if (!isOpen || !previewUrl) {
    return null;
  }

  return (
    <div className="rs-modal__backdrop" onClick={onClose}>
      <section className="rs-modal rs-modal--preview" onClick={(event) => event.stopPropagation()}>
        <div className="rs-modal__titlebar">
          <span>PDF Preview</span>
          <div className="rs-modal__actions">
            <button type="button" className="rs-btn" onClick={onDownload}>
              Download PDF
            </button>
            <button type="button" className="rs-btn rs-btn--primary" onClick={onOpen}>
              Open In New Tab
            </button>
            <button type="button" className="rs-modal__close" onClick={onClose} aria-label="Close preview">
              x
            </button>
          </div>
        </div>
        <div className="rs-pdf-viewer">
          <div className="rs-pdf-viewer__title">{fileName || 'report.pdf'}</div>
          <iframe title={fileName || 'Report Preview'} src={previewUrl} className="rs-pdf-viewer__frame" />
        </div>
      </section>
    </div>
  );
}

export default PdfViewer;
