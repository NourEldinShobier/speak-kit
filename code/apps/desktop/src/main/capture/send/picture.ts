import { nativeImage } from "electron";
import { fitJpeg, sendSize } from "../../screen-vision/plan";
import type { Bundle } from "../bundle";
import type { CaptureRecord } from "../store";
import { coverFile, type Picture } from "./look";

/** The picture of a capture as the voice chat gets it: its cover, shrunk until the JPEG fits the data channel. */
export function pictureReader(bundle: () => Bundle): (r: CaptureRecord) => Promise<Picture | undefined> {
  return async (r) => {
    const file = coverFile(r);
    const buf = file ? await bundle().readFile(r.dir, file) : undefined;
    const image = buf?.length ? nativeImage.createFromBuffer(buf) : undefined;
    if (!image || image.isEmpty()) return undefined;
    const size = image.getSize();
    const fit = fitJpeg(sendSize(size.width, size.height), (width, height, quality) => image.resize({ width, height, quality: "good" }).toJPEG(quality));
    return fit && { base64: Buffer.from(fit.jpeg).toString("base64"), width: fit.width, height: fit.height };
  };
}
