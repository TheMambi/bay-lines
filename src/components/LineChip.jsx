export function LineChip({ line, size = 'md', muted }) {
  return (
    <span className={`chip chip-${size}${muted ? ' is-muted' : ''}`} style={{ background: line.color }}>
      {line.name}
    </span>
  );
}
