import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { LineChip } from '../LineChip';
import { RangeField } from '../RangeField';
import { CopyScore } from './CopyScore';
import { plural } from '../../lib/format';
import {
  WEEKDAY_DAY,
  dailySeed,
  guessPoints,
  guessVerdict,
  pickTrips,
  randomSeed,
  recordBest,
  shareText,
} from '../../lib/games';
import { planTrips } from '../../lib/routing';

export function GuessTheRide({ net, onView, onExit, best, onShow, daily, date }) {
  const [isDaily, setIsDaily] = useState(daily);
  const [seed, setSeed] = useState(() => {
    if (daily) {
      return dailySeed(date, 'guess');
    }
    return randomSeed();
  });
  const trips = useMemo(() => pickTrips(net, seed), [net, seed]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState('ask');
  const [guess, setGuess] = useState(30);
  const [points, setPoints] = useState([]);
  const [bestResult, setBestResult] = useState(null);
  const nextRef = useRef(null);
  const sliderRef = useRef(null);
  const nameOf = (id) => net.stationById.get(id)?.name ?? id;
  const trip = trips[round];
  const score = points.reduce((acc, item) => acc + item, 0);
  const answerTrip = useMemo(() => {
    if (!trip) {
      return null;
    }
    const plan = planTrips(net, WEEKDAY_DAY, trip.from, trip.to);
    if (plan.status === 'ok') {
      return plan.itineraries[0];
    }
    return null;
  }, [net, trip]);
  useEffect(() => {
    if (trip) {
      onView({
        hideNames: false,
        marks: new Map(),
        from: trip.from,
        to: trip.to,
        itinerary: phase === 'result' ? answerTrip : null,
      });
    }
  }, [trip, phase, answerTrip, onView]);
  useEffect(() => {
    if (!trip) {
      return;
    }
    const timer = setTimeout(
      () =>
        onShow(
          phase === 'result' && answerTrip
            ? [...new Set(answerTrip.legs.flatMap((leg) => leg.stops))]
            : [trip.from, trip.to],
        ),
      60,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- move the camera only when the trip or phase changes.
  }, [trip, phase]);
  useEffect(() => {
    if (phase === 'result') {
      nextRef.current?.focus();
    }
  }, [phase]);
  const lockIn = () => {
    setPoints((prev) => [...prev, guessPoints(guess, trip.minutes)]);
    setPhase('result');
  };
  const next = () => {
    if (round + 1 >= trips.length) {
      setPhase('done');
      setBestResult(recordBest('guess', score));
      return;
    }
    setRound(round + 1);
    setPhase('ask');
    requestAnimationFrame(() => sliderRef.current?.querySelector('input')?.focus());
  };
  const restart = () => {
    setIsDaily(false);
    setSeed(randomSeed());
    setRound(0);
    setPoints([]);
    setBestResult(null);
    setPhase('ask');
  };
  if (phase === 'done') {
    return (
      <section aria-labelledby="guess-title" className="lens">
        <h2 id="guess-title" className="card-title card-title-sm">
          Guess the Ride: finished
        </h2>
        {isDaily && (
          <p className="fine">
            {'Today’s set, '}
            {date}.
          </p>
        )}
        <p className="score-big" role="status">
          {score}{' '}
          <span>
            {'of '}
            {800}
          </span>
        </p>
        {bestResult && (
          <p className="fine">
            {bestResult.isNew && score === bestResult.best
              ? 'New personal best on this device.'
              : `Your best on this device: ${bestResult.best}.`}
          </p>
        )}
        <CopyScore
          text={shareText(
            'Guess the Ride',
            isDaily ? { kind: 'today', date } : { kind: 'random' },
            score,
            800,
            points,
          )}
        />
        <ol className="result-list">
          {trips.map((entry, index) => (
            <li key={index}>
              <span>
                {nameOf(entry.from)}
                {' to '}
                {nameOf(entry.to)}
                {': '}
                {entry.minutes}
                {' min'}
              </span>
              <span>+{points[index] ?? 0}</span>
            </li>
          ))}
        </ol>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={restart}>
            Play again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            All games
          </button>
        </div>
      </section>
    );
  }
  const verdict = phase === 'result' ? guessVerdict(guess, trip.minutes) : null;
  return (
    <section aria-labelledby="guess-title" className="lens">
      <h2 id="guess-title" className="card-title card-title-sm">
        Guess the Ride
      </h2>
      <p className="game-progress">
        {'Trip '}
        {round + 1}
        {' of '}
        {trips.length}
        {' · '}
        {score}
        {' points'}
      </p>
      <div aria-live="polite" className="game-prompt">
        <span className="pin-dot" aria-hidden="true">
          A
        </span>{' '}
        <strong>{nameOf(trip.from)}</strong> <span className="game-to">to</span>{' '}
        <span className="pin-dot pin-dot-b" aria-hidden="true">
          B
        </span>{' '}
        <strong>{nameOf(trip.to)}</strong>
      </div>
      <div ref={sliderRef}>
        <RangeField
          label="How many minutes on the train?"
          valueText={`${guess} minutes`}
          min={5}
          max={100}
          value={guess}
          onChange={setGuess}
          disabled={phase !== 'ask'}
          hint="Time on the train only, weekday daytime schedule. Waiting and walking don’t count."
        />
      </div>
      {phase === 'ask' ? (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={lockIn}>
            Lock in my guess
          </button>
        </div>
      ) : (
        <>
          <div className="guess-result" role="status">
            <p>
              <strong>
                {trip.minutes}
                {' minutes'}
              </strong>
              {' on the schedule. Your guess was '}
              {verdict}
              {verdict === 'spot on'
                ? '!'
                : ` (${Math.abs(guess - trip.minutes)} min ${guess > trip.minutes ? 'over' : 'under'}).`}{' '}
              <strong>+{points[round]}</strong>
            </p>
            {answerTrip && (
              <p className="fine">
                {answerTrip.transfers === 0 ? 'Direct' : plural(answerTrip.transfers, 'transfer')}
                {', '}
                {plural(answerTrip.stopCount, 'stop')}:{' '}
                {answerTrip.legs.map((leg, index) => (
                  <span key={index}>
                    {index > 0 && ' then '}
                    <LineChip line={net.lineById.get(leg.lineId)} size="sm" />
                  </span>
                ))}
              </p>
            )}
          </div>
          <div className="btn-row">
            <button ref={nextRef} type="button" className="btn btn-primary" onClick={next}>
              {round + 1 >= trips.length ? 'See my score' : 'Next trip'} <Icon name="arrow" size={16} />
            </button>
          </div>
        </>
      )}
      <div className="btn-row btn-row-tight">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onExit}>
          Quit game
        </button>
      </div>
      {best > 0 && (
        <p className="fine">
          {'Your best: '}
          {best}.
        </p>
      )}
    </section>
  );
}
