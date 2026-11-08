import { useEffect, useRef, useState } from 'react';

export function CopyScore({ text }) {
  const [status, setStatus] = useState('idle');
  const boxRef = useRef(null);
  useEffect(() => {
    if (status === 'failed') {
      boxRef.current?.select();
    }
  }, [status]);
  return (
    <div className="copy-score">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setStatus('copied');
            return;
          } catch {
            // Clipboard API unavailable or denied; try the older copy command below.
          }
          try {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand('copy');
            area.remove();
            setStatus(ok ? 'copied' : 'failed');
          } catch {
            setStatus('failed');
          }
        }}
      >
        Copy my score
      </button>
      <span role="status" className="fine">
        {status === 'copied'
          ? 'Copied. Paste it into a message.'
          : status === 'failed'
            ? 'Your browser wouldn’t copy it. Select the text below and copy it yourself.'
            : ''}
      </span>
      {status === 'failed' && (
        <textarea
          ref={boxRef}
          className="copy-box"
          readOnly
          rows={3}
          value={text}
          aria-label="Your score, to copy"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
