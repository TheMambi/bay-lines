import { useMemo, useState } from 'react';
import { LineChip } from './LineChip';
import { searchStations } from '../lib/search';

export function StationList({ net, onPick }) {
  const [filter, setFilter] = useState('');
  const alphabetical = useMemo(() => [...net.stations].sort((a, b) => a.name.localeCompare(b.name)), [net]);
  const shown = useMemo(() => {
    if (filter.trim()) {
      return searchStations(net, filter, 50).map((match) => match.station);
    }
    return alphabetical;
  }, [filter, net, alphabetical]);
  return (
    <div>
      <div className="field">
        <label htmlFor="station-filter" className="field-label">
          Filter stations
        </label>
        <div className="field-input">
          <input
            id="station-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Name, code or airport…"
            autoComplete="off"
          />
        </div>
      </div>
      <p className="fine" role="status">
        {shown.length}
        {' of '}
        {net.stations.length}
        {' stations'}
      </p>
      <ul className="station-list">
        {shown.map((station) => (
          <li key={station.id}>
            <button type="button" onClick={() => onPick(station.id)}>
              <span className="sl-name">{station.name}</span>
              <span className="sl-lines">
                {net.linesAt(station.id).map((lineId) => (
                  <LineChip key={lineId} line={net.lineById.get(lineId)} size="sm" />
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
