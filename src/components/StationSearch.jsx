import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { searchStations } from '../lib/search';

export function StationSearch({
  net,
  label,
  placeholder,
  value,
  onSelect,
  onClear,
  leading,
  trailing,
  hideLabel,
  inputRef,
  onFocusInput,
}) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(false);
  const fieldRef = useRef(null);
  useEffect(() => {
    if (!editing) {
      setText(value ? (net.stationById.get(value)?.name ?? '') : '');
    }
  }, [value, editing, net]);
  const suggestions = useMemo(() => {
    if (open && editing) {
      return searchStations(net, text, 7);
    }
    return [];
  }, [open, editing, text, net]);
  const showList = open && editing && text.trim().length > 0;
  useEffect(() => setActive(0), [text]);
  const choose = (stationId) => {
    setEditing(false);
    setOpen(false);
    onSelect(stationId);
  };
  return (
    <div
      className="field"
      ref={fieldRef}
      onBlur={(event) => {
        if (!fieldRef.current?.contains(event.relatedTarget)) {
          setOpen(false);
          setEditing(false);
        }
      }}
    >
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>
      <div className="field-row">
        {leading}
        <div className="field-input">
          <Icon name="search" size={18} className="field-icon" />
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && suggestions[active] ? `${listId}-${suggestions[active].station.id}` : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={placeholder}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setEditing(true);
              setOpen(true);
            }}
            onFocus={(event) => {
              event.currentTarget.select();
              onFocusInput?.();
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (showList) {
                  setActive((i) => {
                    if (suggestions.length) {
                      return (i + 1) % suggestions.length;
                    }
                    return 0;
                  });
                } else {
                  setOpen(true);
                  setEditing(true);
                }
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (showList) {
                  setActive((i) => {
                    if (suggestions.length) {
                      return (i - 1 + suggestions.length) % suggestions.length;
                    }
                    return 0;
                  });
                }
              } else if (event.key === 'Enter') {
                if (showList && suggestions[active]) {
                  event.preventDefault();
                  choose(suggestions[active].station.id);
                }
              } else {
                if (event.key === 'Escape') {
                  if (showList) {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                  } else if (editing) {
                    setEditing(false);
                  }
                }
              }
            }}
          />
          {(value || text) && onClear && (
            <button
              type="button"
              className="icon-btn icon-btn-quiet field-clear"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                setText('');
                setEditing(false);
                setOpen(false);
                onClear();
              }}
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        {trailing}
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        className="suggestions"
        hidden={!showList}
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={suggestion.station.id}
            id={`${listId}-${suggestion.station.id}`}
            role="option"
            aria-selected={index === active}
            className={index === active ? 'is-active' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(suggestion.station.id)}
            onMouseMove={() => setActive(index)}
          >
            <span className="sug-name">
              {suggestion.station.name}
              {suggestion.matchedOn && (
                <span className="sug-alias">
                  {' · matches “'}
                  {suggestion.matchedOn}”
                </span>
              )}
            </span>
            <span className="sug-lines">
              {net.linesAt(suggestion.station.id).map((lineId) => (
                <LineChip key={lineId} line={net.lineById.get(lineId)} size="sm" />
              ))}
            </span>
          </li>
        ))}
        {showList && suggestions.length === 0 && (
          <li role="presentation" className="sug-empty">
            No BART station matches “{text.trim()}
            ”.
          </li>
        )}
      </ul>
      <div className="sr-only" role="status" aria-live="polite">
        {showList
          ? suggestions.length
            ? `${suggestions.length} station${suggestions.length === 1 ? '' : 's'} found. Use the up and down arrows, then Enter.`
            : 'No stations found.'
          : ''}
      </div>
    </div>
  );
}
