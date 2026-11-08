import { Icon } from './Icon';

export function MapControls({ onZoomIn, onZoomOut, onFit, onReset, resetEnabled }) {
  return (
    <div className="map-controls" role="group" aria-label="Map controls" data-map-control data-map-blocker>
      <button type="button" className="ctl" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
        <Icon name="plus" />
      </button>
      <button type="button" className="ctl" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
        <Icon name="minus" />
      </button>
      <button
        type="button"
        className="ctl"
        onClick={onFit}
        aria-label="Fit the whole network"
        title="Fit the whole network"
      >
        <Icon name="fit" />
      </button>
      <button
        type="button"
        className="ctl"
        onClick={onReset}
        disabled={!resetEnabled}
        aria-label="Reset: clear selection and highlight, and fit the network"
        title="Reset selection and view"
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}
