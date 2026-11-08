import { Icon } from './Icon';
import { DAYS, PERIODS } from '../lib/network';
import { DAY_LABELS, PERIOD_LABELS, describeService } from '../lib/time';

export function ServicePicker({ service, nowService, usingNow, onService }) {
  const value = usingNow ? 'now' : `${service.day}:${service.period}`;
  return (
    <div className="select-row">
      <label htmlFor="service-select" className="field-label">
        Service shown
      </label>
      <div className="select-wrap">
        <select
          id="service-select"
          value={value}
          onChange={(event) => {
            if (event.target.value === 'now') {
              onService(null);
            } else {
              const [day, period] = event.target.value.split(':');
              onService({ day, period });
            }
          }}
        >
          <option value="now">
            {'Right now — '}
            {describeService(nowService)}
          </option>
          {DAYS.flatMap((day) =>
            PERIODS.map((period) => (
              <option key={`${day}:${period}`} value={`${day}:${period}`}>
                {DAY_LABELS[day]}
                {', '}
                {PERIOD_LABELS[period].toLowerCase()}
              </option>
            )),
          )}
        </select>
        <Icon name="down" size={16} className="select-chevron" />
      </div>
    </div>
  );
}
