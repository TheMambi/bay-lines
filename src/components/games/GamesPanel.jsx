import { useCallback, useEffect, useMemo, useState } from 'react';
import { GuessTheRide } from './GuessTheRide';
import { StationSprint } from './StationSprint';
import { EMPTY_GAME, readBest } from '../../lib/games';
import { pacificDate } from '../../lib/time';

export function GamesPanel(props) {
  const [game, setGame] = useState(null);
  const [bests, setBests] = useState(readBest);
  const [setKind, setSetKind] = useState('today');
  const date = useMemo(() => pacificDate(), []);
  const { onView } = props;
  const onExit = useCallback(() => {
    setGame(null);
    setBests(readBest());
    onView(EMPTY_GAME);
    props.pickRef.current = null;
    props.onFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onFit and pickRef are read when the game exits, not captured.
  }, [onView]);
  useEffect(
    () => () => {
      props.pickRef.current = null;
      onView(EMPTY_GAME);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup runs once, when the games panel unmounts.
    [],
  );
  if (game === 'sprint') {
    return (
      <StationSprint {...props} onExit={onExit} best={bests.sprint} daily={setKind === 'today'} date={date} />
    );
  }
  if (game === 'guess') {
    return (
      <GuessTheRide {...props} onExit={onExit} best={bests.guess} daily={setKind === 'today'} date={date} />
    );
  }
  return (
    <section aria-labelledby="play-title" className="lens">
      <h2 id="play-title" className="card-title card-title-sm">
        Two quick games
      </h2>
      <p className="fine">
        Both are played on BART’s real map and real schedule. Scores stay on this device.
      </p>
      <div className="lens-field">
        <span className="field-label" id="set-label">
          Which stations and trips?
        </span>
        <div className="seg" role="group" aria-labelledby="set-label">
          <button type="button" aria-pressed={setKind === 'today'} onClick={() => setSetKind('today')}>
            Today’s set
          </button>
          <button type="button" aria-pressed={setKind === 'random'} onClick={() => setSetKind('random')}>
            A random set
          </button>
        </div>
        <p className="fine">
          {setKind === 'today'
            ? `Everyone who plays on ${date} (Pacific time) gets the same questions, so you can compare scores. A new set arrives tomorrow.`
            : 'A fresh set of questions every time.'}
        </p>
      </div>
      <div className="game-cards">
        <button
          type="button"
          className="game-card"
          onClick={() => {
            props.onFit();
            return setGame('sprint');
          }}
        >
          <span className="game-title">Station Sprint</span>
          <span className="game-blurb">
            {'The names are gone. Find '}
            {10}
            {' stations on the map, fast.'}
          </span>
          <span className="game-best">
            {bests.sprint ? `Your best: ${bests.sprint} of 1000` : 'No score yet'}
          </span>
        </button>
        <button type="button" className="game-card" onClick={() => setGame('guess')}>
          <span className="game-title">Guess the Ride</span>
          <span className="game-blurb">
            {'How many minutes does the train take? '}
            {8}
            {' trips, then see the schedule’s answer.'}
          </span>
          <span className="game-best">
            {bests.guess ? `Your best: ${bests.guess} of 800` : 'No score yet'}
          </span>
        </button>
      </div>
      <p className="fine">
        Station Sprint is a visual game: names are hidden on the map, so it can’t be played with a screen
        reader. Guess the Ride works with one.
      </p>
    </section>
  );
}
