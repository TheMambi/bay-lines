import { Icon } from './Icon';

export function ExternalLink({ href, children, className }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`ext-link ${className ?? ''}`}>
      <span>{children}</span>
      <Icon name="external" size={14} />
      <span className="sr-only">{' (opens in a new tab)'}</span>
    </a>
  );
}
