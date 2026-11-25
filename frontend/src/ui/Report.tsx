// Reporting a problem, inside Settings: what happened, an email to answer to if the person wants
// one, and what they have open (App describes it). It is sent to a form service, which passes
// it on by email; the address it goes to is set there, not here, so it is nowhere in the app.
// The service is Web3Forms; the key of the form is the line VITE_REPORT_KEY=<key> in
// frontend/.env.local, or the secret of the same name when the site is built on GitHub. The key
// is public by design - it only says which form a report belongs to.
// Without it the form says reporting is not set up.

import { useState } from "react";
import { useWords } from "./language";

const REPORT_URL = "https://api.web3forms.com/submit";
const REPORT_KEY: string | undefined = import.meta.env.VITE_REPORT_KEY;
const MAX_TEXT = 2000; // characters: a report, not a letter
const MAX_CONTACT = 254; // the longest an email address can be

type Props = {
  context: string; // what is open: the mode, the line or the journey, the time
  onBack: () => void;
};

type State = "writing" | "sending" | "sent" | "failed";

export default function Report({ context, onBack }: Props) {
  const w = useWords();
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<State>("writing");
  const [why, setWhy] = useState(""); // what the service said when it did not take the report

  async function send() {
    if (!REPORT_KEY || !text.trim()) return;
    setState("sending");
    try {
      const response = await fetch(REPORT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: REPORT_KEY,
          subject: "ŠalinaGO: a problem was reported",
          from_name: "ŠalinaGO",
          message: text.trim(),
          email: contact.trim() || undefined,
          context,
        }),
      });
      // the service answers 200 only when it took the report, and says why when it did not
      const answer = await response.json().catch(() => null);
      if (response.ok && answer?.success !== false) {
        setState("sent");
      } else {
        setWhy(answer?.message ?? `HTTP ${response.status}`);
        setState("failed");
      }
    } catch (error) {
      setWhy(error instanceof Error ? error.message : "");
      setState("failed");
    }
  }

  if (state === "sent") {
    return (
      <section className="report">
        <p className="report-done">{w.reportSent}</p>
        <button className="report-back" onClick={onBack}>
          {w.back}
        </button>
      </section>
    );
  }

  return (
    <section className="report">
      <h2>{w.report}</h2>
      <p className="report-intro">{w.reportIntro}</p>
      <textarea
        className="report-text"
        aria-label={w.reportWhat}
        placeholder={w.reportWhat}
        rows={4}
        maxLength={MAX_TEXT}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <input
        className="report-contact"
        type="email"
        maxLength={MAX_CONTACT}
        aria-label={w.reportContact}
        placeholder={w.reportContact}
        value={contact}
        onChange={(event) => setContact(event.target.value)}
      />
      <p className="report-note">{REPORT_KEY ? w.reportAttached : w.reportOff}</p>
      {state === "failed" ? (
        <p className="report-failed">
          {w.reportFailed}
          {why ? <span className="report-why">{why}</span> : null}
        </p>
      ) : null}
      <div className="report-actions">
        <button className="report-back" onClick={onBack}>
          {w.back}
        </button>
        <button
          className="search report-send"
          onClick={send}
          disabled={!REPORT_KEY || !text.trim() || state === "sending"}
        >
          {state === "sending" ? w.sending : w.send}
        </button>
      </div>
    </section>
  );
}
