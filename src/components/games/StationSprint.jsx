import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { CopyScore } from './CopyScore';
import { plural } from '../../lib/format';
import {
  dailySeed,
  pickStations,
  randomSeed,
  recordBest,
  shareText,
  sprintPoints,
  stopsBetween,
} from '../../lib/games';

export function StationSprint({ net, onView, pickRef, onExit, best, onFocusMap, daily, date }) {
  const [isDaily, setIsDaily] = useState(daily);
  const [seed, setSeed] = useState(() => {
    if (daily) {
      return dailySeed(date, 'sprint');
    }
    return randomSeed();
  });
  const targets = useMemo(() => pickStations(net, seed), [net, seed]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState('ask');
  const [timed, setTimed] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(12);
  const [outcome, setOutcome] = useState(null);
  const [results, setResults] = useState([]);
  const [bestResult, setBestResult] = useState(null);
  const startedAtRef = useRef(0);
  const nextRef = useRef(null);
  const nameOf = (id) => net.stationById.get(id)?.name ?? id;
  const target = targets[round];
  const score = results.reduce((acc, item) => acc + item.points, 0);
  const answer = useCallback(
    (picked) => {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      const correct = picked === target;
      const points = correct ? (timed ? sprintPoints(true, seconds) : 70) : 0;
      let note;
      if (correct) {
        note = `Yes, that’s ${nameOf(target)}.`;
      } else if (!picked) {
        note = `Time’s up. It was ${nameOf(target)}.`;
      } else {
        const stops = stopsBetween(net, picked, target);
        note = `That’s ${nameOf(picked)}. ${nameOf(target)} is ${stops == null ? 'somewhere else' : `${plural(stops, 'stop')} away`}.`;
      }
      setOutcome({ picked, correct, points, note });
      setResults((prev) => [...prev, { id: target, points }]);
      setPhase('result');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf only reads net, which is already listed.
    [target, timed, net],
  );
  useEffect(() => {
    if (phase !== 'ask') {
      return;
    }
    startedAtRef.current = performance.now();
    setSecondsLeft(12);
    if (!timed) {
      return;
    }
    const timer = setInterval(() => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      setSecondsLeft(Math.max(0, Math.ceil(12 - elapsed)));
      if (elapsed >= 12) {
        answer(null);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [phase, round, timed, answer]);
  useEffect(() => {
    pickRef.current = (stationId) => {
      if (phase === 'ask') {
        answer(stationId);
      }
    };
    return () => {
      pickRef.current = null;
    };
  }, [phase, answer, pickRef]);
  useEffect(() => {
    const marks = new Map();
    if (phase === 'result' && outcome) {
      if (outcome.correct) {
        marks.set(target, 'right');
      } else {
        if (outcome.picked) {
          marks.set(outcome.picked, 'wrong');
        }
        marks.set(target, 'answer');
      }
    }
    onView({ hideNames: phase !== 'done', marks, from: null, to: null, itinerary: null });
  }, [phase, outcome, target, onView]);
  useEffect(() => {
    if (phase === 'result') {
      nextRef.current?.focus();
    }
  }, [phase]);
  if (phase === 'done') {
    return (
      <section aria-labelledby="sprint-title" className="lens">
        <h2 id="sprint-title" className="card-title card-title-sm">
          Station Sprint: finished
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
            {1000}
          </span>
        </p>
        {timed ? (
          bestResult && (
            <p className="fine">
              {bestResult.isNew && score === bestResult.best
                ? 'New personal best on this device.'
                : `Your best on this device: ${bestResult.best}.`}
            </p>
          )
        ) : (
          <p className="fine">Untimed games don’t count towards your best.</p>
        )}
        <CopyScore
          text={shareText(
            timed ? 'Station Sprint' : 'Station Sprint (untimed)',
            isDaily ? { kind: 'today', date } : { kind: 'random' },
            score,
            1000,
            results.map((result) => result.points),
          )}
        />
        <ol className="result-list">
          {results.map((result, key) => (
            <li key={key}>
              <span>{nameOf(result.id)}</span>
              <span>{result.points ? `+${result.points}` : 'missed'}</span>
            </li>
          ))}
        </ol>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setIsDaily(false);
              setSeed(randomSeed());
              setRound(0);
              setResults([]);
              setOutcome(null);
              setBestResult(null);
              setPhase('ask');
            }}
          >
            Play again
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            All games
          </button>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="sprint-title" className="lens">
      <h2 id="sprint-title" className="card-title card-title-sm">
        Station Sprint
      </h2>
      <p className="game-progress">
        {'Round '}
        {round + 1}
        {' of '}
        {targets.length}
        {' · '}
        {score}
        {' points'}
      </p>
      <div aria-live="polite" className="game-prompt">
        {phase === 'ask' ? (
          <>
            {'Find '}
            <strong>{nameOf(target)}</strong>
            {' on the map'}
          </>
        ) : (
          <div>
            <strong>{outcome?.correct ? `+${outcome.points} points` : 'No points'}</strong>
            <span className="game-note">{outcome?.note}</span>
          </div>
        )}
      </div>
      {phase === 'ask' && (
        <>
          {timed ? (
            <div className="timer" role="timer" aria-label={`${secondsLeft} seconds left`}>
              <span className="timer-bar" aria-hidden="true" style={{ '--left': secondsLeft / 12 }} />
              <span aria-hidden="true">
                {secondsLeft}
                {' s'}
              </span>
            </div>
          ) : (
            <p className="fine">Untimed: a right answer is worth 70 points.</p>
          )}
          <p className="fine">
            Tap or click a station. With a keyboard, use Tab and the arrow keys to move between stations and
            Enter to choose.
          </p>
        </>
      )}
      {phase === 'result' && (
        <div className="btn-row">
          <button
            ref={nextRef}
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (round + 1 >= targets.length) {
                setPhase('done');
                if (timed) {
                  setBestResult(recordBest('sprint', score));
                }
                return;
              }
              setRound(round + 1);
              setOutcome(null);
              setPhase('ask');
              onFocusMap();
            }}
          >
            {round + 1 >= targets.length ? 'See my score' : 'Next station'} <Icon name="arrow" size={16} />
          </button>
        </div>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={!timed}
          disabled={round > 0 || phase !== 'ask'}
          onChange={(event) => {
            setTimed(!event.target.checked);
          }}
        />
        Take your time (no timer)
      </label>
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
