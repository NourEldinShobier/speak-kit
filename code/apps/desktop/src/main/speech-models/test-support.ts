import * as v from "valibot";
import { EnginesConfigSchema } from "../../shared/speech-models/config";

/** The engines section of config.json as the app parses it. */
export const parseEnginesConfig = (raw: unknown) => v.parse(EnginesConfigSchema, raw);
