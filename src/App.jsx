import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AboutContent } from './components/AboutContent';
import { AlertsPanel } from './components/AlertsPanel';
import { Dialog } from './components/Dialog';
import { ExternalLink } from './components/ExternalLink';
import { Icon } from './components/Icon';
import { LinesCard } from './components/LinesCard';
import { MapControls } from './components/MapControls';
import { Panel } from './components/Panel';
import { ReachPanel } from './components/ReachPanel';
import { ReplayPanel } from './components/ReplayPanel';
import { StationCard } from './components/StationCard';
import { StationList } from './components/StationList';
import { StationSearch } from './components/StationSearch';
import { GamesPanel } from './components/games/GamesPanel';
import { TripPanel } from './components/trip/TripPanel';
import { useAlerts } from './hooks/useAlerts';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';
import { tagAlerts } from './lib/alerts';
import { formatDate, plural } from './lib/format';
import { EMPTY_GAME } from './lib/games';
import { loadGeography } from './lib/geography';
import { net, serviceKey } from './lib/network';
import { computeReach, meetingPoints } from './lib/reach';
import { ReplayClock } from './lib/replay';
import { planTrips } from './lib/routing';
import { pacificDate, serviceAt, serviceMinuteNow } from './lib/time';
import { TransitMap } from './map/TransitMap';

const MODES = ['explore', 'trip', 'reach', 'replay', 'play'];

const DEFAULT_HORIZON = 30;

const DEFAULT_ALLOWANCE = 5;

const startMode = (link) => link.mode ?? (link.from || link.to ? 'trip' : 'explore');

function readHashState() {
  const state = {
    from: null,
    to: null,
    station: null,
    line: null,
    service: null,
    mode: null,
    origin: null,
    origin2: null,
    within: null,
    wait: null,
    first: null,
  };
  try {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const station = (raw) => {
      if (raw && net.stationById.has(raw.toUpperCase())) {
        return raw.toUpperCase();
      }
      return null;
    };
    state.from = station(params.get('from'));
    state.to = station(params.get('to'));
    state.station = station(params.get('station'));
    state.origin = station(params.get('origin'));
    state.origin2 = state.origin ? station(params.get('origin2')) : null;
    const mode = params.get('mode');
    state.mode = mode && MODES.includes(mode) ? mode : null;
    const clampInt = (raw, lo, hi) => {
      if (raw != null && raw !== '' && Number.isFinite(Number(raw))) {
        return Math.min(hi, Math.max(lo, Math.round(Number(raw))));
      }
      return null;
    };
    state.within = clampInt(params.get('within'), 10, 90);
    state.wait = clampInt(params.get('wait'), 0, 15);
    state.first = clampInt(params.get('first'), 0, 15);
    const line = params.get('line');
    state.line = line && net.lineById.has(line) ? line : null;
    const [day, period] = (params.get('service') ?? '').split(':');
    if (['weekday', 'saturday', 'sunday'].includes(day) && ['day', 'evening'].includes(period)) {
      state.service = { day, period };
    }
  } catch {
    // A malformed hash just means no deep link.
  }
  return state;
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem('bay-lines-theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return 'system';
  } catch {
    return 'system';
  }
}

const afterPaint = (callback) => requestAnimationFrame(() => requestAnimationFrame(callback));

export function App() {
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const mapRef = useRef(null);
  const panelRef = useRef(null);
  const safeProbeRef = useRef(null);
  const searchRef = useRef(null);
  const initial = useMemo(readHashState, []);
  const [geography, setGeography] = useState(null);
  const [mode, setMode] = useState(startMode(initial));
  const [origin, setOrigin] = useState(initial.origin);
  const [origin2, setOrigin2] = useState(initial.origin2);
  const [firstWait, setFirstWait] = useState(initial.first ?? 0);
  const [lineFilter, setLineFilter] = useState(null);
  const [horizon, setHorizon] = useState(initial.within ?? DEFAULT_HORIZON);
  const [allowance, setAllowance] = useState(initial.wait ?? DEFAULT_ALLOWANCE);
  const [followId, setFollowId] = useState(null);
  const [gameView, setGameView] = useState(EMPTY_GAME);
  const pickRef = useRef(null);
  const [selected, setSelected] = useState(initial.station);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [optionIndex, setOptionIndex] = useState(0);
  const [highlight, setHighlight] = useState(initial.line);
  const [pickMode, setPickMode] = useState(null);
  const [serviceOverride, setServiceOverride] = useState(initial.service);
  const [dialog, setDialog] = useState(null);
  const [snap, setSnap] = useState(() => {
    if (
      (typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches) ||
      initial.station ||
      initial.from ||
      initial.to ||
      (initial.mode && initial.mode !== 'explore')
    ) {
      return 'half';
    }
    return 'peek';
  });
  const [theme, setTheme] = useState(readStoredTheme);
  const [announcement, setAnnouncement] = useState('');
  const [insets, setInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [sheetHeight, setSheetHeight] = useState(0);
  const { state, refresh } = useAlerts();
  const now = useNow();
  const today = useMemo(() => pacificDate(now), [now]);
  const scheduleEnd = net.data.meta.gtfs.calendarEndDate;
  const scheduleEnded = today > scheduleEnd;
  const nowServiceId = useMemo(() => serviceKey(serviceAt(now, net.data.meta.serviceDateOverrides)), [now]);
  // The clock ticks every minute. The service object must change only when the day or period does,
  // or everything keyed on it (the chosen route option, Reach, the line layer) resets every minute.
  const nowService = useMemo(() => {
    const [day, period] = nowServiceId.split(':');
    return { day, period };
  }, [nowServiceId]);
  const service = serviceOverride ?? nowService;
  const serviceId = serviceKey(service);
  const nowMinute = serviceMinuteNow(now);
  // Only "Right now" looks at the clock, to leave out trains that have finished for the day.
  const liveMinute = serviceOverride ? undefined : nowMinute;
  const [replayDay, setReplayDay] = useState(nowService.day);
  const [clock] = useState(
    () =>
      new ReplayClock(
        nowMinute,
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
  );
  useEffect(() => () => clock.pause(), [clock]);
  useEffect(() => {
    if (mode !== 'replay') {
      clock.pause();
    }
  }, [mode, clock]);
  useEffect(() => setFollowId(null), [replayDay]);
  const reachA = useMemo(() => {
    if (mode === 'reach' && origin) {
      return computeReach(net, service, origin, allowance, firstWait, liveMinute);
    }
    return null;
  }, [mode, origin, service, allowance, firstWait, liveMinute]);
  const reachB = useMemo(() => {
    if (mode === 'reach' && origin && origin2 && origin2 !== origin) {
      return computeReach(net, service, origin2, allowance, firstWait, liveMinute);
    }
    return null;
  }, [mode, origin, origin2, service, allowance, firstWait, liveMinute]);
  const meeting = useMemo(() => {
    if (reachA && reachB) {
      return meetingPoints(reachA, reachB);
    }
    return null;
  }, [reachA, reachB]);
  const meetingStops = useMemo(() => {
    if (meeting) {
      return new Map(
        meeting.map((point) => [
          point.id,
          {
            minutes: point.minutes,
            rideMinutes: Math.max(point.a.rideMinutes, point.b.rideMinutes),
            transfers: Math.max(point.a.transfers, point.b.transfers),
            lineIds: [],
          },
        ]),
      );
    }
    return null;
  }, [meeting]);
  const reach = useMemo(() => {
    if (reachA && origin) {
      return {
        origin,
        origin2: meetingStops ? origin2 : null,
        horizon,
        stops: meetingStops ?? reachA,
        best: meeting && meeting[0] && meeting[0].minutes <= horizon ? meeting[0].id : null,
      };
    }
    return null;
  }, [reachA, origin, origin2, meetingStops, meeting, horizon]);
  const game = useMemo(() => {
    if (mode === 'play') {
      return { hideNames: gameView.hideNames, marks: gameView.marks };
    }
    return null;
  }, [mode, gameView]);
  useEffect(() => {
    loadGeography().then(setGeography, () => setGeography(null));
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    try {
      if (theme === 'system') {
        localStorage.removeItem('bay-lines-theme');
      } else {
        localStorage.setItem('bay-lines-theme', theme);
      }
    } catch {
      // Storage can be blocked (private mode); the theme still applies for this visit.
    }
  }, [theme]);
  const result = useMemo(() => {
    if (from && to) {
      return planTrips(net, service, from, to, liveMinute);
    }
    return null;
  }, [from, to, service, liveMinute]);
  const itineraries = result?.status === 'ok' ? result.itineraries : [];
  const itinerary = itineraries.length ? itineraries[Math.min(optionIndex, itineraries.length - 1)] : null;
  useEffect(() => setOptionIndex(0), [from, to, serviceId]);
  const alertPayload =
    state.kind === 'ready' ? state.data : state.kind === 'error' ? state.lastGood?.data : undefined;
  const taggedAll = useMemo(() => {
    if (alertPayload) {
      return tagAlerts(net, alertPayload.alerts);
    }
    return [];
  }, [alertPayload]);
  const tripLineIds = useMemo(() => new Set(itinerary?.legs.map((leg) => leg.lineId) ?? []), [itinerary]);
  const tripStationIds = useMemo(
    () => new Set(itinerary?.legs.flatMap((leg) => leg.stops) ?? []),
    [itinerary],
  );
  const taggedAlerts = useMemo(
    () =>
      taggedAll
        .filter(
          (entry) =>
            entry.lineIds.some((lineId) => tripLineIds.has(lineId)) ||
            entry.stationIds.some((stationId) => tripStationIds.has(stationId)),
        )
        .map((entry) => entry.alert),
    [taggedAll, tripLineIds, tripStationIds],
  );
  const systemAlertCount = taggedAll.filter((entry) => !entry.tagged).length;
  const alertsAt = (stationId) =>
    taggedAll.filter((entry) => entry.stationIds.includes(stationId)).map((entry) => entry.alert);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const measure = () => {
      const rect = panel.getBoundingClientRect();
      const safeTop =
        (safeProbeRef.current && parseFloat(getComputedStyle(safeProbeRef.current).paddingTop)) || 0;
      if (isDesktop) {
        setInsets({ top: 0, right: 0, bottom: 0, left: Math.round(rect.right + 8) });
        setSheetHeight(0);
      } else {
        const bottom = Math.max(0, Math.round(window.innerHeight - rect.top));
        const controls = document.querySelector('.map-controls')?.getBoundingClientRect();
        const right =
          controls && controls.width ? Math.max(0, Math.round(window.innerWidth - controls.left + 6)) : 0;
        setInsets({ top: Math.round(safeTop + 64), right, bottom, left: 0 });
        setSheetHeight(bottom);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isDesktop]);
  const announce = useCallback(
    (message) =>
      setAnnouncement((prev) => {
        if (prev === message) {
          return `${message} `;
        }
        return message;
      }),
    [],
  );
  const nameOf = (id) => net.stationById.get(id)?.name ?? id;
  const followTrain = useCallback(
    (trainId) => {
      setFollowId(trainId);
      if (!trainId) {
        return;
      }
      const pattern = net.patternById.get(trainId.slice(0, trainId.lastIndexOf('@')));
      if (pattern) {
        announce(
          `Highlighting the ${net.lineById.get(pattern.lineId)?.name} line train toward ${net.stationById.get(pattern.stations[pattern.stations.length - 1])?.name}. Its details are at the top of the panel.`,
        );
      }
      document.getElementById('panel-content')?.scrollTo?.({ top: 0 });
    },
    [announce],
  );
  const replay = useMemo(() => {
    if (mode === 'replay') {
      return { clock, day: replayDay, followId, lineFilter, onPick: followTrain };
    }
    return null;
  }, [mode, clock, replayDay, followId, lineFilter, followTrain]);
  const selectStation = useCallback(
    (stationId, opts = {}) => {
      setSelected(stationId);
      if (!isDesktop) {
        setSnap((prev) => {
          if (prev === 'peek') {
            return 'half';
          }
          return prev;
        });
      }
      announce(
        `${nameOf(stationId)}. Lines: ${net
          .linesAt(stationId)
          .map((lineId) => net.lineById.get(lineId).name)
          .join(', ')}.`,
      );
      if (opts.center !== false) {
        afterPaint(() => mapRef.current?.focusStation(stationId));
      }
    },
    [announce, isDesktop],
  );
  const setEndpoint = useCallback(
    (which, stationId) => {
      if (which === 'from') {
        setFrom(stationId);
      } else {
        setTo(stationId);
      }
      setMode('trip');
      if (stationId) {
        announce(`${which === 'from' ? 'Starting station' : 'Destination'} set to ${nameOf(stationId)}.`);
        setSelected((prev) => {
          if (which === 'from' ? to : from) {
            return null;
          }
          return prev;
        });
        if (!isDesktop) {
          setSnap((prev) => {
            if (prev === 'peek') {
              return 'half';
            }
            return prev;
          });
        }
        afterPaint(() => mapRef.current?.ensureStationVisible(stationId));
      }
    },
    [announce, from, to, isDesktop],
  );
  const onStationClick = useCallback(
    (stationId) => {
      if (mode === 'play') {
        pickRef.current?.(stationId);
        return;
      }
      if (mode === 'reach') {
        if (pickMode === 'meet') {
          setOrigin2(stationId);
          setPickMode(null);
          announce(`Person B starts from ${nameOf(stationId)}.`);
          return;
        }
        setOrigin(stationId);
        announce(`Reach map from ${nameOf(stationId)}.`);
        return;
      }
      if (mode !== 'replay') {
        if (pickMode === 'from' || pickMode === 'to') {
          setEndpoint(pickMode, stationId);
          setPickMode(null);
          return;
        }
        selectStation(stationId, { center: false });
        mapRef.current?.ensureStationVisible(stationId);
      }
    },
    [mode, pickMode, selectStation, setEndpoint, announce],
  );
  const changeMode = (next) => {
    if (next !== mode) {
      setMode(next);
      setPickMode(null);
      if (next === 'replay') {
        clock.set(nowMinute);
        setReplayDay(nowService.day);
      }
      if (!isDesktop) {
        setSnap((prev) => {
          if (prev === 'peek') {
            return 'half';
          }
          return prev;
        });
      }
      if (next === 'reach' || next === 'replay' || next === 'play') {
        setTimeout(() => mapRef.current?.fit(), isDesktop ? 60 : 380);
      }
      announce(
        {
          explore: 'Explore: search stations and lines.',
          trip: 'Plan a trip: choose a start and a destination.',
          reach: 'How far can I get: choose a starting station and a time.',
          replay: 'Timetable replay, not live. Press Play to watch the scheduled trains.',
          play: 'Games.',
        }[next],
      );
    }
  };
  const closeStation = useCallback(() => {
    setSelected(null);
    setPickMode(null);
  }, []);
  const swapEnds = () => {
    setFrom(to);
    setTo(from);
    announce('Start and destination swapped.');
  };
  const onClear = () => {
    setFrom(null);
    setTo(null);
    setPickMode(null);
    announce('Route cleared.');
  };
  const onReset = () => {
    setSelected(null);
    setHighlight(null);
    setPickMode(null);
    mapRef.current?.fit();
    announce('Selection cleared and map reset to the whole network.');
  };
  const startPicking = (which) => {
    setPickMode(which);
    if (!isDesktop) {
      setSnap('peek');
    }
    announce(
      `Choose a station on the map for your ${which === 'from' ? 'starting point' : 'destination'}. Press Escape to cancel.`,
    );
  };
  const onPick2 = () => {
    if (pickMode === 'meet') {
      setPickMode(null);
      return;
    }
    setPickMode('meet');
    if (!isDesktop) {
      setSnap('peek');
    }
    announce('Choose a station on the map for Person B. Press Escape to cancel.');
  };
  const expandSheet = useCallback(() => {
    if (!isDesktop) {
      setSnap((prev) => {
        if (prev === 'peek') {
          return 'half';
        }
        return prev;
      });
    }
  }, [isDesktop]);
  const onFit = useCallback(() => {
    if (itinerary) {
      mapRef.current?.showStations([...tripStationIds]);
    }
  }, [itinerary, tripStationIds]);
  const fitKey = itinerary ? `${from}>${to}>${optionIndex}>${service.day}${service.period}` : '';
  useEffect(() => {
    if (!fitKey) {
      return;
    }
    const timer = setTimeout(onFit, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the trip changes; onFit is recreated with it.
  }, [fitKey]);
  useEffect(() => {
    if (from && to && result) {
      if (result.status === 'ok' && itinerary) {
        const lineNames = itinerary.legs.map((leg) => net.lineById.get(leg.lineId).name).join(', then ');
        announce(
          `Route suggestion from ${nameOf(from)} to ${nameOf(to)}: ${itinerary.transfers === 0 ? 'direct' : plural(itinerary.transfers, 'transfer')}, ${lineNames}, about ${itinerary.rideMinutes} minutes riding.`,
        );
      } else {
        if (result.status === 'same-station') {
          announce('Start and destination are the same station.');
        } else if (result.status === 'no-route') {
          announce(
            result.ended
              ? `No regular train still to come connects ${nameOf(from)} and ${nameOf(to)} in this service.`
              : `No route between ${nameOf(from)} and ${nameOf(to)} in the selected service.`,
          );
        }
      }
    }
  }, [from, to, result, itinerary, announce]);
  useEffect(() => {
    if (selected) {
      mapRef.current?.ensureStationVisible(selected);
    }
  }, [selected, insets.bottom, insets.left]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (from) {
      params.set('from', from);
    }
    if (to) {
      params.set('to', to);
    }
    if (selected) {
      params.set('station', selected);
    }
    if (highlight) {
      params.set('line', highlight);
    }
    if (serviceOverride) {
      params.set('service', `${serviceOverride.day}:${serviceOverride.period}`);
    }
    if (mode === 'reach' || mode === 'replay' || mode === 'play') {
      params.set('mode', mode);
    }
    if (mode === 'reach' && origin) {
      params.set('origin', origin);
      if (origin2) {
        params.set('origin2', origin2);
      }
      params.set('within', String(horizon));
      params.set('wait', String(allowance));
      if (firstWait) {
        params.set('first', String(firstWait));
      }
    }
    const hash = params.toString();
    try {
      history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
    } catch {
      // Some embedded browsers block history updates; deep links are a nicety.
    }
  }, [from, to, selected, highlight, serviceOverride, mode, origin, origin2, horizon, allowance, firstWait]);
  useEffect(() => {
    // The app's own address updates use replaceState, which fires no hashchange. This only runs for a
    // link pasted or followed in a tab that already shows the app.
    const onHashChange = () => {
      const link = readHashState();
      setMode(startMode(link));
      setFrom(link.from);
      setTo(link.to);
      setSelected(link.station);
      setHighlight(link.line);
      setServiceOverride(link.service);
      setOrigin(link.origin);
      setOrigin2(link.origin2);
      setHorizon(link.within ?? DEFAULT_HORIZON);
      setAllowance(link.wait ?? DEFAULT_ALLOWANCE);
      setFirstWait(link.first ?? 0);
      setPickMode(null);
      setSnap((prev) => (prev === 'peek' ? 'half' : prev));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (
        event.key === '/' &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        if (!isDesktop) {
          setSnap((prev) => {
            if (prev === 'peek') {
              return 'half';
            }
            return prev;
          });
        }
        searchRef.current?.focus();
      } else if (event.key === 'Escape' && pickMode) {
        setPickMode(null);
        announce('Cancelled choosing a station on the map.');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickMode, isDesktop, announce]);
  const onLineClick = useCallback(
    (lineId) =>
      setHighlight((prev) => {
        if (prev === lineId) {
          return null;
        }
        return lineId;
      }),
    [],
  );
  const renderPickButton = (which) => (
    <button
      type="button"
      className={`icon-btn icon-btn-outline${pickMode === which ? ' is-on' : ''}`}
      aria-pressed={pickMode === which}
      aria-label={`Choose ${which === 'from' ? 'starting station' : 'destination'} on the map`}
      title="Choose on the map"
      onClick={() => {
        if (pickMode === which) {
          return setPickMode(null);
        }
        return startPicking(which);
      }}
    >
      <Icon name="target" size={18} />
    </button>
  );
  const showTrip = mode === 'trip' && from && to;
  const onPlan = (fromId, toId) => {
    setFrom(fromId);
    setTo(toId);
    setSelected(null);
    setMode('trip');
    afterPaint(() => mapRef.current?.ensureStationVisible(fromId));
    announce(`Trip from ${nameOf(fromId)} to ${nameOf(toId)}.`);
  };
  const panelContent =
    mode === 'reach' ? (
      <ReachPanel
        net={net}
        service={service}
        nowService={nowService}
        usingNow={!serviceOverride}
        onService={setServiceOverride}
        origin={origin}
        onOrigin={setOrigin}
        horizon={horizon}
        onHorizon={setHorizon}
        allowance={allowance}
        onAllowance={setAllowance}
        firstWait={firstWait}
        onFirstWait={setFirstWait}
        origin2={origin2}
        onOrigin2={setOrigin2}
        picking2={pickMode === 'meet'}
        onPick2={onPick2}
        meeting={meeting}
        reach={reachA}
        searchRef={searchRef}
        onExpand={expandSheet}
        onPlan={onPlan}
      />
    ) : mode === 'replay' ? (
      <ReplayPanel
        net={net}
        clock={clock}
        day={replayDay}
        onDay={setReplayDay}
        followId={followId}
        onFollow={followTrain}
        lineFilter={lineFilter}
        onLineFilter={setLineFilter}
        nowMinute={nowMinute}
        todayDay={nowService.day}
      />
    ) : mode === 'play' ? (
      <GamesPanel
        net={net}
        onView={setGameView}
        pickRef={pickRef}
        onFit={() => mapRef.current?.fit()}
        onShow={(event) => mapRef.current?.showStations(event)}
        onFocusMap={() => mapRef.current?.focusMap()}
      />
    ) : selected ? (
      <StationCard
        net={net}
        stationId={selected}
        service={service}
        from={from}
        to={to}
        alerts={alertsAt(selected)}
        onStart={() => setEndpoint('from', selected)}
        onGo={() => setEndpoint('to', selected)}
        onClose={closeStation}
        onOpenAlerts={() => setDialog('alerts')}
        backLabel={showTrip ? 'Back to route' : undefined}
      />
    ) : showTrip && result ? (
      <TripPanel
        net={net}
        service={service}
        from={from}
        to={to}
        result={result}
        index={Math.min(optionIndex, Math.max(0, itineraries.length - 1))}
        onIndex={setOptionIndex}
        onStation={(event) => selectStation(event)}
        onService={setServiceOverride}
        onSwap={swapEnds}
        onClear={onClear}
        onFit={onFit}
        systemAlerts={systemAlertCount}
        taggedAlerts={taggedAlerts}
        onOpenAlerts={() => setDialog('alerts')}
        alertsUnavailable={state.kind === 'error' && !state.lastGood}
      />
    ) : (
      <>
        {mode === 'trip' && (
          <p className="hint" role="note">
            <Icon name="route" size={18} />
            <span>
              {!from && !to
                ? 'Choose where you’re starting and where you’re going — type a station or use the target button to pick it on the map.'
                : from
                  ? 'Now choose your destination.'
                  : 'Now choose your starting station.'}
            </span>
          </p>
        )}
        <LinesCard
          net={net}
          service={service}
          nowService={nowService}
          usingNow={!serviceOverride}
          highlight={highlight}
          onHighlight={setHighlight}
          onService={setServiceOverride}
        />
      </>
    );
  const renderFooter = (className) => (
    <footer className={className}>
      {scheduleEnded && (
        <p>
          <strong>This timetable ended on {formatDate(scheduleEnd)}.</strong>
          {' Routes, times and fares here may be out of date. Check '}
          <ExternalLink href={net.data.meta.agency.url}>bart.gov</ExternalLink>
          {' before you travel.'}
        </p>
      )}
      <p>
        {'Unofficial — not affiliated with BART. Data checked '}
        {formatDate(net.data.meta.lastVerified)}; schedule-based, no live arrivals.{' '}
        <button type="button" className="link" onClick={() => setDialog('about')}>
          {'Sources & limits'}
        </button>
      </p>
    </footer>
  );
  const modeOwnsMap = mode === 'reach' || mode === 'replay' || mode === 'play';
  const alertCount = alertPayload?.alerts.length ?? 0;
  const alertsLabel =
    state.kind === 'loading'
      ? 'Service alerts, loading'
      : state.kind === 'error' && !state.lastGood
        ? 'Service alerts, unavailable'
        : alertCount === 0
          ? 'Service alerts, none listed'
          : `Service alerts, ${plural(alertCount, 'alert')} listed`;
  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const themeIcon = theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto';
  return (
    <div className="app" style={{ '--sheet-h': `${sheetHeight}px` }}>
      <a
        href="#panel-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          return document.getElementById('panel-content')?.focus();
        }}
      >
        Skip to search and details
      </a>
      <div ref={safeProbeRef} className="safe-probe" aria-hidden="true" />
      <main className="map-region" aria-label="Map">
        <TransitMap
          ref={mapRef}
          net={net}
          geography={geography}
          service={service}
          selected={modeOwnsMap ? null : selected}
          from={mode === 'play' ? gameView.from : mode === 'trip' ? from : null}
          to={mode === 'play' ? gameView.to : mode === 'trip' ? to : null}
          highlightLine={modeOwnsMap ? null : highlight}
          itinerary={mode === 'play' ? gameView.itinerary : showTrip && itinerary ? itinerary : null}
          pickMode={pickMode}
          reach={reach}
          replay={replay}
          game={game}
          insets={insets}
          onStationClick={onStationClick}
          onLineClick={onLineClick}
          onBackgroundClick={closeStation}
        />
        {pickMode && (
          <div className="pick-banner" role="status" data-map-blocker>
            <Icon name="target" size={18} />
            <span>
              {'Choose a station on the map for '}
              {pickMode === 'from'
                ? 'your starting point'
                : pickMode === 'to'
                  ? 'your destination'
                  : 'Person B'}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPickMode(null)}>
              Cancel
            </button>
          </div>
        )}
        <MapControls
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onFit={() => mapRef.current?.fit()}
          onReset={onReset}
          resetEnabled
        />
      </main>
      <div className="mobile-brand" aria-hidden="true" data-map-blocker>
        <svg viewBox="0 0 32 32" width="28" height="28">
          <rect width="32" height="32" rx="8" fill="var(--ink)" />
          <path
            d="M6 22 14 22 20 12 26 12"
            fill="none"
            stroke="#FF9933"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 17 14 17 20 7 26 7"
            fill="none"
            stroke="#0099CC"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Bay Lines
      </div>
      <nav className="toolbar" data-map-blocker aria-label="Alerts, station list, theme and about">
        <button
          type="button"
          className={`tool${state.kind === 'error' && !state.lastGood ? ' tool-warn' : ''}`}
          onClick={() => setDialog('alerts')}
          aria-label={alertsLabel}
        >
          <Icon name="alert" size={20} />
          <span className="tool-label">Alerts</span>
          {alertCount > 0 && (
            <span className="badge-count" aria-hidden="true">
              {alertCount}
            </span>
          )}
          {state.kind === 'error' && !state.lastGood && (
            <span className="badge-count badge-warn" aria-hidden="true">
              !
            </span>
          )}
        </button>
        <button
          type="button"
          className="tool"
          onClick={() => setDialog('stations')}
          aria-label="All stations, as a list"
        >
          <Icon name="list" size={20} />
          <span className="tool-label">Stations</span>
        </button>
        <button
          type="button"
          className="tool"
          onClick={() => setTheme(nextTheme)}
          aria-label={`Colour theme: ${theme}. Switch to ${nextTheme}.`}
          title={`Theme: ${theme}`}
        >
          <Icon name={themeIcon} size={20} />
        </button>
        <button
          type="button"
          className="tool"
          onClick={() => setDialog('about')}
          aria-label="About this map, data sources and limitations"
        >
          <Icon name="info" size={20} />
          <span className="tool-label">About</span>
        </button>
      </nav>
      <Panel isDesktop={isDesktop} snap={snap} onSnap={setSnap} panelRef={panelRef}>
        <header className="panel-head">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" width="30" height="30">
              <rect width="32" height="32" rx="8" fill="var(--ink)" />
              <path
                d="M6 22 14 22 20 12 26 12"
                fill="none"
                stroke="#FF9933"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 17 14 17 20 7 26 7"
                fill="none"
                stroke="#0099CC"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h1>Bay Lines</h1>
              <p>Unofficial Bay Area transit map</p>
            </div>
          </div>
          <div className="mode" role="group" aria-label="What would you like to do?">
            <button type="button" aria-pressed={mode === 'explore'} onClick={() => changeMode('explore')}>
              Explore
            </button>
            <button
              type="button"
              aria-pressed={mode === 'trip'}
              aria-label="Plan a trip"
              onClick={() => changeMode('trip')}
            >
              Trip
            </button>
            <button
              type="button"
              aria-pressed={mode === 'reach'}
              aria-label="Reach: how far can I get?"
              onClick={() => changeMode('reach')}
            >
              Reach
            </button>
            <button
              type="button"
              aria-pressed={mode === 'replay'}
              aria-label="Replay: watch the timetable"
              onClick={() => changeMode('replay')}
            >
              Replay
            </button>
            <button
              type="button"
              aria-pressed={mode === 'play'}
              aria-label="Play: games"
              onClick={() => changeMode('play')}
            >
              Play
            </button>
          </div>
          {mode === 'explore' ? (
            <StationSearch
              net={net}
              label="Search stations"
              hideLabel
              placeholder="Search stations, e.g. Embarcadero or SFO"
              value={selected}
              inputRef={searchRef}
              onFocusInput={expandSheet}
              onSelect={(event) => selectStation(event)}
              onClear={closeStation}
            />
          ) : mode === 'trip' ? (
            <div className="planner">
              <StationSearch
                net={net}
                label="From"
                hideLabel
                placeholder="Starting station"
                value={from}
                inputRef={searchRef}
                onFocusInput={expandSheet}
                leading={
                  <span className="pin-dot" aria-hidden="true">
                    A
                  </span>
                }
                trailing={renderPickButton('from')}
                onSelect={(event) => setEndpoint('from', event)}
                onClear={() => setFrom(null)}
              />
              <div className="swap-row">
                <button
                  type="button"
                  className="icon-btn icon-btn-outline"
                  onClick={swapEnds}
                  disabled={!from && !to}
                  aria-label="Swap start and destination"
                >
                  <Icon name="swap" size={18} />
                </button>
              </div>
              <StationSearch
                net={net}
                label="To"
                hideLabel
                onFocusInput={expandSheet}
                placeholder="Destination"
                value={to}
                leading={
                  <span className="pin-dot pin-dot-b" aria-hidden="true">
                    B
                  </span>
                }
                trailing={renderPickButton('to')}
                onSelect={(event) => setEndpoint('to', event)}
                onClear={() => setTo(null)}
              />
            </div>
          ) : null}
        </header>
        <div className="panel-scroll" id="panel-content" tabIndex={-1}>
          {panelContent}
          {renderFooter('foot-inline')}
        </div>
        {renderFooter('panel-foot')}
      </Panel>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Dialog
        open={dialog === 'alerts'}
        title="Service alerts"
        onClose={() => setDialog(null)}
        description="From BART’s official alerts feed."
      >
        <AlertsPanel
          net={net}
          state={state}
          onRefresh={() => void refresh()}
          onStation={(event) => {
            setDialog(null);
            selectStation(event);
          }}
        />
      </Dialog>
      <Dialog
        open={dialog === 'stations'}
        title="All stations"
        onClose={() => setDialog(null)}
        description="Pick a station to see its details, then set it as your start or destination."
      >
        <StationList
          net={net}
          onPick={(event) => {
            setDialog(null);
            if (pickMode) {
              onStationClick(event);
            } else {
              selectStation(event);
            }
          }}
        />
      </Dialog>
      <Dialog
        open={dialog === 'about'}
        title="About this map"
        onClose={() => setDialog(null)}
        className="dialog-wide"
      >
        <AboutContent net={net} geographyAttribution={geography?.attribution} today={today} />
      </Dialog>
    </div>
  );
}
