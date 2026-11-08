import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon';

export function Dialog({ open, title, onClose, children, className, description }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) {
      if (open && !dialog.open) {
        dialog.showModal();
      }
      if (!open && dialog.open) {
        dialog.close();
      }
    }
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className={`dialog ${className ?? ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {open && (
        <div className="dialog-inner">
          <header className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={`Close ${title}`}>
              <Icon name="close" />
            </button>
          </header>
          {description && (
            <p id={descId} className="dialog-desc">
              {description}
            </p>
          )}
          <div className="dialog-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
