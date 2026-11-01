import { Foot, Header } from "./parts";
import { HOME_VIEWS, HomeBody } from "./home";
import { messageFor } from "./messages";
import type { PopupActions, PopupModel } from "./types";
import { usePickers } from "./usePickers";

/** The popup: a message view (setup, connection and page problems) or the player views, inside the shared header and footer. */
export function PopupScreen({ m, a }: { m: PopupModel; a: PopupActions }) {
  const pickers = usePickers((HOME_VIEWS as readonly string[]).includes(m.view));
  const message = messageFor(m, a);
  return (
    <div className="lm pp" data-view={m.view}>
      <Header view={m.view} engine={m.engine} onOptions={a.options} />
      <div className="pp-body">{message ? message.body : <HomeBody m={m} a={a} pickers={pickers} />}</div>
      {message ? message.foot : <Foot onRight={a.openApp} />}
    </div>
  );
}
