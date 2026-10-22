"use client";

import type { Dispatch } from "react";
import type { PlaygroundAction, PlaygroundEvent } from "./store";

/**
 * Logs what `onSuccess` and `onFailure` report, newest first so a long
 * test run needs no scrolling.
 */
export function EventLog({
  events,
  dispatch,
}: {
  events: PlaygroundEvent[];
  dispatch: Dispatch<PlaygroundAction>;
}) {
  return (
    <section className="pg-log" aria-label="Event log">
      <header className="pg-log__header">
        <h3 className="pg-log__title">Event log</h3>
        <div className="pg-log__meta">
          <span className="pg-log__count">{events.length}</span>
          <button
            type="button"
            className="pg-log__clear"
            onClick={() => dispatch({ type: "CLEAR_LOG" })}
            disabled={events.length === 0}
          >
            Clear
          </button>
        </div>
      </header>

      <ol className="pg-log__list" aria-live="polite">
        {events.length === 0 ? (
          <li className="pg-log__empty">
            No events yet. Connect a wallet and run a transfer to fill the log.
          </li>
        ) : (
          events.map((event) => (
            <li key={event.id} className="pg-log__item" data-kind={event.kind}>
              <time className="pg-log__time">
                {new Date(event.at).toLocaleTimeString()}
              </time>
              <span className="pg-log__kind" data-kind={event.kind}>
                {event.kind}
              </span>
              <span className="pg-log__label">{event.label}</span>
              {event.detail ? (
                <span className="pg-log__detail">{event.detail}</span>
              ) : null}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
