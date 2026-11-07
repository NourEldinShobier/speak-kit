import type { ReactNode } from "react";
import { Button, Logo, Stepper } from "@speakkit/ui";
import { STEPS } from "./model";

/** Setup window (Lumen X9-X14): title bar 32, stepper 52, 720 px column, footer 64 with Back left and the primary action right. */
export function Frame({ at, title, sub, foot, children, center }: { at: number; title: string; sub: ReactNode; foot: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className="sk-setup">
      <div className="sk-setup__title">
        <Logo size={20} />
        Set up Speak Kit
      </div>
      <div className="sk-setup__stepper">
        <Stepper steps={[...STEPS]} current={at} />
      </div>
      <div className="sk-setup__scroll">
        <div className="sk-setup__col">
          {center && (
            <div className="sk-center">
              <Logo size={72} />
            </div>
          )}
          <h1 style={center ? { textAlign: "center", fontSize: 28 } : undefined}>{title}</h1>
          <p style={center ? { textAlign: "center" } : undefined}>{sub}</p>
          {children}
        </div>
      </div>
      <div className="sk-setup__foot">{foot}</div>
    </div>
  );
}

export const Foot = ({ back, children }: { back?: ReactNode; children: ReactNode }) => (
  <>
    <div>{back}</div>
    <div>{children}</div>
  </>
);

export const Back = ({ onClick, label = "Back" }: { onClick(): void; label?: string }) => (
  <Button variant="ghost" iconLeft="arrow-left" onClick={onClick}>
    {label}
  </Button>
);
