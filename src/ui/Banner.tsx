import { Fragment } from "react";
import type { Banner as BannerState } from "../app/store";

/** 36px strip under the mode bar. Never takes focus. */
export function Banner({ banner }: { banner: BannerState }) {
  return (
    <div className="banner" role="status">
      <span className="banner-text">{banner.text}</span>
      {banner.actions?.map((action) => (
        <Fragment key={action.label}>
          <span className="sep">·</span>
          <button className="link" onClick={action.run}>
            {action.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
